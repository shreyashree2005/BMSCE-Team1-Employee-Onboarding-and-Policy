"""Upload validation. File types are decided by extension *and* content signature, never by the client's Content-Type."""

import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import PurePath

from app.schemas.policies import DocumentFileType
from app.services.policies.errors import FileTooLargeError, InvalidDocumentError, UnsupportedFileTypeError

ALLOWED_EXTENSIONS: dict[str, DocumentFileType] = {
    ".pdf": DocumentFileType.PDF,
    ".docx": DocumentFileType.DOCX,
    ".txt": DocumentFileType.TXT,
}
MAX_FILENAME_LENGTH = 200
# A DOCX is a ZIP; reject archives that would expand to an unreasonable size (zip-bomb guard).
MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024


@dataclass(frozen=True)
class ValidatedUpload:
    filename: str
    file_type: DocumentFileType
    content: bytes


def sanitize_filename(raw_name: str | None) -> str:
    """Keeps only the base name, strips control characters and caps the length. Used for display only."""
    name = PurePath((raw_name or "").replace("\\", "/")).name
    name = "".join(ch for ch in unicodedata.normalize("NFC", name) if unicodedata.category(ch)[0] != "C")
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        return "document"
    if len(name) > MAX_FILENAME_LENGTH:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: MAX_FILENAME_LENGTH - len(ext) - 1] + dot + ext) if dot else name[:MAX_FILENAME_LENGTH]
    return name


def _check_signature(file_type: DocumentFileType, content: bytes) -> None:
    if file_type is DocumentFileType.PDF:
        if not content.lstrip()[:5] == b"%PDF-":
            raise InvalidDocumentError("The file has a .pdf extension but is not a valid PDF document.")
    elif file_type is DocumentFileType.DOCX:
        if not content.startswith(b"PK"):
            raise InvalidDocumentError("The file has a .docx extension but is not a valid Word document.")
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                names = set(archive.namelist())
                total_size = sum(info.file_size for info in archive.infolist())
        except zipfile.BadZipFile as error:
            raise InvalidDocumentError("The Word document is corrupt or incomplete.") from error
        if "word/document.xml" not in names:
            raise InvalidDocumentError("The file is a ZIP archive but not a Word (.docx) document.")
        if total_size > MAX_DOCX_UNCOMPRESSED_BYTES:
            raise InvalidDocumentError("The Word document is too large once uncompressed.")
    elif b"\x00" in content[:8192]:
        raise InvalidDocumentError("The file has a .txt extension but contains binary data.")


def validate_upload(raw_filename: str | None, content: bytes, max_bytes: int) -> ValidatedUpload:
    filename = sanitize_filename(raw_filename)
    extension = PurePath(filename).suffix.lower()
    file_type = ALLOWED_EXTENSIONS.get(extension)
    if file_type is None:
        allowed = ", ".join(sorted(ext.lstrip(".").upper() for ext in ALLOWED_EXTENSIONS))
        raise UnsupportedFileTypeError(f"Unsupported file type '{extension or 'none'}'. Upload a {allowed} file.")
    if len(content) == 0:
        raise InvalidDocumentError("The uploaded file is empty.")
    if len(content) > max_bytes:
        raise FileTooLargeError(f"The file is larger than the {max_bytes // (1024 * 1024)} MB limit.")
    _check_signature(file_type, content)
    return ValidatedUpload(filename=filename, file_type=file_type, content=content)
