"""LIVE end-to-end RAG test against the REAL configured AI provider (not a mock).

Skipped unless RUN_LIVE_LLM_TESTS=1. Uses LLM_API_KEY / LLM_BASE_URL / LLM_MODEL from the environment or
backend/.env, the real sentence-transformers embedding model and FAISS, and a temporary database. Run:

    RUN_LIVE_LLM_TESTS=1 pytest tests/test_live_llm.py -v -s
"""

import os
import re
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.policies.assistant import FALLBACK_ANSWER
from tests.conftest import CSRF_HEADERS, HR_EMAIL, SignedInClient, make_settings
from tests.policy_samples import LEAVE_POLICY

pytestmark = pytest.mark.skipif(os.environ.get("RUN_LIVE_LLM_TESTS") != "1", reason="live provider test; set RUN_LIVE_LLM_TESTS=1")


@pytest.fixture(scope="module")
def live_settings() -> Settings:
    real = Settings()  # reads the environment and backend/.env
    if not real.llm_api_key:
        pytest.skip("LLM_API_KEY is not configured")
    return real


@pytest.fixture
def live_client(database_url: str, live_settings: Settings) -> Iterator[TestClient]:
    settings = make_settings(
        database_url,
        llm_api_key=live_settings.llm_api_key,
        llm_base_url=live_settings.llm_base_url,
        llm_model=live_settings.llm_model,
        llm_timeout_seconds=live_settings.llm_timeout_seconds,
        embedding_provider="sentence-transformers",
        rag_min_relevance=live_settings.rag_min_relevance,
        rag_strong_relevance=live_settings.rag_strong_relevance,
    )
    with SignedInClient(create_app(settings), HR_EMAIL) as client:
        yield client


def ask(client: TestClient, question: str) -> dict:
    response = client.post("/api/v1/policies/chat", json={"question": question}, headers=CSRF_HEADERS)
    assert response.status_code == 200, response.text
    return response.json()


def test_live_provider_connection(live_client: TestClient) -> None:
    status = live_client.get("/api/v1/policies/assistant/status", params={"check": "true"}).json()
    print(f"\nprovider: {status['provider']}")
    assert status["provider"]["connection"] == "connected", status["provider"]["message"]


def test_live_rag_answer_is_grounded_and_cited(live_client: TestClient) -> None:
    upload = live_client.post("/api/v1/policies/documents", files={"file": ("leave-policy.txt", LEAVE_POLICY.encode(), "text/plain")}, headers=CSRF_HEADERS)
    assert upload.status_code == 201, upload.text
    assert upload.json()["chunkCount"] > 0

    body = ask(live_client, "How many days of paid annual leave do full-time employees receive?")
    print(f"\nanswer: {body['answer']}\ncitations: {[(c['documentName'], c['excerpt'][:60]) for c in body['citations']]}\nevidence: {body['evidence']['level']}")
    assert body["answeredFromDocuments"] is True, body["answer"]
    assert body["citations"], "no citations"
    assert all(c["documentName"] == "leave-policy.txt" for c in body["citations"])
    assert re.search(r"\b18\b|eighteen", body["answer"], re.IGNORECASE), body["answer"]
    assert body["model"]


def test_live_unanswerable_question_recommends_hr(live_client: TestClient) -> None:
    live_client.post("/api/v1/policies/documents", files={"file": ("leave-policy.txt", LEAVE_POLICY.encode(), "text/plain")}, headers=CSRF_HEADERS)
    body = ask(live_client, "What is the company policy on bringing pets to the office?")
    print(f"\nanswer: {body['answer']}\nescalation: {body['escalation']}")
    assert body["answer"] == FALLBACK_ANSWER or body["escalation"]["recommended"] is True
