"""Streaming Policy Assistant answers, latency instrumentation and query-embedding reuse. Fake LLM, no network."""

import json
import logging
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.llm.errors import LLMTimeoutError
from app.services.llm.provider import LLMMessage
from app.services.policies.assistant import FALLBACK_ANSWER
from tests.conftest import SignedInClient, make_settings
from tests.policy_samples import LEAVE_POLICY, SECURITY_POLICY
from tests.test_policy_chat import CHAT, FakeLLM, cite_source_containing, upload

STREAM = "/api/v1/policies/chat/stream"
QUESTION = "How many days of paid annual leave do employees receive?"


class StreamingFakeLLM(FakeLLM):
    """A fake model that streams its scripted reply in small pieces, optionally failing part-way."""

    def __init__(self, responder: Callable[[list[LLMMessage]], str] | None = None, fail_after: int | None = None) -> None:
        super().__init__(responder)
        self.fail_after = fail_after
        self.closed = False

    def stream(self, messages: list[LLMMessage]) -> Iterator[str]:
        self.calls.append(messages)
        text = self.responder(messages)
        pieces = [text[i : i + 7] for i in range(0, len(text), 7)]
        try:
            for index, piece in enumerate(pieces):
                if self.fail_after is not None and index == self.fail_after:
                    raise LLMTimeoutError("The AI service took too long to respond. Please try again.")
                yield piece
        finally:
            self.closed = True


@pytest.fixture
def client(database_url: str) -> Iterator[TestClient]:
    with SignedInClient(create_app(make_settings(database_url))) as test_client:
        upload(test_client, "leave.txt", LEAVE_POLICY)
        upload(test_client, "security.txt", SECURITY_POLICY)
        yield test_client


def stream_events(client: TestClient, question: str = QUESTION, **extra: object) -> list[dict]:
    with client.stream("POST", STREAM, json={"question": question, **extra}) as response:
        assert response.status_code == 200, response.read()
        assert response.headers["content-type"].startswith("application/x-ndjson")
        return [json.loads(line) for line in response.iter_lines() if line.strip()]


def test_stream_sends_draft_tokens_then_the_same_validated_answer_as_chat(client: TestClient) -> None:
    llm = StreamingFakeLLM()
    client.app.state.llm = llm  # type: ignore[attr-defined]

    events = stream_events(client)

    assert events[0]["type"] == "status" and events[0]["passages"] >= 1
    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert len(tokens) > 1, "the reply should arrive in several pieces"
    assert events[-1]["type"] == "done"
    streamed = events[-1]["response"]
    assert "".join(tokens).strip().startswith("Employees receive eighteen days")
    # The final event is the validated answer: citations resolved against the retrieved passages.
    assert streamed["answeredFromDocuments"] is True and len(streamed["citations"]) == 1
    assert "annual leave" in streamed["citations"][0]["excerpt"]

    # The blocking endpoint gives the same answer for the same question.
    client.app.state.llm = FakeLLM()  # type: ignore[attr-defined]
    blocking = client.post(CHAT, json={"question": QUESTION}).json()
    assert blocking["answer"] == streamed["answer"]
    assert [c["chunkId"] for c in blocking["citations"]] == [c["chunkId"] for c in streamed["citations"]]
    assert llm.closed


def test_stream_works_with_a_provider_that_cannot_stream(client: TestClient) -> None:
    client.app.state.llm = FakeLLM()  # type: ignore[attr-defined]
    events = stream_events(client)
    assert [e["type"] for e in events] == ["status", "token", "done"]
    assert events[-1]["response"]["citations"]


def test_an_unsupported_streamed_draft_is_replaced_by_the_hr_fallback(client: TestClient) -> None:
    # The model invents an uncited rule: the draft is streamed, but the final answer must not keep it.
    client.app.state.llm = StreamingFakeLLM(lambda _: "Employees get unlimited paid holidays and a company car.")  # type: ignore[attr-defined]
    events = stream_events(client)
    final = events[-1]["response"]
    assert events[-1]["type"] == "done"
    assert final["answer"] == FALLBACK_ANSWER
    assert final["citations"] == [] and final["answeredFromDocuments"] is False


def test_insufficient_evidence_streams_only_the_fallback_without_calling_the_llm(client: TestClient) -> None:
    llm = StreamingFakeLLM()
    client.app.state.llm = llm  # type: ignore[attr-defined]
    events = stream_events(client, "Which quantum chromodynamics lattice gauge applies to zebras?")
    assert [e["type"] for e in events] == ["done"]
    assert events[0]["response"]["answer"] == FALLBACK_ANSWER
    assert llm.calls == []


def test_a_failure_mid_stream_becomes_an_error_event(client: TestClient) -> None:
    llm = StreamingFakeLLM(fail_after=2)
    client.app.state.llm = llm  # type: ignore[attr-defined]
    events = stream_events(client)
    assert events[-1] == {"type": "error", "status": 504, "code": "llm_timeout", "detail": "The AI service took too long to respond. Please try again."}
    assert not any(e["type"] == "done" for e in events)
    assert llm.closed, "the model stream must be closed after a failure"


def test_errors_before_streaming_are_normal_json_errors(client: TestClient) -> None:
    client.app.state.llm = FakeLLM(configured=False)  # type: ignore[attr-defined]
    response = client.post(STREAM, json={"question": QUESTION})
    assert response.status_code == 503 and response.json()["code"] == "llm_not_configured"

    client.app.state.llm = StreamingFakeLLM()  # type: ignore[attr-defined]
    response = client.post(STREAM, json={"question": QUESTION, "documentId": "00000000-0000-0000-0000-000000000000"})
    assert response.status_code == 404


def test_stream_requires_sign_in(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url))) as anonymous:
        assert anonymous.post(STREAM, json={"question": QUESTION}).status_code == 401


def test_each_answer_logs_per_stage_timings(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    client.app.state.llm = FakeLLM()  # type: ignore[attr-defined]
    with caplog.at_level(logging.INFO, logger="app.services.policies.assistant"):
        assert client.post(CHAT, json={"question": QUESTION}).status_code == 200
    line = next(r.getMessage() for r in caplog.records if r.getMessage().startswith("Policy chat timings (answered)"))
    for stage in ("request=", "embed=", "faiss=", "db=", "context=", "llm=", "validate=", "total="):
        assert stage in line, f"{stage} missing from: {line}"


def test_a_broad_question_embeds_the_query_once(client: TestClient) -> None:
    client.app.state.llm = FakeLLM(cite_source_containing("annual leave"))  # type: ignore[attr-defined]
    embedder = client.app.state.embedder  # type: ignore[attr-defined]
    calls: list[list[str]] = []
    original = embedder.embed

    def counting(texts: list[str]):  # noqa: ANN202
        calls.append(texts)
        return original(texts)

    embedder.embed = counting
    try:
        assert client.post(CHAT, json={"question": "What is the leave policy?"}).status_code == 200
    finally:
        embedder.embed = original
    # Broad questions search twice (all documents, then the matching one) but embed the question only once.
    assert calls == [["What is the leave policy?"]]
