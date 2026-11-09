"""Sentence-aware, overlapping chunking.

Chunks never cross a text block (PDF page or DOCX section), so every chunk keeps
accurate page/section metadata. Consecutive chunks share roughly ``overlap``
characters of trailing sentences so that ideas split across a boundary stay
retrievable.
"""

import re
from dataclasses import dataclass

from app.services.policies.extraction import TextBlock
from app.services.policies.text_cleanup import clean_extraction_artifacts

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?;:])\s+|\n{2,}")
_WHITESPACE = re.compile(r"[ \t\r\f\v]+")
# Chunks shorter than this carry too little meaning to be useful on their own.
MIN_CHUNK_CHARS = 30


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str
    page_number: int | None
    section: str | None


def normalize_text(text: str) -> str:
    text = clean_extraction_artifacts(text)
    lines = (_WHITESPACE.sub(" ", line).strip() for line in text.replace(" ", " ").splitlines())
    # Keep paragraph breaks (blank lines) but join wrapped lines within a paragraph.
    paragraphs, current = [], []
    for line in lines:
        if line:
            current.append(line)
        elif current:
            paragraphs.append(" ".join(current))
            current = []
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(paragraphs)


def _split_sentences(text: str, max_len: int) -> list[str]:
    """Sentences (or paragraph pieces); any sentence longer than ``max_len`` is split on word boundaries."""
    pieces: list[str] = []
    for sentence in (s.strip() for s in _SENTENCE_BOUNDARY.split(text)):
        if not sentence:
            continue
        while len(sentence) > max_len:
            cut = sentence.rfind(" ", 0, max_len)
            cut = cut if cut > max_len // 2 else max_len
            pieces.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if sentence:
            pieces.append(sentence)
    return pieces


def _chunk_block(text: str, chunk_size: int, overlap: int) -> list[str]:
    sentences = _split_sentences(text, chunk_size)
    chunks: list[str] = []
    current: list[str] = []
    length = 0
    for sentence in sentences:
        added = len(sentence) + (1 if current else 0)
        if current and length + added > chunk_size:
            chunks.append(" ".join(current))
            # Carry trailing sentences (up to `overlap` chars) into the next chunk.
            carried: list[str] = []
            carried_len = 0
            for previous in reversed(current):
                if carried_len + len(previous) + 1 > overlap:
                    break
                carried.insert(0, previous)
                carried_len += len(previous) + 1
            current, length = carried, max(carried_len - 1, 0)
            # Drop carried sentences if they would push the new chunk past the size limit.
            while current and length + len(sentence) + 1 > chunk_size:
                length = max(length - len(current.pop(0)) - 1, 0)
            added = len(sentence) + (1 if current else 0)
        current.append(sentence)
        length += added
    if current:
        chunks.append(" ".join(current))
    return chunks


def chunk_blocks(blocks: list[TextBlock], chunk_size: int, overlap: int) -> list[Chunk]:
    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError("chunk_size must be positive and overlap must be between 0 and chunk_size")
    chunks: list[Chunk] = []
    for block in blocks:
        for text in _chunk_block(normalize_text(block.text), chunk_size, overlap):
            if len(text) >= MIN_CHUNK_CHARS or not chunks:
                chunks.append(Chunk(index=len(chunks), text=text, page_number=block.page_number, section=block.section))
            else:
                # Fold a tiny trailing fragment into the previous chunk from the same block when possible.
                previous = chunks[-1]
                if previous.page_number == block.page_number and previous.section == block.section:
                    chunks[-1] = Chunk(previous.index, f"{previous.text} {text}", previous.page_number, previous.section)
                else:
                    chunks.append(Chunk(index=len(chunks), text=text, page_number=block.page_number, section=block.section))
    return chunks
