"""Typed errors for policy ingestion. Each maps to an HTTP status in ``app.main``."""

from fastapi import status


class PolicyServiceError(Exception):
    status_code: int = status.HTTP_400_BAD_REQUEST
    # Machine-readable identifier returned to clients alongside the message (e.g. "llm_not_configured").
    code: str = "policy_error"

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class UnsupportedFileTypeError(PolicyServiceError):
    status_code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    code = "unsupported_file_type"


class FileTooLargeError(PolicyServiceError):
    status_code = status.HTTP_413_CONTENT_TOO_LARGE
    code = "file_too_large"


class InvalidDocumentError(PolicyServiceError):
    """Empty, corrupt, mislabelled or text-free documents."""

    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "invalid_document"


class DuplicateDocumentError(PolicyServiceError):
    status_code = status.HTTP_409_CONFLICT
    code = "duplicate_document"


class DocumentNotFoundError(PolicyServiceError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "document_not_found"

    def __init__(self, document_id: str) -> None:
        super().__init__(f"Policy document '{document_id}' was not found")


class EmbeddingUnavailableError(PolicyServiceError):
    """The embedding model could not be loaded (e.g. not downloaded and no network)."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "embedding_unavailable"
