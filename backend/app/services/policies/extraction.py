"""Text extraction for PDF, DOCX and TXT policy documents.

Each extractor returns ``TextBlock``s carrying source metadata: PDF blocks are
pages, DOCX blocks are heading sections, and a TXT file is one block.
"""

import io
import logging
import re
from dataclasses import dataclass

from docx import Document as load_docx
from pypdf import PageObject, PdfReader
from pypdf.errors import PdfReadError

from app.schemas.policies import DocumentFileType
from app.services.policies.errors import InvalidDocumentError
from app.services.policies.pdf_tables import layout_text_to_plain, split_numbered_sections

logger = logging.getLogger(__name__)

# Below this many characters of real text we treat the document as having no extractable content.
MIN_EXTRACTED_CHARS = 20


@dataclass(frozen=True)
class TextBlock:
    text: str
    page_number: int | None = None
    section: str | None = None


@dataclass(frozen=True)
class ExtractedDocument:
    blocks: list[TextBlock]
    page_count: int | None

    @property
    def total_chars(self) -> int:
        return sum(len(block.text.strip()) for block in self.blocks)


def _page_text(page: PageObject) -> str:
    """
    Layout-preserving extraction, so tables can be recovered row by row (see pdf_tables). Falls back to plain
    extraction if layout mode fails on an unusual PDF.
    """
    try:
        return layout_text_to_plain(page.extract_text(extraction_mode="layout") or "")
    except Exception:  # noqa: BLE001 - pypdf can raise many error types on malformed content streams
        logger.info("Layout extraction failed for a PDF page; using plain extraction")
        return page.extract_text() or ""


_DIGITS = re.compile(r"\d+")


def _remove_running_headers(page_texts: list[str]) -> list[str]:
    """
    Drops lines that appear on every page of a multi-page PDF (running headers/footers such as the company name or
    "Policy X · Page 2 of 3"; digits are ignored when comparing). They carry no policy content and otherwise turn
    into near-empty, repetitive passages.
    """
    if len(page_texts) < 2:
        return page_texts

    def key(line: str) -> str:
        return _DIGITS.sub("#", line.strip().lower())

    per_page = [{key(line) for line in text.splitlines() if line.strip()} for text in page_texts]
    repeated = set.intersection(*per_page)
    return ["\n".join(line for line in text.splitlines() if not line.strip() or key(line) not in repeated) for text in page_texts]


def _extract_pdf(content: bytes) -> ExtractedDocument:
    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted and not reader.decrypt(""):
            raise InvalidDocumentError("The PDF is password-protected. Upload an unprotected copy.")
        page_texts = _remove_running_headers([_page_text(page) for page in reader.pages])
        blocks = []
        for page_number, page_text in enumerate(page_texts, start=1):
            # One block per numbered section on the page: chunks then never mix sections (or page boilerplate).
            for heading, text in split_numbered_sections(page_text):
                if text.strip():
                    blocks.append(TextBlock(text=text, page_number=page_number, section=heading))
        return ExtractedDocument(blocks=blocks, page_count=len(reader.pages))
    except InvalidDocumentError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError) as error:
        logger.warning("PDF extraction failed: %s", error)
        raise InvalidDocumentError("The PDF could not be read. It may be corrupt or use an unsupported format.") from error


def _extract_docx(content: bytes) -> ExtractedDocument:
    try:
        document = load_docx(io.BytesIO(content))
    except Exception as error:  # python-docx raises several unrelated exception types for bad files
        logger.warning("DOCX extraction failed: %s", error)
        raise InvalidDocumentError("The Word document could not be read. It may be corrupt.") from error

    # Group paragraphs under their most recent heading so chunks can cite a section.
    blocks: list[TextBlock] = []
    section: str | None = None
    lines: list[str] = []

    def flush() -> None:
        if any(line.strip() for line in lines):
            blocks.append(TextBlock(text="\n".join(lines), section=section))
        lines.clear()

    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        style = (paragraph.style.name if paragraph.style is not None else "") or ""
        if text and (style.startswith("Heading") or style == "Title"):
            flush()
            section = text[:200]
            lines.append(text)
        elif text:
            lines.append(text)
    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                lines.append(" | ".join(dict.fromkeys(cells)))  # merged cells repeat; keep each once
    flush()
    return ExtractedDocument(blocks=blocks, page_count=None)


def _extract_txt(content: bytes) -> ExtractedDocument:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:  # pragma: no cover - cp1252 decodes nearly everything; kept as a safeguard
        raise InvalidDocumentError("The text file uses an unsupported character encoding. Save it as UTF-8.")
    return ExtractedDocument(blocks=[TextBlock(text=text)] if text.strip() else [], page_count=None)


_EXTRACTORS = {
    DocumentFileType.PDF: _extract_pdf,
    DocumentFileType.DOCX: _extract_docx,
    DocumentFileType.TXT: _extract_txt,
}


def extract_text(file_type: DocumentFileType, content: bytes) -> ExtractedDocument:
    extracted = _EXTRACTORS[file_type](content)
    if extracted.total_chars < MIN_EXTRACTED_CHARS:
        hint = " Scanned PDFs need OCR before upload." if file_type is DocumentFileType.PDF else ""
        raise InvalidDocumentError(f"No readable text was found in the document.{hint}")
    return extracted
