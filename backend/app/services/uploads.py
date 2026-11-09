"""Shared checks for user uploads: the file type comes from the file's content (magic bytes), never its name."""

import re
from pathlib import Path

# content type -> (leading bytes, stored extension)
FILE_SIGNATURES: dict[str, tuple[bytes, str]] = {
    "application/pdf": (b"%PDF-", ".pdf"),
    "image/png": (b"\x89PNG\r\n\x1a\n", ".png"),
    "image/jpeg": (b"\xff\xd8\xff", ".jpg"),
}
IMAGE_TYPES = ("image/png", "image/jpeg")
DOCUMENT_TYPES = ("application/pdf", *IMAGE_TYPES)

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._ ()-]+")
STORAGE_NAME = re.compile(r"[0-9a-f]{32}\.(pdf|png|jpg)")


def detect_type(content: bytes, allowed: tuple[str, ...] = DOCUMENT_TYPES) -> tuple[str, str] | None:
    """(content type, extension) when the content starts with an allowed signature, else None."""
    for content_type in allowed:
        signature, extension = FILE_SIGNATURES[content_type]
        if content.startswith(signature):
            return content_type, extension
    return None


def safe_filename(filename: str | None, fallback: str = "file") -> str:
    """A display-only version of the uploaded name (path parts and unusual characters removed)."""
    return _SAFE_FILENAME.sub("_", Path(filename or fallback).name)[:200] or fallback
