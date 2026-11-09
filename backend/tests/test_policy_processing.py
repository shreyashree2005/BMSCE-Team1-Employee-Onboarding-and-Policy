"""Unit tests: validation, extraction, chunking, embeddings and the FAISS vector store."""

import zipfile
from io import BytesIO
from pathlib import Path

import numpy as np
import pytest

from app.schemas.policies import DocumentFileType
from app.services.policies.chunking import chunk_blocks, normalize_text
from app.services.policies.embeddings import HashingEmbedder
from app.services.policies.errors import FileTooLargeError, InvalidDocumentError, UnsupportedFileTypeError
from app.services.policies.extraction import TextBlock, extract_text
from app.services.policies.file_storage import PolicyFileStorage
from app.services.policies.validation import sanitize_filename, validate_upload
from app.services.policies.vector_store import FaissVectorStore
from tests.policy_samples import LEAVE_POLICY, make_docx, make_pdf

MB = 1024 * 1024


# ---- Validation ----


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd.txt", "passwd.txt"),
        ("C:\\Users\\me\\Leave Policy.pdf", "Leave Policy.pdf"),
        ("bad\x00name\n.docx", "badname.docx"),
        ("   ", "document"),
        (None, "document"),
    ],
)
def test_sanitize_filename_strips_paths_and_control_characters(raw: str | None, expected: str) -> None:
    assert sanitize_filename(raw) == expected


def test_sanitize_filename_caps_length_but_keeps_extension() -> None:
    name = sanitize_filename("a" * 500 + ".pdf")
    assert len(name) == 200 and name.endswith(".pdf")


@pytest.mark.parametrize("filename", ["policy.exe", "policy.doc", "policy", "policy.pdf.exe", "archive.zip"])
def test_unsupported_extensions_are_rejected(filename: str) -> None:
    with pytest.raises(UnsupportedFileTypeError):
        validate_upload(filename, b"some content here", MB)


def test_empty_file_is_rejected() -> None:
    with pytest.raises(InvalidDocumentError, match="empty"):
        validate_upload("policy.txt", b"", MB)


def test_file_over_size_limit_is_rejected() -> None:
    with pytest.raises(FileTooLargeError):
        validate_upload("policy.txt", b"x" * (MB + 1), MB)


def test_extension_must_match_content() -> None:
    with pytest.raises(InvalidDocumentError, match="not a valid PDF"):
        validate_upload("policy.pdf", b"just plain text pretending to be a pdf", MB)
    with pytest.raises(InvalidDocumentError, match="not a valid Word"):
        validate_upload("policy.docx", b"plain text", MB)
    with pytest.raises(InvalidDocumentError, match="binary"):
        validate_upload("policy.txt", b"MZ\x00\x00\x90binary", MB)


def test_zip_that_is_not_a_word_document_is_rejected() -> None:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("readme.txt", "hello")
    with pytest.raises(InvalidDocumentError, match="not a Word"):
        validate_upload("policy.docx", buffer.getvalue(), MB)


def test_file_type_comes_from_validated_extension() -> None:
    assert validate_upload("Policy.PDF", make_pdf(["Hello"]), MB).file_type is DocumentFileType.PDF


# ---- Extraction ----


def test_pdf_extraction_keeps_page_numbers() -> None:
    extracted = extract_text(DocumentFileType.PDF, make_pdf(["Annual leave is eighteen days per year.", "", "Sick leave is eight days per year."]))

    assert extracted.page_count == 3
    assert [block.page_number for block in extracted.blocks] == [1, 3]  # blank page 2 skipped
    assert "eighteen days" in extracted.blocks[0].text


def test_pdf_without_text_is_rejected() -> None:
    with pytest.raises(InvalidDocumentError, match="No readable text"):
        extract_text(DocumentFileType.PDF, make_pdf(["", ""]))


def test_corrupt_pdf_is_rejected() -> None:
    with pytest.raises(InvalidDocumentError):
        extract_text(DocumentFileType.PDF, b"%PDF-1.4\nthis is not really a pdf body")


def test_docx_extraction_groups_text_by_heading() -> None:
    content = make_docx([("Annual Leave", ["Employees receive eighteen days of annual leave."]), ("Sick Leave", ["Eight days of sick leave are provided."])])

    blocks = extract_text(DocumentFileType.DOCX, content).blocks

    assert [block.section for block in blocks] == ["Annual Leave", "Sick Leave"]
    assert "eighteen days" in blocks[0].text


def test_txt_extraction_handles_utf8_bom_and_windows_encoding() -> None:
    assert "café" in extract_text(DocumentFileType.TXT, "\ufeffThe café policy applies to all staff members.".encode()).blocks[0].text
    assert "naïve" in extract_text(DocumentFileType.TXT, "A naïve reading of this policy is not enough.".encode("cp1252")).blocks[0].text


def test_whitespace_only_text_is_rejected() -> None:
    with pytest.raises(InvalidDocumentError):
        extract_text(DocumentFileType.TXT, b"   \n\n\t  ")


# ---- Chunking ----


def test_chunks_respect_size_and_overlap() -> None:
    text = " ".join(f"Sentence number {i} explains a detail of the leave policy." for i in range(60))

    chunks = chunk_blocks([TextBlock(text=text)], chunk_size=300, overlap=80)

    assert len(chunks) > 5
    assert all(len(chunk.text) <= 300 for chunk in chunks)
    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))
    for previous, current in zip(chunks, chunks[1:]):
        last_sentence = previous.text.split(". ")[-1]
        assert last_sentence in current.text, "consecutive chunks should share trailing context"


def test_chunks_never_cross_pages_and_keep_metadata() -> None:
    blocks = [TextBlock(text="Page one talks about annual leave entitlements.", page_number=1), TextBlock(text="Page two covers payroll dates in detail.", page_number=2, section="Payroll")]

    chunks = chunk_blocks(blocks, chunk_size=500, overlap=50)

    assert [(c.page_number, c.section) for c in chunks] == [(1, None), (2, "Payroll")]


def test_long_sentences_are_split_on_word_boundaries() -> None:
    chunks = chunk_blocks([TextBlock(text="word " * 400)], chunk_size=250, overlap=0)
    assert all(len(c.text) <= 250 for c in chunks)
    assert all(not c.text.startswith(" ") and "wor d" not in c.text for c in chunks)


def test_normalize_text_joins_wrapped_lines_but_keeps_paragraphs() -> None:
    assert normalize_text("Line one\nline two\n\n\nNext   paragraph") == "Line one line two\n\nNext paragraph"


@pytest.mark.parametrize(("size", "overlap"), [(0, 0), (100, 100), (100, -1)])
def test_invalid_chunk_configuration_is_rejected(size: int, overlap: int) -> None:
    with pytest.raises(ValueError):
        chunk_blocks([TextBlock(text=LEAVE_POLICY)], chunk_size=size, overlap=overlap)


# ---- Embeddings & vector store ----


def test_hashing_embedder_is_deterministic_and_normalised() -> None:
    embedder = HashingEmbedder()
    first, second = embedder.embed(["annual leave policy"]), embedder.embed(["annual leave policy"])

    assert np.array_equal(first, second)
    assert first.shape == (1, 384)
    assert np.isclose(np.linalg.norm(first[0]), 1.0)


def test_vector_store_search_save_load_and_remove(tmp_path: Path) -> None:
    embedder = HashingEmbedder()
    store = FaissVectorStore(tmp_path, embedder.model_name)
    texts = ["annual leave days per year", "phishing emails security", "salary payment date"]
    store.add([101, 102, 103], embedder.embed(texts))
    store.save()

    reloaded = FaissVectorStore(tmp_path, embedder.model_name)
    assert reloaded.load()
    assert reloaded.ids() == {101, 102, 103}
    assert reloaded.search(embedder.embed(["how many leave days"])[0], 1)[0][0] == 101

    assert reloaded.remove([101]) == 1
    assert 101 not in {i for i, _ in reloaded.search(embedder.embed(["leave days"])[0], 3)}


def test_vector_store_ignores_index_built_with_another_model(tmp_path: Path) -> None:
    store = FaissVectorStore(tmp_path, "model-a")
    store.add([1], HashingEmbedder().embed(["text"]))
    store.save()

    assert not FaissVectorStore(tmp_path, "model-b").load()


def test_file_storage_never_overwrites_and_rejects_unsafe_names(tmp_path: Path) -> None:
    storage = PolicyFileStorage(tmp_path)
    name = "0123456789abcdef0123456789abcdef.txt"
    storage.save(name, b"first")
    with pytest.raises(FileExistsError):
        storage.save(name, b"second")
    assert (tmp_path / name).read_bytes() == b"first"
    with pytest.raises(ValueError):
        storage.save("../escape.txt", b"x")
