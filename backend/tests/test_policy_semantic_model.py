"""Integration test with the real sentence-transformers model.

Skipped by default (it loads PyTorch and needs the model downloaded). Run with:
    RUN_EMBEDDING_MODEL_TESTS=1 pytest tests/test_policy_semantic_model.py
"""

import os

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import SignedInClient, make_settings
from tests.policy_samples import LEAVE_POLICY, PAYROLL_POLICY, SECURITY_POLICY

pytestmark = pytest.mark.skipif(os.getenv("RUN_EMBEDDING_MODEL_TESTS") != "1", reason="set RUN_EMBEDDING_MODEL_TESTS=1 to run real-model tests")


@pytest.mark.parametrize(
    ("question", "expected_document"),
    [
        # No shared keywords with the matching passage: only semantic similarity finds it.
        ("How much vacation time am I entitled to?", "leave.txt"),
        ("What should I do with a suspicious message asking for my login?", "security.txt"),
        ("When will I get my first paycheck?", "payroll.txt"),
    ],
)
def test_real_model_retrieves_by_meaning(database_url: str, question: str, expected_document: str) -> None:
    with SignedInClient(create_app(make_settings(database_url, embedding_provider="sentence-transformers"))) as client:
        for name, text in [("leave.txt", LEAVE_POLICY), ("security.txt", SECURITY_POLICY), ("payroll.txt", PAYROLL_POLICY)]:
            assert client.post("/api/v1/policies/documents", files={"file": (name, text.encode(), "text/plain")}).status_code == 201

        body = client.post("/api/v1/policies/search", json={"query": question, "topK": 3}).json()

    assert body["embeddingModel"] == "sentence-transformers/all-MiniLM-L6-v2"
    assert body["results"][0]["documentName"] == expected_document
