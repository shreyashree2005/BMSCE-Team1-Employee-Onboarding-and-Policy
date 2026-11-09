"""Policy Assistant status: provider connection checks and readiness states.

MOCK TESTS: the AI provider is an ``httpx.MockTransport``; no network request is made. The live-provider test is
``tests/test_live_llm.py`` (opt-in).
"""

from collections.abc import Callable, Iterator

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.db.models import PolicyDocumentRecord
from app.main import create_app
from app.services.llm.provider import OpenAICompatibleProvider
from tests.conftest import CSRF_HEADERS, EMPLOYEE_EMAIL, HR_EMAIL, SignedInClient, login, make_settings
from tests.policy_samples import LEAVE_POLICY

SECRET = "sk-test-secret-value-1234567890"
STATUS = "/api/v1/policies/assistant/status"


def provider(handler: Callable[[httpx.Request], httpx.Response], *, model: str = "gpt-4o-mini", key: str | None = SECRET) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key=SecretStr(key) if key else None,
        model=model,
        base_url="https://llm.example.com/v1",
        timeout_seconds=10,
        temperature=0.1,
        max_tokens=100,
        transport=httpx.MockTransport(handler),
    )


def models_response(*ids: str) -> Callable[[httpx.Request], httpx.Response]:
    return lambda request: httpx.Response(200, json={"object": "list", "data": [{"id": i, "object": "model"} for i in ids]})


# ---- Provider connection check (unit) ----


def test_check_reports_connected_and_sends_the_key_only_in_the_header() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return models_response("gpt-4o-mini", "gpt-4o")(request)

    result = provider(handler).check_connection()
    assert result.state == "connected"
    assert "gpt-4o-mini" in result.message
    assert seen[0].method == "GET" and str(seen[0].url) == "https://llm.example.com/v1/models"
    assert seen[0].headers["authorization"] == f"Bearer {SECRET}"


@pytest.mark.parametrize(
    ("handler", "state", "fragment"),
    [
        (models_response("llama3", "mistral"), "model_not_found", "Available: llama3, mistral"),
        (lambda r: httpx.Response(401, json={"error": "invalid key"}), "auth_failed", "rejected the API key"),
        (lambda r: httpx.Response(403), "auth_failed", "rejected the API key"),
        (lambda r: httpx.Response(404), "connected", "model list not available"),
        (lambda r: httpx.Response(405), "connected", "model list not available"),
        (lambda r: httpx.Response(501), "connected", "model list not available"),
        (lambda r: httpx.Response(500), "error", "HTTP 500"),
    ],
)
def test_check_classifies_provider_responses(handler, state: str, fragment: str) -> None:  # noqa: ANN001
    result = provider(handler).check_connection()
    assert result.state == state
    assert fragment in result.message
    assert SECRET not in result.message


def test_check_reports_unreachable_and_timeout() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    assert provider(refuse).check_connection().state == "unreachable"
    assert provider(slow).check_connection().state == "timeout"


def test_check_without_a_key_makes_no_request() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    assert provider(fail, key=None).check_connection().state == "not_configured"
    assert provider(fail, key="   ").check_connection().state == "not_configured"


def test_host_never_includes_the_path_or_key() -> None:
    assert provider(models_response()).host == "llm.example.com"


# ---- Status endpoint ----


@pytest.fixture
def hr(database_url: str) -> Iterator[TestClient]:
    with SignedInClient(create_app(make_settings(database_url)), HR_EMAIL) as client:
        yield client


def use_provider(client: TestClient, llm: OpenAICompatibleProvider) -> None:
    client.app.state.llm = llm
    client.app.state.provider_check = None


def upload(client: TestClient) -> dict:
    response = client.post("/api/v1/policies/documents", files={"file": ("leave.txt", LEAVE_POLICY.encode(), "text/plain")}, headers=CSRF_HEADERS)
    assert response.status_code == 201, response.text
    return response.json()


def test_status_not_configured_without_a_key(hr: TestClient) -> None:
    body = hr.get(STATUS, params={"check": "true"}).json()
    assert body["state"] == "not_configured"
    assert body["llmConfigured"] is False
    assert body["provider"]["connection"] == "not_configured"
    assert "LLM_API_KEY" in body["provider"]["message"]
    assert body["knowledge"]["totalDocuments"] == 0


def test_status_no_documents_when_provider_connected(hr: TestClient) -> None:
    use_provider(hr, provider(models_response("gpt-4o-mini")))
    body = hr.get(STATUS, params={"check": "true"}).json()
    assert body["state"] == "no_documents"
    assert body["provider"] == {**body["provider"], "configured": True, "connection": "connected", "host": "llm.example.com", "model": "gpt-4o-mini"}
    assert body["provider"]["checkedAt"] is not None


def test_status_ready_with_documents_and_connected_provider(hr: TestClient) -> None:
    use_provider(hr, provider(models_response("gpt-4o-mini")))
    document = upload(hr)
    body = hr.get(STATUS, params={"check": "true"}).json()
    assert body["state"] == "ready"
    assert body["readyDocuments"] == 1
    knowledge = body["knowledge"]
    assert knowledge["indexedPassages"] == knowledge["expectedPassages"] == document["chunkCount"] > 0
    assert knowledge["retrievalAvailable"] is True


def test_status_without_check_doesnt_call_the_provider(hr: TestClient) -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    use_provider(hr, provider(fail))
    upload(hr)
    body = hr.get(STATUS).json()
    assert body["provider"]["connection"] == "not_checked"
    assert body["state"] == "ready"


@pytest.mark.parametrize(
    ("handler", "connection"),
    [(lambda r: httpx.Response(401), "auth_failed"), (models_response("other-model"), "model_not_found")],
)
def test_status_provider_unreachable_states(hr: TestClient, handler, connection: str) -> None:  # noqa: ANN001
    use_provider(hr, provider(handler))
    upload(hr)
    body = hr.get(STATUS, params={"check": "true"}).json()
    assert body["state"] == "provider_unreachable"
    assert body["provider"]["connection"] == connection
    assert SECRET not in str(body)


def test_status_indexing_while_a_document_is_processing(hr: TestClient) -> None:
    use_provider(hr, provider(models_response("gpt-4o-mini")))
    with hr.app.state.session_factory() as session:
        session.add(
            PolicyDocumentRecord(
                id="00000000-0000-0000-0000-000000000001", filename="handbook.pdf", storage_name="x.pdf", file_type="pdf",
                size_bytes=100, content_sha256="0" * 64, status="processing", chunk_count=0,
            )
        )  # fmt: skip
        session.commit()
    body = hr.get(STATUS, params={"check": "true"}).json()
    assert body["state"] == "indexing"
    assert body["knowledge"]["processingDocuments"] == 1


def test_status_retrieval_unavailable_when_the_embedding_model_failed(hr: TestClient) -> None:
    hr.app.state.retrieval_error = "The embedding model couldn't be loaded."
    body = hr.get(STATUS).json()
    assert body["state"] == "retrieval_unavailable"
    assert body["knowledge"]["message"] == "The embedding model couldn't be loaded."


def test_status_detects_an_index_out_of_sync_with_the_database(hr: TestClient) -> None:
    """E.g. a second API process on the same database handled the upload: this process's index lacks the vectors."""
    use_provider(hr, provider(models_response("gpt-4o-mini")))
    upload(hr)
    vector_store = hr.app.state.vector_store
    vector_store.remove(list(vector_store.ids()))
    body = hr.get(STATUS).json()
    assert body["state"] == "retrieval_unavailable"
    assert "Restart the API" in body["knowledge"]["message"]


def test_connection_check_is_cached_and_hr_can_refresh(hr: TestClient) -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return models_response("gpt-4o-mini")(request)

    use_provider(hr, provider(handler))
    hr.get(STATUS, params={"check": "true"})
    hr.get(STATUS, params={"check": "true"})
    assert len(calls) == 1
    hr.get(STATUS, params={"check": "true", "refresh": "true"})
    assert len(calls) == 2

    login(hr, EMPLOYEE_EMAIL)  # employees can't force extra provider requests
    hr.get(STATUS, params={"check": "true", "refresh": "true"})
    assert len(calls) == 2


def test_status_requires_sign_in_and_never_returns_the_key(database_url: str) -> None:
    app = create_app(make_settings(database_url, llm_api_key=SECRET))
    with TestClient(app) as client:
        assert client.get(STATUS).status_code == 401
        login(client, EMPLOYEE_EMAIL)
        response = client.get(STATUS)
        assert response.status_code == 200
        assert SECRET not in response.text
        assert response.json()["provider"]["host"] == "llm.invalid"
