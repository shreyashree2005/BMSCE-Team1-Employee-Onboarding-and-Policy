"""LLM errors. Messages are safe to show users: they never include API keys, prompts or policy text."""

from fastapi import status

from app.services.policies.errors import PolicyServiceError


class LLMNotConfiguredError(PolicyServiceError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "llm_not_configured"

    def __init__(self) -> None:
        super().__init__(
            "The Policy Assistant isn't configured yet. An administrator needs to set LLM_API_KEY "
            "(and optionally LLM_MODEL and LLM_BASE_URL) in backend/.env and restart the API."
        )


class LLMAuthenticationError(PolicyServiceError):
    status_code = status.HTTP_502_BAD_GATEWAY
    code = "llm_auth_failed"


class LLMRateLimitError(PolicyServiceError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "llm_rate_limited"


class LLMTimeoutError(PolicyServiceError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    code = "llm_timeout"


class LLMUnavailableError(PolicyServiceError):
    """The provider couldn't be reached or returned an error/unusable response."""

    status_code = status.HTTP_502_BAD_GATEWAY
    code = "llm_unavailable"
