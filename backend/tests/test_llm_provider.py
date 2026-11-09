"""OpenAI-compatible provider tests using httpx.MockTransport (no network)."""

import json
import logging

import httpx
import pytest
from pydantic import SecretStr

from app.services.llm.errors import LLMAuthenticationError, LLMNotConfiguredError, LLMRateLimitError, LLMTimeoutError, LLMUnavailableError
from app.services.llm.provider import LLMMessage, OpenAICompatibleProvider

API_KEY = "sk-test-SECRET-value-123"
MESSAGES: list[LLMMessage] = [{"role": "system", "content": "rules"}, {"role": "user", "content": "question"}]


def make_provider(handler, api_key: str | None = API_KEY) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key=SecretStr(api_key) if api_key is not None else None,
        model="test-model",
        base_url="https://llm.example.com/v1/",
        timeout_seconds=5,
        temperature=0.1,
        max_tokens=300,
        transport=httpx.MockTransport(handler),
    )


def completion(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})


def test_sends_openai_compatible_request_and_returns_content() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        seen["body"] = json.loads(request.content)
        return completion("  Answer [S1]  ")

    assert make_provider(handler).complete(MESSAGES) == "Answer [S1]"
    assert seen["url"] == "https://llm.example.com/v1/chat/completions"
    assert seen["auth"] == f"Bearer {API_KEY}"
    assert seen["body"] == {"model": "test-model", "messages": MESSAGES, "temperature": 0.1, "max_tokens": 300}


@pytest.mark.parametrize("api_key", [None, "", "   "])
def test_missing_api_key_raises_not_configured_without_request(api_key: str | None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - must not be called
        raise AssertionError("no request expected")

    provider = make_provider(handler, api_key=api_key)
    assert not provider.is_configured
    with pytest.raises(LLMNotConfiguredError, match="LLM_API_KEY"):
        provider.complete(MESSAGES)


@pytest.mark.parametrize(
    ("status", "error_type"),
    [(401, LLMAuthenticationError), (403, LLMAuthenticationError), (404, LLMUnavailableError), (429, LLMRateLimitError), (500, LLMUnavailableError), (503, LLMUnavailableError)],
)
def test_http_errors_map_to_typed_errors(status: int, error_type: type[Exception]) -> None:
    provider = make_provider(lambda request: httpx.Response(status, json={"error": {"message": f"echo {API_KEY}"}}))
    with pytest.raises(error_type) as caught:
        provider.complete(MESSAGES)
    assert API_KEY not in str(caught.value)


def test_timeout_and_connection_errors() -> None:
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    def refused(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(LLMTimeoutError):
        make_provider(timeout).complete(MESSAGES)
    with pytest.raises(LLMUnavailableError, match="couldn't be reached"):
        make_provider(refused).complete(MESSAGES)


@pytest.mark.parametrize("body", [{"choices": []}, {"unexpected": True}, {"choices": [{"message": {"content": "   "}}]}, {"choices": [{"message": {"content": None}}]}])
def test_malformed_or_empty_responses_are_errors(body: dict) -> None:
    with pytest.raises(LLMUnavailableError):
        make_provider(lambda request: httpx.Response(200, json=body)).complete(MESSAGES)


def test_non_json_response_is_an_error() -> None:
    with pytest.raises(LLMUnavailableError, match="unexpected format"):
        make_provider(lambda request: httpx.Response(200, text="<html>gateway</html>")).complete(MESSAGES)


def test_api_key_is_never_logged(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    for status in (401, 500):
        with pytest.raises(Exception):
            make_provider(lambda request, s=status: httpx.Response(s)).complete(MESSAGES)
    assert API_KEY not in caplog.text


# ---- Streaming, keep-alive, warm-up ----


def sse(*pieces: str, done: bool = True) -> httpx.Response:
    lines = [f"data: {json.dumps({'choices': [{'index': 0, 'delta': {'content': p}}]})}\n\n" for p in pieces]
    if done:
        lines.append("data: [DONE]\n\n")
    return httpx.Response(200, content="".join(lines).encode(), headers={"content-type": "text/event-stream"})


def local_provider(handler, keep_alive: str | None = "30m") -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key=SecretStr("ollama"), model="qwen2.5:3b", base_url="http://localhost:11434/v1", timeout_seconds=5,
        temperature=0.1, max_tokens=300, keep_alive=keep_alive, transport=httpx.MockTransport(handler),
    )


def test_stream_yields_pieces_and_requests_streaming() -> None:
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return sse("Employees ", "get 18 ", "days [S1].")

    assert list(make_provider(handler).stream(MESSAGES)) == ["Employees ", "get 18 ", "days [S1]."]
    assert seen[0]["stream"] is True and seen[0]["messages"] == MESSAGES


@pytest.mark.parametrize(("status", "error_type"), [(401, LLMAuthenticationError), (404, LLMUnavailableError), (429, LLMRateLimitError), (500, LLMUnavailableError)])
def test_stream_http_errors_map_to_typed_errors(status: int, error_type: type[Exception]) -> None:
    with pytest.raises(error_type):
        list(make_provider(lambda request: httpx.Response(status)).stream(MESSAGES))


def test_stream_with_no_content_or_bad_chunks_is_an_error() -> None:
    with pytest.raises(LLMUnavailableError):
        list(make_provider(lambda request: sse()).stream(MESSAGES))
    with pytest.raises(LLMUnavailableError):
        list(make_provider(lambda request: httpx.Response(200, content=b"data: {not json}\n\n")).stream(MESSAGES))


def test_stream_timeouts_and_connect_failures() -> None:
    def read_timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    def connect_timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("down", request=request)

    with pytest.raises(LLMTimeoutError, match="took too long"):
        list(make_provider(read_timeout).stream(MESSAGES))
    with pytest.raises(LLMTimeoutError, match="couldn't be reached in time"):
        make_provider(connect_timeout).complete(MESSAGES)


def test_keep_alive_is_sent_only_to_a_local_server() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return completion("ok")

    local_provider(handler).complete(MESSAGES)
    hosted = OpenAICompatibleProvider(
        api_key=SecretStr(API_KEY), model="gpt-4o-mini", base_url="https://api.openai.com/v1", timeout_seconds=5,
        temperature=0.1, max_tokens=300, keep_alive="30m", transport=httpx.MockTransport(handler),
    )
    hosted.complete(MESSAGES)
    local_provider(handler, keep_alive=None).complete(MESSAGES)
    assert bodies[0]["keep_alive"] == "30m"
    assert "keep_alive" not in bodies[1], "hosted APIs reject unknown fields"
    assert "keep_alive" not in bodies[2]


def test_warm_up_runs_only_for_a_configured_local_server() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return completion("Hi")

    assert local_provider(handler).warm_up("SYSTEM RULES") is True
    assert bodies[0]["messages"][0] == {"role": "system", "content": "SYSTEM RULES"}
    assert bodies[0]["max_tokens"] == 1
    assert make_provider(handler).warm_up("SYSTEM RULES") is False, "never spend tokens warming a hosted API"
    assert make_provider(handler, api_key=None).warm_up("SYSTEM RULES") is False
    assert len(bodies) == 1


def test_warm_up_failure_is_not_fatal() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    assert local_provider(down).warm_up("rules") is False
    assert local_provider(lambda request: httpx.Response(500)).warm_up("rules") is False


def test_requests_reuse_one_connection_pool() -> None:
    provider = make_provider(lambda request: completion("ok"))
    provider.complete(MESSAGES)
    client = provider._http()  # noqa: SLF001
    provider.complete(MESSAGES)
    assert provider._http() is client  # noqa: SLF001
    provider.close()
    assert provider._http() is not client  # noqa: SLF001
