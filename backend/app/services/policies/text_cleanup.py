"""Cleanup of PDF text-extraction artifacts, shared by ingestion and prompt building."""

import re

# Some PDF generators map list bullets to the DEL control character, and unmappable glyphs (e.g. "·") come out as
# U+FFFD. Both add noise to embeddings, prompts and the excerpts shown to users.
_BULLET_ARTIFACTS = re.compile(r"[\x7f▪●]")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x80-\x9f]")
_REPLACEMENT_CHAR = re.compile(r"\s*�\s*")


def clean_extraction_artifacts(text: str) -> str:
    text = _BULLET_ARTIFACTS.sub("•", text)
    text = _CONTROL_CHARS.sub(" ", text)
    return _REPLACEMENT_CHAR.sub(" - ", text)
