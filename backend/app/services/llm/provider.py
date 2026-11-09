"""LLM providers behind a small interface, so the Policy Assistant doesn't depend on a specific vendor."""

import json
import logging
import threading
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, Protocol, TypedDict
from urllib.parse import urlsplit

import httpx
from pydantic import SecretStr

from app.services.llm.errors import LLMAuthenticationError, LLMNotConfiguredError, LLMRateLimitError, LLMTimeoutError, LLMUnavailableError

logger = logging.getLogger(__name__)

# Connecting should be quick even when generating is slow: a stopped local server fails fast instead of after the
# full generation timeout.
CONNECT_TIMEOUT_SECONDS = 10.0
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"}


class LLMMessage(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str


ConnectionState = Literal["connected", "not_configured", "auth_failed", "unreachable", "timeout", "model_not_found", "error"]


@dataclass(frozen=True)
class ProviderCheck:
    """Result of a live connectivity check. ``message`` is safe to show users (never contains the key)."""

    state: ConnectionState
    message: str
    checked_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class LLMProvider(Protocol):
    @property
    def model_name(self) -> str: ...

    @property
    def is_configured(self) -> bool: ...

    def complete(self, messages: list[LLMMessage]) -> str:
        """Returns the assistant's reply text. Raises an LLM error from ``app.services.llm.errors`` on failure."""
        ...


def stream_completion(llm: LLMProvider, messages: list[LLMMessage]) -> Iterator[str]:
    """Yields the reply as text pieces. Providers without streaming yield their whole reply as one piece."""
    stream = getattr(llm, "stream", None)
    if callable(stream):
        yield from stream(messages)
    else:
        yield llm.complete(messages)


class OpenAICompatibleProvider:
    """Client for any OpenAI-compatible ``POST {base_url}/chat/completions`` endpoint (OpenAI, Ollama, LM Studio...)."""

    def __init__(
        self,
        *,
        api_key: SecretStr | None,
        model: str,
        base_url: str,
        timeout_seconds: float,
        temperature: float,
        max_tokens: int,
        keep_alive: str | None = None,
        transport: httpx.BaseTransport | None = None,  # injectable for tests
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._url = self._base_url + "/chat/completions"
        self._timeout = timeout_seconds
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._keep_alive = keep_alive
        self._transport = transport
        self._client: httpx.Client | None = None
        self._client_lock = threading.Lock()

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self._api_key.get_secret_value().strip())

    @property
    def host(self) -> str:
        """Provider host (e.g. ``api.openai.com``) for status displays; the URL path and the key are never exposed."""
        return urlsplit(self._base_url).netloc or self._base_url

    @property
    def is_local(self) -> bool:
        """A model server on this machine (e.g. Ollama): no per-token cost, and it accepts Ollama's extra options."""
        return (urlsplit(self._base_url).hostname or "") in _LOCAL_HOSTS

    def _http(self) -> httpx.Client:
        """One shared client, so consecutive questions reuse the open connection. httpx clients are thread-safe."""
        with self._client_lock:
            if self._client is None:
                self._client = httpx.Client(timeout=httpx.Timeout(self._timeout, connect=min(CONNECT_TIMEOUT_SECONDS, self._timeout)), transport=self._transport)
            return self._client

    def close(self) -> None:
        with self._client_lock:
            if self._client is not None:
                self._client.close()
                self._client = None

    def _headers(self) -> dict[str, str]:
        assert self._api_key is not None
        return {"Authorization": f"Bearer {self._api_key.get_secret_value()}", "Content-Type": "application/json"}

    def _payload(self, messages: list[LLMMessage], *, stream: bool, max_tokens: int | None = None) -> dict[str, object]:
        payload: dict[str, object] = {
            "model": self._model,
            "messages": messages,
            "temperature": self._temperature,
            "max_tokens": max_tokens or self._max_tokens,
        }
        if stream:
            payload["stream"] = True
        if self._keep_alive and self.is_local:
            # Ollama unloads an idle model after 5 minutes; reloading costs seconds plus a slow first prompt. Hosted
            # APIs reject unknown fields, so this is only sent to a server on this machine.
            payload["keep_alive"] = self._keep_alive
        return payload

    def check_connection(self, timeout_seconds: float = 8.0) -> ProviderCheck:
        """
        Verifies the base URL, key and model with ``GET {base_url}/models`` (no tokens are spent).
        Providers without a model list (404) count as reachable; the first chat request is the final proof.
        """
        if not self.is_configured or self._api_key is None:
            return ProviderCheck("not_configured", "LLM_API_KEY is not set.")
        headers = {"Authorization": f"Bearer {self._api_key.get_secret_value()}"}
        try:
            with httpx.Client(timeout=min(timeout_seconds, self._timeout), transport=self._transport) as client:
                response = client.get(f"{self._base_url}/models", headers=headers)
        except httpx.TimeoutException:
            return ProviderCheck("timeout", f"{self.host} didn't respond in time.")
        except httpx.HTTPError as error:
            logger.warning("LLM provider connection check failed: %s", type(error).__name__)
            return ProviderCheck("unreachable", f"Couldn't connect to {self.host}. Check LLM_BASE_URL and that the service is running.")
        if response.status_code in (401, 403):
            return ProviderCheck("auth_failed", f"{self.host} rejected the API key. Check LLM_API_KEY.")
        if response.status_code in (404, 405, 501):
            # The server answered but doesn't offer a model list (common for proxies and minimal servers).
            return ProviderCheck("connected", f"Connected to {self.host} (model list not available).")
        if response.status_code >= 400:
            return ProviderCheck("error", f"{self.host} returned HTTP {response.status_code}.")
        try:
            models = [str(item["id"]) for item in response.json().get("data", []) if isinstance(item, dict) and "id" in item]
        except (ValueError, AttributeError, TypeError):
            models = []
        if models and self._model not in models:
            sample = ", ".join(sorted(models)[:5])
            return ProviderCheck("model_not_found", f"Model '{self._model}' isn't available from {self.host}. Available: {sample}. Check LLM_MODEL.")
        return ProviderCheck("connected", f"Connected to {self.host}; model '{self._model}' is available.")

    def _raise_for_status(self, status_code: int) -> None:
        if status_code in (401, 403):
            logger.warning("LLM provider rejected the credentials (HTTP %d)", status_code)
            raise LLMAuthenticationError("The AI service rejected the configured API key. Check LLM_API_KEY in backend/.env.")
        if status_code == 404:
            raise LLMUnavailableError(f"The AI service couldn't find model '{self._model}'. Check LLM_MODEL and LLM_BASE_URL.")
        if status_code == 429:
            raise LLMRateLimitError("The AI service is rate-limiting requests right now. Please wait a moment and try again.")
        if status_code >= 400:
            logger.warning("LLM provider returned HTTP %d", status_code)
            raise LLMUnavailableError("The AI service returned an error. Please try again shortly.")

    def _timeout_error(self, error: Exception) -> LLMTimeoutError:
        if isinstance(error, httpx.ConnectTimeout):
            logger.warning("Connecting to the LLM provider timed out")
            return LLMTimeoutError("The AI service couldn't be reached in time. Check that it is running and try again.")
        logger.warning("LLM request timed out after %.0fs", self._timeout)
        return LLMTimeoutError("The AI service took too long to respond. Please try again.")

    def complete(self, messages: list[LLMMessage]) -> str:
        if not self.is_configured or self._api_key is None:
            raise LLMNotConfiguredError()
        try:
            response = self._http().post(self._url, json=self._payload(messages, stream=False), headers=self._headers())
        except httpx.TimeoutException as error:
            raise self._timeout_error(error) from error
        except httpx.HTTPError as error:
            logger.warning("Could not reach the LLM provider: %s", type(error).__name__)
            raise LLMUnavailableError("The AI service couldn't be reached. Check LLM_BASE_URL and the server's network connection.") from error

        self._raise_for_status(response.status_code)
        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise LLMUnavailableError("The AI service returned a response in an unexpected format.") from error
        if not isinstance(content, str) or not content.strip():
            raise LLMUnavailableError("The AI service returned an empty answer. Please try again.")
        return content.strip()

    def stream(self, messages: list[LLMMessage]) -> Iterator[str]:
        """
        Yields the reply as it is generated (server-sent events, ``"stream": true``). The read timeout applies to each
        wait for the next piece. Closing the generator early closes the connection, which makes Ollama stop generating,
        so an abandoned question doesn't keep the model busy.
        """
        if not self.is_configured or self._api_key is None:
            raise LLMNotConfiguredError()
        produced = False
        try:
            with self._http().stream("POST", self._url, json=self._payload(messages, stream=True), headers=self._headers()) as response:
                if response.status_code >= 400:
                    response.read()
                    self._raise_for_status(response.status_code)
                for line in response.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        piece = json.loads(data)["choices"][0].get("delta", {}).get("content")
                    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as error:
                        raise LLMUnavailableError("The AI service returned a response in an unexpected format.") from error
                    if piece:
                        produced = True
                        yield piece
        except httpx.TimeoutException as error:
            raise self._timeout_error(error) from error
        except httpx.HTTPError as error:
            logger.warning("Could not reach the LLM provider: %s", type(error).__name__)
            raise LLMUnavailableError("The AI service couldn't be reached. Check LLM_BASE_URL and the server's network connection.") from error
        if not produced:
            raise LLMUnavailableError("The AI service returned an empty answer. Please try again.")

    def warm_up(self, system_prompt: str) -> bool:
        """
        Local servers only: loads the model and processes the fixed system prompt once, so the first real question
        doesn't pay for loading and later questions reuse the cached prompt start. Hosted APIs are never called
        (that would cost tokens). Returns whether the warm-up ran.
        """
        if not self.is_configured or not self.is_local:
            return False
        messages: list[LLMMessage] = [{"role": "system", "content": system_prompt}, {"role": "user", "content": "Hello"}]
        try:
            response = self._http().post(self._url, json=self._payload(messages, stream=False, max_tokens=1), headers=self._headers())
        except httpx.HTTPError as error:
            logger.warning("LLM warm-up failed (%s); the first question will load the model instead.", type(error).__name__)
            return False
        if response.status_code >= 400:
            logger.warning("LLM warm-up returned HTTP %d; the first question will load the model instead.", response.status_code)
            return False
        return True


def create_llm_provider(
    *, api_key: SecretStr | None, model: str, base_url: str, timeout_seconds: float, temperature: float, max_tokens: int, keep_alive: str | None = None
) -> LLMProvider:
    return OpenAICompatibleProvider(
        api_key=api_key, model=model, base_url=base_url, timeout_seconds=timeout_seconds, temperature=temperature, max_tokens=max_tokens, keep_alive=keep_alive
    )
