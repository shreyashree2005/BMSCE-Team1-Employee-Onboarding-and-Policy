"""Quizzes built from the policy passages behind a Policy Assistant answer.

No language model is involved, so nothing is invented. A question is a sentence copied from a retrieved passage
with one figure blanked out, e.g. "Full-time employees receive ____ days of paid annual leave per calendar year."
The correct option is the figure the policy states; the other three are other values. The questions come from the
passages the answer cited, then from neighbouring passages of the same policy document if more are needed.

Building is deterministic: the same passages always give the same questions in the same order with the same option
order. Grading rebuilds the quiz from the same passage IDs, so the answer key never leaves the server and nothing
has to be stored between the two requests.
"""

import hashlib
import math
import random
import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.data.policy_quizzes import PolicyQuestion, PolicyQuiz, QuestionSource
from app.db.models import PolicyChunkRecord, PolicyDocumentRecord
from app.schemas.policies import DocumentStatus
from app.services.policies.grounding import sanitize_source_text
from app.services.policies.text_cleanup import clean_extraction_artifacts

QUIZ_LENGTH = 5
MAX_QUESTIONS_PER_PASSAGE = 2
MAX_SOURCE_PASSAGES = 10
ATTEMPT_KEY_PREFIX = "chat:"

_POLICY_ID = re.compile(r"OIQ-[A-Z]+-[A-Z]+-\d+")
_WORD_NUMBER = (
    r"(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|"
    r"nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?"
)
_UNIT = r"(?:working days?|calendar days?|business days?|days?|weeks?|months?|years?|hours?|minutes?|characters?|children|times|sessions?)"


@dataclass(frozen=True)
class _Kind:
    name: str
    pattern: re.Pattern[str]


# Figures that can be blanked, in order of preference. Group "v" is the value.
_KINDS = (
    _Kind("money", re.compile(r"INR\s?(?P<v>\d[\d,]*(?:\.\d+)?)")),
    _Kind("percent", re.compile(r"\b(?P<v>\d+(?:\.\d+)?)\s?(?:%|per ?cent)")),
    _Kind("number", re.compile(rf"\b{_WORD_NUMBER}\s\((?P<v>\d+(?:\.\d+)?)\)", re.IGNORECASE)),
    _Kind("number", re.compile(rf"\b(?P<v>\d+(?:\.\d+)?)(?=\s+{_UNIT}\b)", re.IGNORECASE)),
    _Kind("ordinal", re.compile(r"\b(?P<v>\d{1,2})(?:st|nd|rd|th)\b")),
)


@dataclass(frozen=True)
class _Fact:
    chunk: PolicyChunkRecord
    sentence_index: int
    sentence: str
    kind: str
    value: float
    start: int
    end: int


class QuizUnavailableError(Exception):
    """The passages don't hold enough figures for a full quiz, or they no longer exist (document re-uploaded/deleted)."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def policy_title(filename: str) -> str:
    """'OIQ-HR-LEA-001_Leave-and-Attendance-Policy.pdf' -> 'Leave and Attendance Policy'."""
    stem = re.sub(r"\.(pdf|docx|txt)$", "", filename, flags=re.IGNORECASE)
    stem = _POLICY_ID.sub("", stem).strip("_- ")
    return re.sub(r"[_-]+", " ", stem).strip() or filename


def attempt_key(document: PolicyDocumentRecord) -> str:
    """Where attempts at this document's chat quizzes are recorded (kept apart from the curated quizzes' policy IDs)."""
    match = _POLICY_ID.search(document.filename)
    return ATTEMPT_KEY_PREFIX + (match.group(0) if match else f"doc-{document.id[:8]}")


def _sentences(chunk: PolicyChunkRecord) -> list[str]:
    text = clean_extraction_artifacts(sanitize_source_text(chunk.text))
    if chunk.section and text.startswith(chunk.section):
        text = text[len(chunk.section) :]
    text = re.sub(r"\s*[•�●]\s*", ". ", text)  # bullets become sentence breaks
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z(])", re.sub(r"\s+", " ", text).strip())
    return [p.strip(" .:;,") + "." for p in parts if 40 <= len(p.strip()) <= 260]


def _parse(value: str) -> float:
    return float(value.replace(",", ""))


def _fact_in(chunk: PolicyChunkRecord, index: int, sentence: str) -> _Fact | None:
    for kind in _KINDS:
        for match in kind.pattern.finditer(sentence):
            if re.fullmatch(r"(19|20)\d\d", match.group("v")):
                continue  # years make poor questions
            value = _parse(match.group("v"))
            rest = sentence[: match.start()] + sentence[match.end() :]
            digits = match.group("v")
            words = re.findall(_WORD_NUMBER, match.group(0), re.IGNORECASE)
            if re.search(rf"(?<![\d,.]){re.escape(digits)}(?![\d,])", rest) or any(re.search(rf"\b{w}\b", rest, re.IGNORECASE) for w in words):
                continue  # the answer would still be visible elsewhere in the sentence
            return _Fact(chunk, index, sentence, kind.name, value, match.start(), match.end())
    return None


def _is_table_row(sentence: str) -> bool:
    """Rows flattened from a PDF table ("Leave type: Annual leave; Days per year: 18; ...") make awkward questions."""
    return sentence.count(":") >= 2 or sentence.count(";") >= 2


def _facts(chunk: PolicyChunkRecord) -> list[_Fact]:
    found = [_fact_in(chunk, i, s) for i, s in enumerate(_sentences(chunk)) if not _is_table_row(s)]
    return [f for f in found if f is not None]


def _indian_grouping(n: int) -> str:
    s = str(n)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return ",".join([head, *groups, tail]) if head else ",".join([*groups, tail])


def _format(kind: str, value: float) -> str:
    number = int(value) if float(value).is_integer() else value
    if kind == "money":
        return f"INR {_indian_grouping(int(value))}"
    if kind == "percent":
        return f"{number}%"
    if kind == "ordinal":
        n = int(value)
        suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
        return f"{n}{suffix}"
    return str(number)


def _variants(kind: str, value: float) -> list[float]:
    if kind == "ordinal":
        return [v for v in (10, 15, 25, 5, 28, 1) if v != value]
    if not float(value).is_integer():
        return [value + 0.5, max(0.5, value - 0.5), value * 2, value + 1]
    n = int(value)
    if kind == "money":
        return [n * 2, n // 2, n * 3 // 2, n * 4]
    small = [n + 1, n - 1, n + 2, n * 2] if n <= 5 else []
    return [*small, n * 2, round(n / 2), n + 5, n - 5, n + 10, n * 3]


def _options(fact: _Fact, same_kind_values: list[float], seed: str) -> tuple[list[str], int]:
    correct = _format(fact.kind, fact.value)
    distractors: list[str] = []
    # Up to two other values of the same kind from this policy (plausible), then nearby values.
    others = sorted({v for v in same_kind_values if v != fact.value and v > 0}, key=lambda v: abs(math.log(v / fact.value)) if fact.value > 0 else v)
    for value in [*others[:2], *_variants(fact.kind, fact.value)]:
        label = _format(fact.kind, value)
        if value > 0 and label != correct and label not in distractors:
            distractors.append(label)
        if len(distractors) == 3:
            break
    options = [correct, *distractors]
    random.Random(seed).shuffle(options)
    return options, options.index(correct)


def _question(fact: _Fact, same_kind_values: list[float]) -> PolicyQuestion:
    blanked = fact.sentence[: fact.start] + "____" + fact.sentence[fact.end :]
    question_id = f"c{fact.chunk.id}-s{fact.sentence_index}"
    options, answer = _options(fact, same_kind_values, hashlib.sha256(f"{question_id}|{fact.sentence}".encode()).hexdigest())
    document = fact.chunk.document
    return PolicyQuestion(
        id=question_id,
        question=f"Complete the policy statement: “{blanked}”",
        options=(options[0], options[1], options[2], options[3]),
        answer=answer,
        explanation=f"The policy says: “{fact.sentence}”",
        source=QuestionSource(
            chunk_id=fact.chunk.id, document_id=document.id, document_name=document.filename, page_number=fact.chunk.page_number,
            section=fact.chunk.section, excerpt=clean_extraction_artifacts(fact.chunk.text)[:700],
        ),  # fmt: skip
    )


@dataclass(frozen=True)
class GeneratedQuiz:
    quiz: PolicyQuiz
    attempt_key: str
    chunk_ids: list[int]


def build_answer_quiz(session: Session, chunk_ids: list[int]) -> GeneratedQuiz:
    """
    Five questions from the given passages (the answer's citations, in order), topped up from neighbouring passages
    of the first cited policy document. Raises QuizUnavailableError when that isn't possible.
    """
    chunk_ids = list(dict.fromkeys(chunk_ids))[:MAX_SOURCE_PASSAGES]
    if not chunk_ids:
        raise QuizUnavailableError(422, "This answer has no policy sources to build a quiz from.")
    rows = session.scalars(
        select(PolicyChunkRecord)
        .join(PolicyDocumentRecord)
        .where(PolicyChunkRecord.id.in_(chunk_ids), PolicyDocumentRecord.status == DocumentStatus.READY)
        .options(selectinload(PolicyChunkRecord.document))
    ).all()
    by_id = {row.id: row for row in rows}
    if len(by_id) != len(chunk_ids):
        raise QuizUnavailableError(409, "The policy behind this answer has changed since it was given. Ask the question again to get a new quiz.")
    cited = [by_id[i] for i in chunk_ids]
    primary = cited[0].document
    document_chunks = list(
        session.scalars(select(PolicyChunkRecord).where(PolicyChunkRecord.document_id == primary.id).order_by(PolicyChunkRecord.chunk_index)).all()
    )
    # Neighbours of the cited passages within the same policy, closest first.
    cited_indexes = [c.chunk_index for c in cited if c.document_id == primary.id]
    neighbours = sorted(
        (c for c in document_chunks if c.id not in by_id),
        key=lambda c: (min(abs(c.chunk_index - i) for i in cited_indexes), c.chunk_index),
    )

    values_by_kind: dict[str, list[float]] = {}
    for chunk in document_chunks:
        for fact in _facts(chunk):
            values_by_kind.setdefault(fact.kind, []).append(fact.value)

    # Round-robin over the cited passages first (one fact each, then a second), then the neighbours. A first pass skips
    # facts whose answer was already used (e.g. two questions answered "the 20th"); a second pass allows them if needed.
    candidates: list[_Fact] = []
    for group in (cited, neighbours):
        per_chunk = [_facts(chunk)[:MAX_QUESTIONS_PER_PASSAGE] for chunk in group]
        for round_index in range(MAX_QUESTIONS_PER_PASSAGE):
            candidates += [facts[round_index] for facts in per_chunk if round_index < len(facts)]
    chosen: list[_Fact] = []
    for allow_repeated_answers in (False, True):
        for fact in candidates:
            if len(chosen) == QUIZ_LENGTH:
                break
            if fact in chosen or any(c.sentence == fact.sentence for c in chosen):
                continue
            if not allow_repeated_answers and any((c.kind, c.value) == (fact.kind, fact.value) for c in chosen):
                continue
            chosen.append(fact)
    # Keep the questions in source order: cited passages first, as they were found.
    chosen.sort(key=candidates.index)
    if len(chosen) < QUIZ_LENGTH:
        raise QuizUnavailableError(422, "This policy doesn't contain enough specific details for a 5-question quiz.")

    questions = tuple(_question(fact, values_by_kind.get(fact.kind, [])) for fact in chosen)
    return GeneratedQuiz(PolicyQuiz(attempt_key(primary), f"{policy_title(primary.filename)} quiz", questions), attempt_key(primary), chunk_ids)
