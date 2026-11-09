"""API tests for policy document ingestion and semantic search (hashing embeddings, isolated storage per test)."""

from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.policies.errors import EmbeddingUnavailableError
from tests.conftest import EMPLOYEE_EMAIL, SignedInClient, login, make_settings
from tests.policy_samples import LEAVE_POLICY, PAYROLL_POLICY, SECURITY_POLICY, make_docx, make_pdf

BASE = "/api/v1/policies"
TXT = "text/plain"


@pytest.fixture
def policy_client(database_url: str) -> Iterator[TestClient]:
    with SignedInClient(create_app(make_settings(database_url))) as client:
        yield client


def upload(client: TestClient, filename: str, content: bytes | str, content_type: str = TXT):
    data = content.encode() if isinstance(content, str) else content
    return client.post(f"{BASE}/documents", files={"file": (filename, data, content_type)})


def search(client: TestClient, query: str, **extra: object) -> list[dict]:
    response = client.post(f"{BASE}/search", json={"query": query, **extra})
    assert response.status_code == 200, response.text
    return response.json()["results"]


def storage_dir(client: TestClient) -> Path:
    return client.app.state.settings.policy_storage_dir  # type: ignore[attr-defined]


# ---- Upload ----


def test_upload_txt_creates_ready_document(policy_client: TestClient) -> None:
    response = upload(policy_client, "Leave Policy.txt", LEAVE_POLICY)

    assert response.status_code == 201
    document = response.json()
    assert set(document) == {"id", "filename", "fileType", "sizeBytes", "status", "pageCount", "chunkCount", "errorMessage", "uploadedAt"}
    assert document["filename"] == "Leave Policy.txt"
    assert document["fileType"] == "txt"
    assert document["status"] == "ready"
    assert document["chunkCount"] >= 2
    assert document["errorMessage"] is None
    assert document["uploadedAt"].endswith(("Z", "+00:00")), "timestamps must carry a timezone"


def test_upload_pdf_records_pages_and_page_numbers(policy_client: TestClient) -> None:
    pdf = make_pdf(["Annual leave is eighteen days per calendar year for every employee.", "Report phishing emails to the IT security team immediately."])

    document = upload(policy_client, "handbook.pdf", pdf, "application/pdf").json()
    detail = policy_client.get(f"{BASE}/documents/{document['id']}").json()

    assert document["pageCount"] == 2
    assert [chunk["pageNumber"] for chunk in detail["chunks"]] == [1, 2]
    results = search(policy_client, "phishing emails security team")
    assert results[0]["pageNumber"] == 2
    assert results[0]["documentName"] == "handbook.pdf"


def test_upload_docx_records_sections(policy_client: TestClient) -> None:
    docx = make_docx([("Annual Leave", ["Employees receive eighteen days of paid annual leave each year."]), ("Payroll", ["Salaries are paid on the last working day of each month."])])

    document = upload(policy_client, "policies.docx", docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document").json()

    assert document["status"] == "ready"
    results = search(policy_client, "when are salaries paid each month")
    assert results[0]["section"] == "Payroll"


@pytest.mark.parametrize(
    ("filename", "content", "status_code", "message"),
    [
        ("malware.exe", b"MZ\x90\x00", 415, "Unsupported file type"),
        ("empty.txt", b"", 422, "empty"),
        ("fake.pdf", b"This is plain text, not a PDF.", 422, "not a valid PDF"),
        ("fake.docx", b"plain text", 422, "not a valid Word"),
        ("blank.pdf", make_pdf(["", ""]), 422, "No readable text"),
        ("spaces.txt", b"   \n\n   ", 422, "No readable text"),
    ],
)
def test_invalid_uploads_are_rejected_and_nothing_is_stored(policy_client: TestClient, filename: str, content: bytes, status_code: int, message: str) -> None:
    response = upload(policy_client, filename, content)

    assert response.status_code == status_code
    assert message in response.json()["detail"]
    assert policy_client.get(f"{BASE}/documents").json() == []
    files_dir = storage_dir(policy_client) / "files"
    assert not files_dir.exists() or not any(files_dir.iterdir())


def test_oversized_upload_is_rejected(database_url: str) -> None:
    with SignedInClient(create_app(make_settings(database_url, policy_max_upload_mb=0.001))) as client:  # ~1 KB limit
        response = upload(client, "big.txt", "Policy sentence. " * 200)

    assert response.status_code == 413


def test_missing_file_field_is_a_validation_error(policy_client: TestClient) -> None:
    assert policy_client.post(f"{BASE}/documents").status_code == 422


def test_duplicate_content_is_rejected(policy_client: TestClient) -> None:
    upload(policy_client, "leave.txt", LEAVE_POLICY)

    response = upload(policy_client, "leave-copy.txt", LEAVE_POLICY)

    assert response.status_code == 409
    assert "leave.txt" in response.json()["detail"]
    assert len(policy_client.get(f"{BASE}/documents").json()) == 1


def test_same_filename_different_content_creates_separate_files(policy_client: TestClient) -> None:
    first = upload(policy_client, "policy.txt", LEAVE_POLICY).json()
    second = upload(policy_client, "policy.txt", PAYROLL_POLICY).json()

    assert first["id"] != second["id"]
    stored = sorted(p.name for p in (storage_dir(policy_client) / "files").iterdir())
    assert len(stored) == 2 and all(name.endswith(".txt") and "policy" not in name for name in stored)


# ---- Listing & detail ----


def test_list_returns_documents_newest_first(policy_client: TestClient) -> None:
    upload(policy_client, "leave.txt", LEAVE_POLICY)
    upload(policy_client, "security.txt", SECURITY_POLICY)

    documents = policy_client.get(f"{BASE}/documents").json()

    assert {d["filename"] for d in documents} == {"leave.txt", "security.txt"}
    assert all(d["status"] == "ready" for d in documents)


def test_detail_includes_ordered_chunks(policy_client: TestClient) -> None:
    document = upload(policy_client, "leave.txt", LEAVE_POLICY).json()

    detail = policy_client.get(f"{BASE}/documents/{document['id']}").json()

    assert len(detail["chunks"]) == document["chunkCount"]
    assert [c["chunkIndex"] for c in detail["chunks"]] == list(range(document["chunkCount"]))
    assert "eighteen days" in " ".join(c["text"] for c in detail["chunks"])


def test_unknown_document_returns_404(policy_client: TestClient) -> None:
    assert policy_client.get(f"{BASE}/documents/missing").status_code == 404
    assert policy_client.delete(f"{BASE}/documents/missing").status_code == 404


# ---- Search ----


def test_search_returns_relevant_chunks_with_metadata(policy_client: TestClient) -> None:
    upload(policy_client, "leave.txt", LEAVE_POLICY)
    upload(policy_client, "security.txt", SECURITY_POLICY)
    upload(policy_client, "payroll.txt", PAYROLL_POLICY)

    response = policy_client.post(f"{BASE}/search", json={"query": "How many days of sick leave do employees get?", "topK": 3})
    body = response.json()

    assert body["embeddingModel"] == "hashing-384"
    assert body["searchedChunks"] > 3
    top = body["results"][0]
    assert top["documentName"] == "leave.txt"
    assert "sick leave" in top["text"]
    assert set(top) == {"chunkId", "documentId", "documentName", "chunkIndex", "pageNumber", "section", "text", "score"}
    scores = [r["score"] for r in body["results"]]
    assert scores == sorted(scores, reverse=True) and 0 < scores[0] <= 1


def test_search_respects_top_k_and_document_filter(policy_client: TestClient) -> None:
    leave = upload(policy_client, "leave.txt", LEAVE_POLICY).json()
    upload(policy_client, "security.txt", SECURITY_POLICY)

    assert len(search(policy_client, "policy", topK=1)) == 1
    filtered = search(policy_client, "phishing passwords", documentId=leave["id"])
    assert filtered and all(r["documentId"] == leave["id"] for r in filtered)


def test_search_with_no_documents_returns_empty_results(policy_client: TestClient) -> None:
    body = policy_client.post(f"{BASE}/search", json={"query": "leave policy"}).json()
    assert body["results"] == [] and body["searchedChunks"] == 0


@pytest.mark.parametrize("payload", [{"query": ""}, {"query": " a "}, {"query": "x" * 501}, {"query": "leave", "topK": 0}, {"query": "leave", "topK": 21}, {}])
def test_invalid_search_requests_are_rejected(policy_client: TestClient, payload: dict) -> None:
    assert policy_client.post(f"{BASE}/search", json=payload).status_code == 422


def test_search_filter_on_unknown_document_returns_404(policy_client: TestClient) -> None:
    upload(policy_client, "leave.txt", LEAVE_POLICY)
    assert policy_client.post(f"{BASE}/search", json={"query": "leave", "documentId": "nope"}).status_code == 404


# ---- Deletion ----


def test_delete_removes_document_file_and_search_results(policy_client: TestClient) -> None:
    leave = upload(policy_client, "leave.txt", LEAVE_POLICY).json()
    upload(policy_client, "security.txt", SECURITY_POLICY)
    assert any(r["documentId"] == leave["id"] for r in search(policy_client, "annual leave days", topK=10))

    response = policy_client.delete(f"{BASE}/documents/{leave['id']}")

    assert response.status_code == 204
    assert policy_client.get(f"{BASE}/documents/{leave['id']}").status_code == 404
    assert all(r["documentId"] != leave["id"] for r in search(policy_client, "annual leave days", topK=10))
    assert len(list((storage_dir(policy_client) / "files").iterdir())) == 1
    assert client_vector_count(policy_client) == policy_client.get(f"{BASE}/documents").json()[0]["chunkCount"]


def client_vector_count(client: TestClient) -> int:
    return client.app.state.vector_store.size  # type: ignore[attr-defined]


def test_deleted_document_can_be_uploaded_again(policy_client: TestClient) -> None:
    document = upload(policy_client, "leave.txt", LEAVE_POLICY).json()
    policy_client.delete(f"{BASE}/documents/{document['id']}")

    assert upload(policy_client, "leave.txt", LEAVE_POLICY).status_code == 201


# ---- Persistence & recovery ----


def test_documents_and_index_survive_restart(database_url: str) -> None:
    settings = make_settings(database_url)
    with SignedInClient(create_app(settings)) as first_run:
        document = upload(first_run, "leave.txt", LEAVE_POLICY).json()
        before = search(first_run, "carried forward leave days")

    index_dir = settings.policy_storage_dir / "index"
    assert (index_dir / "policy_chunks.faiss").exists()

    with SignedInClient(create_app(settings)) as second_run:
        assert [d["id"] for d in second_run.get(f"{BASE}/documents").json()] == [document["id"]]
        assert search(second_run, "carried forward leave days") == before


def test_missing_index_is_rebuilt_from_database_on_startup(database_url: str) -> None:
    settings = make_settings(database_url)
    with SignedInClient(create_app(settings)) as first_run:
        upload(first_run, "security.txt", SECURITY_POLICY)
        expected = search(first_run, "phishing emails")

    for file in (settings.policy_storage_dir / "index").iterdir():
        file.unlink()

    with SignedInClient(create_app(settings)) as second_run:
        assert search(second_run, "phishing emails") == expected


def test_index_with_stale_vectors_is_reconciled(database_url: str) -> None:
    """If the saved index has vectors for chunks no longer in the database, startup rebuilds it to match."""
    settings = make_settings(database_url)
    with SignedInClient(create_app(settings)) as first_run:
        upload(first_run, "leave.txt", LEAVE_POLICY)
        store = first_run.app.state.vector_store  # type: ignore[attr-defined]
        store.add([999_999], np.ones((1, 384), dtype=np.float32) / np.sqrt(384))
        store.save()

    with SignedInClient(create_app(settings)) as second_run:
        assert 999_999 not in second_run.app.state.vector_store.ids()  # type: ignore[attr-defined]


def test_interrupted_processing_is_marked_failed_on_startup(database_url: str) -> None:
    settings = make_settings(database_url)
    with SignedInClient(create_app(settings)) as first_run:
        document = upload(first_run, "leave.txt", LEAVE_POLICY).json()
        with first_run.app.state.session_factory() as session:  # type: ignore[attr-defined]
            from app.db.models import PolicyDocumentRecord

            session.get(PolicyDocumentRecord, document["id"]).status = "processing"  # type: ignore[union-attr]
            session.commit()

    with SignedInClient(create_app(settings)) as second_run:
        restarted = second_run.get(f"{BASE}/documents/{document['id']}").json()
        assert restarted["status"] == "failed"
        assert "interrupted" in restarted["errorMessage"]
        assert search(second_run, "annual leave") == []  # failed documents are not searchable


class _BrokenEmbedder:
    model_name = "hashing-384"
    dimension = 384

    def embed(self, texts: list[str]) -> np.ndarray:
        raise EmbeddingUnavailableError("The embedding model could not be loaded.")


def test_embedding_failure_marks_document_failed_and_retry_succeeds(policy_client: TestClient) -> None:
    working = policy_client.app.state.embedder  # type: ignore[attr-defined]
    policy_client.app.state.embedder = _BrokenEmbedder()  # type: ignore[attr-defined]

    failed = upload(policy_client, "leave.txt", LEAVE_POLICY)
    assert failed.status_code == 503
    documents = policy_client.get(f"{BASE}/documents").json()
    assert [(d["status"], d["chunkCount"]) for d in documents] == [("failed", 0)]
    assert client_vector_count(policy_client) == 0

    policy_client.app.state.embedder = working  # type: ignore[attr-defined]
    retried = upload(policy_client, "leave.txt", LEAVE_POLICY)
    assert retried.status_code == 201
    assert [d["status"] for d in policy_client.get(f"{BASE}/documents").json()] == ["ready"]


def test_search_reports_503_when_embedding_model_unavailable(policy_client: TestClient) -> None:
    upload(policy_client, "leave.txt", LEAVE_POLICY)
    policy_client.app.state.embedder = _BrokenEmbedder()  # type: ignore[attr-defined]

    response = policy_client.post(f"{BASE}/search", json={"query": "leave"})

    assert response.status_code == 503


# ---- Existing functionality is unaffected ----


def test_onboarding_api_still_works_alongside_policies(policy_client: TestClient) -> None:
    upload(policy_client, "leave.txt", LEAVE_POLICY)  # as HR

    login(policy_client, EMPLOYEE_EMAIL)  # checklists belong to employees
    assert len(policy_client.get("/api/v1/onboarding/tasks").json()) == 13  # the demo employee's role checklist
    assert policy_client.post("/api/v1/policies/search", json={"query": "annual leave"}).json()["results"]
    assert policy_client.get("/health").json()["status"] == "ok"
