"""Recovers tables from layout-preserving PDF text.

Plain PDF text extraction emits each table cell on its own line, and chunking then joins them into a run-on
sentence ("Public holidays 10 Not applicable Published every January"), so readers (and the LLM) can't tell which
value belongs to which column. Layout extraction keeps cells aligned in columns; this module turns such aligned
blocks into one self-describing line per row:

    "Leave type: Public holidays; Days per year: 10; Carry forward: Not applicable; Notice required: Published every January."

Only blocks that look clearly tabular are converted (a header row with at least three aligned columns and at least
two data rows); everything else is returned as ordinary text with layout spacing collapsed.
"""

import re

_COLUMN_GAP = re.compile(r"\S+(?: \S+)*")  # runs of text separated by 2+ spaces
MIN_COLUMNS = 3
MIN_DATA_ROWS = 2
COLUMN_TOLERANCE = 3  # characters a cell may start away from its column


def _segments(line: str) -> list[tuple[int, str]]:
    """(start column, text) for each run of text separated by two or more spaces."""
    return [(match.start(), match.group(0)) for match in _COLUMN_GAP.finditer(line)]


def _column_of(start: int, column_starts: list[int]) -> int | None:
    distances = [abs(start - column) for column in column_starts]
    best = min(range(len(column_starts)), key=distances.__getitem__)
    return best if distances[best] <= COLUMN_TOLERANCE else None


def _parse_table(lines: list[str], begin: int) -> tuple[list[list[str]], int] | None:
    """Parses a table starting at ``lines[begin]`` (the header). Returns (rows incl. header, index after table)."""
    header = _segments(lines[begin])
    if len(header) < MIN_COLUMNS:
        return None
    column_starts = [start for start, _ in header]
    rows: list[list[str]] = [[text for _, text in header]]
    index = begin + 1
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        segments = _segments(line)
        columns = [_column_of(start, column_starts) for start, _ in segments]
        if None in columns or len(set(columns)) != len(columns):
            break  # not aligned with this table
        if columns[0] == 0:
            if len(segments) < 2:
                break  # a lone line at the left margin (e.g. the next heading) ends the table
            row = [""] * len(column_starts)
            for column, (_, text) in zip(columns, segments, strict=True):
                row[column] = text
            rows.append(row)
        elif len(rows) > 1:
            for column, (_, text) in zip(columns, segments, strict=True):  # wrapped continuation of the previous row
                rows[-1][column] = f"{rows[-1][column]} {text}".strip()
        else:
            break
        index += 1
    if len(rows) - 1 < MIN_DATA_ROWS:
        return None
    return rows, index


def _row_sentence(header: list[str], row: list[str]) -> str:
    parts = [f"{name}: {value}" for name, value in zip(header, row, strict=True) if value]
    return "; ".join(parts) + "."


# A numbered section heading on its own line, e.g. "1. Annual paid leave" or "2.3 Leave application process".
_NUMBERED_HEADING = re.compile(r"^\d{1,2}(?:\.\d{1,2})*\.?\s+[A-Z][^\n]{1,78}$")


def split_numbered_sections(text: str) -> list[tuple[str | None, str]]:
    """
    Splits page text at numbered section headings into (heading, text) parts; text before the first heading has
    heading None. Keeping sections apart stops page boilerplate (headers, notices, document-control tables) from
    being chunked together with a section's facts, which weakens retrieval. Lines ending in punctuation (numbered
    list items or sentences) are not headings.
    """
    parts: list[tuple[str | None, list[str]]] = [(None, [])]
    previous_blank = True
    for line in text.splitlines():
        stripped = line.strip()
        is_heading = previous_blank and bool(_NUMBERED_HEADING.match(stripped)) and not stripped.endswith((".", ":", ";", ","))
        if is_heading:
            parts.append((stripped, [stripped]))
        else:
            parts[-1][1].append(line)
        previous_blank = not stripped
    return [(heading, "\n".join(lines).strip()) for heading, lines in parts if "\n".join(lines).strip()]


def layout_text_to_plain(text: str) -> str:
    """Converts layout-mode PDF text to plain text, rewriting aligned tables as one line per row."""
    lines = text.splitlines()
    output: list[str] = []
    index = 0
    while index < len(lines):
        parsed = _parse_table(lines, index) if lines[index].strip() else None
        if parsed:
            rows, index = parsed
            header = rows[0]
            output.append("")
            for row in rows[1:]:
                output.extend([_row_sentence(header, row), ""])  # blank line keeps each row its own paragraph
            continue
        output.append(re.sub(r"\s{2,}", " ", lines[index]).strip())
        index += 1
    return "\n".join(output)
