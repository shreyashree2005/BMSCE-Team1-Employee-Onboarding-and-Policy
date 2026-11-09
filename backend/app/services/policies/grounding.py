"""Heuristic grounding checks for Policy Assistant answers.

These are deliberately conservative text heuristics, not proofs of correctness:
- citations: parse the model's source references, keep only IDs that were retrieved;
- figures: every number in a sentence must appear (as digits or words) in the passage(s) it cites;
- uncited claims: substantive sentences with no citation in their paragraph;
- conflicts: passages from different documents that give different figures for the same thing;
- sanitising: document text can't fake our delimiters, citation markers or chat-template tokens.

Known limits (documented in the README): paraphrased claims without numbers aren't
verified, number words beyond the supported vocabulary aren't normalised, and
conflict detection only compares figures with units (e.g. "18 days" vs "20 days").
"""

import re
from dataclasses import dataclass, field

from app.services.policies.text_cleanup import clean_extraction_artifacts

# ---- Number normalisation ----

_UNITS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19,
}
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}
_ORDINALS = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9,
    "tenth": 10, "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15, "sixteenth": 16,
    "seventeenth": 17, "eighteenth": 18, "nineteenth": 19, "twentieth": 20, "thirtieth": 30, "fortieth": 40,
    "fiftieth": 50, "sixtieth": 60, "seventieth": 70, "eightieth": 80, "ninetieth": 90, "hundredth": 100,
}
_NUMBER_WORD = re.compile(
    r"\b(?:(" + "|".join(_TENS) + r")[-\s](" + "|".join(list(_UNITS)[1:10]) + r"|" + "|".join(list(_ORDINALS)[:9]) + r")"
    r"|(" + "|".join(sorted({**_UNITS, **_TENS, **_ORDINALS}, key=len, reverse=True)) + r")"
    r")(?:\s+hundred)?\b",
    re.IGNORECASE,
)
# Number words that usually aren't quantities ("first payment", "second step", "one of the policies").
_AMBIGUOUS_ORDINALS = {"first", "second", "one"}
_ORDINAL_SUFFIX = re.compile(r"\b(\d+)(?:st|nd|rd|th)\b", re.IGNORECASE)
_DUPLICATE_NUMBER = re.compile(r"\b(\d+(?:\.\d+)?)\s*\(\s*\1\s*\)")  # "18 (18)" -> "18"
_FIGURE = re.compile(r"\d+(?:\.\d+)?")


def _word_value(match: re.Match[str]) -> str:
    tens, unit, single = match.group(1), match.group(2), match.group(3)
    if tens:
        lowered_unit = unit.lower()
        value = _TENS[tens.lower()] + (_UNITS.get(lowered_unit) or _ORDINALS.get(lowered_unit, 0))
    else:
        word = single.lower()
        if word in _AMBIGUOUS_ORDINALS:
            return match.group(0)
        value = _UNITS.get(word, _TENS.get(word, _ORDINALS.get(word, 0)))
    if match.group(0).lower().endswith("hundred"):
        value *= 100
    return str(value)


def normalize_numbers(text: str) -> str:
    """'eighteen (18) days', '20th' and 'twenty-first' become '18 days', '20' and '21'."""
    text = _NUMBER_WORD.sub(_word_value, text)
    text = _ORDINAL_SUFFIX.sub(r"\1", text)
    return _DUPLICATE_NUMBER.sub(r"\1", text)


def normalize_for_matching(text: str) -> str:
    """Lower-case, numbers as digits, unified apostrophes and whitespace (used for fact matching)."""
    text = normalize_numbers(text.replace("’", "'").replace("‘", "'"))
    return re.sub(r"\s+", " ", text.lower()).strip()


def extract_figures(text: str) -> set[str]:
    return set(_FIGURE.findall(normalize_numbers(text)))


# ---- Citations ----

# Accepts [S1], [s1], [S 1], [S1, S2], [S1; S3], [S1 and S2] and [Source 2]; anything else in brackets that
# starts with S/Source but doesn't parse is treated as malformed and removed.
_CITATION_GROUP = re.compile(r"\[\s*((?:S|Source)\s*\d{1,2}(?:\s*(?:,|;|and|&)\s*(?:S|Source)?\s*\d{1,2})*)\s*\]", re.IGNORECASE)
_MALFORMED_CITATION = re.compile(r"\[\s*(?:S|Source)\s*[^\]\d]{0,12}\]|\[\s*\]", re.IGNORECASE)
_ID_NUMBER = re.compile(r"\d{1,2}")


@dataclass
class CitationParse:
    text: str  # answer with citations normalised to "[S1]" and invalid ones removed
    cited_ids: list[str]  # valid IDs in order of first use
    total_markers: int
    invalid_markers: int


def parse_citations(raw: str, valid_ids: set[str]) -> CitationParse:
    cited: list[str] = []
    total = invalid = 0

    def replace_group(match: re.Match[str]) -> str:
        nonlocal total, invalid
        rendered = []
        for number in _ID_NUMBER.findall(match.group(1)):
            total += 1
            source_id = f"S{int(number)}"
            if source_id in valid_ids:
                rendered.append(f"[{source_id}]")
                if source_id not in cited:
                    cited.append(source_id)
            else:
                invalid += 1
        return "".join(rendered)

    def remove_malformed(match: re.Match[str]) -> str:
        nonlocal total, invalid
        total += 1
        invalid += 1
        return ""

    text = _CITATION_GROUP.sub(replace_group, raw)
    text = _MALFORMED_CITATION.sub(remove_malformed, text)
    text = re.sub(r"[ \t]+([.,;:])", r"\1", text)  # tidy spaces left before punctuation
    text = re.sub(r"[ \t]{2,}", " ", text).strip()
    return CitationParse(text=text, cited_ids=cited, total_markers=total, invalid_markers=invalid)


_CITED = re.compile(r"\[(S\d{1,2})\]")


# ---- Claims (sentences) ----

@dataclass
class Claim:
    text: str
    cited_ids: list[str]  # citations attached to this sentence, or to its paragraph if the sentence has none


def split_claims(answer: str) -> list[Claim]:
    """Splits into sentences; a sentence without its own citation inherits the citations of its paragraph/bullet."""
    claims: list[Claim] = []
    for paragraph in re.split(r"\n+", answer):
        paragraph = re.sub(r"^\s*[-•*]\s+", "", paragraph).strip()
        if not paragraph:
            continue
        paragraph_ids = list(dict.fromkeys(_CITED.findall(paragraph)))
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", paragraph):
            own = list(dict.fromkeys(_CITED.findall(sentence)))
            claims.append(Claim(text=sentence.strip(), cited_ids=own or paragraph_ids))
    return claims


_LIST_MARKER = re.compile(r"^\s*\d+[.)]\s+")


def find_unsupported_figures(answer: str, source_texts: dict[str, str]) -> list[tuple[str, str]]:
    """
    (figure, sentence) pairs where a number in a sentence appears in none of the passages that sentence cites
    (falling back to all cited passages for uncited sentences). Digits and number words are treated alike.
    """
    all_cited = {source_id for source_id in _CITED.findall(answer) if source_id in source_texts}
    source_figures = {source_id: extract_figures(text) for source_id, text in source_texts.items()}
    unsupported: list[tuple[str, str]] = []
    for claim in split_claims(answer):
        sentence = _LIST_MARKER.sub("", _CITED.sub("", claim.text))
        figures = extract_figures(sentence)
        if not figures:
            continue
        cited = [source_id for source_id in claim.cited_ids if source_id in source_texts] or sorted(all_cited)
        allowed: set[str] = set().union(*(source_figures[source_id] for source_id in cited)) if cited else set()
        unsupported.extend((figure, claim.text) for figure in sorted(figures - allowed))
    return unsupported


def count_uncited_claims(answer: str, min_words: int = 5) -> int:
    """Substantive sentences (5+ words) with no citation in the sentence or its paragraph."""
    return sum(1 for claim in split_claims(answer) if not claim.cited_ids and len(claim.text.split()) >= min_words)


# ---- Conflicts between passages ----

_STOP = set(
    """a an the and or of to in for on at by with from as is are be been was were this that these those it its may must can
    will shall should would could not no any all each every per their there they them our your you we us than then into
    up out over under after before during within without about such other more most less least also only same""".split()
)
_UNIT_ROOTS = {
    "day": "day", "days": "day", "week": "week", "weeks": "week", "month": "month", "months": "month", "year": "year",
    "years": "year", "hour": "hour", "hours": "hour", "minute": "minute", "minutes": "minute", "character": "character",
    "characters": "character", "holiday": "holiday", "holidays": "holiday", "percent": "percent", "%": "percent",
}
_TOKEN = re.compile(r"\d+(?:\.\d+)?|%|[a-z][a-z'-]*")
UNIT_LOOKAHEAD = 4
TOPIC_WINDOW = 8
MIN_SHARED_TERMS = 3
MIN_TOPIC_OVERLAP = 0.5
HEAD_TERMS_AFTER_UNIT = 3
MIN_HEAD_SIMILARITY = 0.75


@dataclass(frozen=True)
class FigureMention:
    value: str
    unit: str
    terms: frozenset[str]  # content words around the figure (broad topic)
    head: frozenset[str]  # content words between figure and unit plus the next few (what is being counted)


@dataclass
class ConflictFinding:
    source_ids: tuple[str, str]
    values: tuple[str, str]
    unit: str
    shared_terms: list[str] = field(default_factory=list)
    head_terms: list[str] = field(default_factory=list)  # what is being counted, e.g. ["annual", "leave", "paid"]


def _mentions(text: str) -> list[FigureMention]:
    tokens = _TOKEN.findall(normalize_numbers(text).lower())
    mentions = []
    for index, token in enumerate(tokens):
        if not token[0].isdigit():
            continue
        unit = next((_UNIT_ROOTS[t] for t in tokens[index + 1 : index + 1 + UNIT_LOOKAHEAD] if t in _UNIT_ROOTS), None)
        if unit is None:
            continue
        window = tokens[max(0, index - TOPIC_WINDOW) : index + TOPIC_WINDOW + 1]
        terms = frozenset(t for t in window if _is_content(t))
        unit_index = next(i for i in range(index + 1, index + 1 + UNIT_LOOKAHEAD) if tokens[i] in _UNIT_ROOTS)
        after = [t for t in tokens[unit_index + 1 : unit_index + 1 + TOPIC_WINDOW] if _is_content(t)][:HEAD_TERMS_AFTER_UNIT]
        head = frozenset([t for t in tokens[index + 1 : unit_index] if _is_content(t)] + after)
        mentions.append(FigureMention(value=token, unit=unit, terms=terms, head=head))
    return mentions


def _is_content(token: str) -> bool:
    return not token[0].isdigit() and token not in _STOP and token not in _UNIT_ROOTS and len(token) > 3


def _same_quantity(a: FigureMention, b: FigureMention) -> bool:
    """Same unit, same thing being counted (head phrase) and the same broader topic."""
    if a.unit != b.unit or a.value == b.value:
        return False
    head_union = a.head | b.head
    if head_union and len(a.head & b.head) / len(head_union) < MIN_HEAD_SIMILARITY:
        return False
    shared = a.terms & b.terms
    return len(shared) >= MIN_SHARED_TERMS and len(shared) / max(1, min(len(a.terms), len(b.terms))) >= MIN_TOPIC_OVERLAP


def detect_conflicts(passages: dict[str, tuple[str, str]]) -> list[ConflictFinding]:
    """
    ``passages`` maps source ID -> (document ID, text). Flags pairs of passages from *different* documents that state
    different figures with the same unit about the same topic (by shared surrounding terms). One finding per pair.
    """
    mentions = {source_id: _mentions(text) for source_id, (_, text) in passages.items()}
    ids = sorted(passages, key=lambda s: int(s[1:]))
    findings: list[ConflictFinding] = []
    for i, first in enumerate(ids):
        for second in ids[i + 1 :]:
            if passages[first][0] == passages[second][0]:
                continue
            for a in mentions[first]:
                match = next((b for b in mentions[second] if _same_quantity(a, b)), None)
                if match:
                    findings.append(ConflictFinding((first, second), (a.value, match.value), a.unit, sorted(a.terms & match.terms), sorted(a.head | match.head)))
                    break
    return findings


# ---- Source sanitising (prompt-injection hardening) ----

_DELIMITER_TAGS = re.compile(r"<\s*/?\s*(?:source|policy_sources)\b[^>]*>", re.IGNORECASE)
_CHAT_TEMPLATE_TOKENS = re.compile(r"<\|[^|>]{0,40}\|>|\[/?INST\]|<</?SYS>>|<\s*/?\s*(?:system|assistant|user)\s*>", re.IGNORECASE)
_SOURCE_CITATION = re.compile(r"\[\s*(S|Source)\s*(\d{1,2})\s*\]", re.IGNORECASE)


# Sentences addressed to an AI rather than to employees. Policy text virtually never contains these phrases,
# so removing the whole sentence is low-risk; it stops a document from planting "facts" via instructions.
_INSTRUCTION_LIKE = re.compile(
    r"\b(?:ignore|disregard|forget|override)\b[^.!?\n]{0,40}\b(?:previous|prior|above|earlier|all|system)\b[^.!?\n]{0,20}\b(?:instructions?|rules?|prompts?|messages?)\b"
    r"|\byou are now\b|\b(?:admin|developer|god|jailbreak|dan)\s+mode\b|\bsystem\s+(?:prompt|instruction|message)s?\b"
    r"|\b(?:reveal|print|repeat|show)\b[^.!?\n]{0,30}\b(?:prompt|instructions)\b|\bas an ai\b|\bthe (?:assistant|ai|model|chatbot) (?:must|should|will)\b"
    r"|^\W*(?:tell|inform) (?:every|all|each|the) (?:employees?|users?|staff)\b|\b(?:you must|you should) (?:always )?(?:answer|respond|reply|say|state)\b|\balways (?:answer|reply|say|state) (?:that|with)\b"
    r"|\bcite \(?\[?s(?:ource)?\s*\d",
    re.IGNORECASE,
)
_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+|\n+")
INSTRUCTION_REMOVED = "[instruction-like text removed]"


def remove_instruction_like_sentences(text: str) -> tuple[str, int]:
    """Drops sentences that try to instruct the assistant. Returns the cleaned text and how many were removed."""
    kept: list[str] = []
    removed = 0
    for sentence in _SENTENCE_BREAK.split(text):
        if _INSTRUCTION_LIKE.search(sentence):
            removed += 1
            if not kept or kept[-1] != INSTRUCTION_REMOVED:
                kept.append(INSTRUCTION_REMOVED)
        elif sentence.strip():
            kept.append(sentence.strip())
    return (" ".join(kept), removed) if removed else (text, 0)


def sanitize_source_text(text: str) -> str:
    """
    Neutralises text that could close/fake our delimiters, imitate chat roles, pre-write citation markers or
    instruct the assistant. The structural defence (fixed system prompt, delimited untrusted data) still applies.
    """
    text = clean_extraction_artifacts(text)  # passages stored before this cleanup existed
    text = _DELIMITER_TAGS.sub("[tag removed]", text)
    text = _CHAT_TEMPLATE_TOKENS.sub("[token removed]", text)
    text = _SOURCE_CITATION.sub(r"(\1 \2)", text)
    return remove_instruction_like_sentences(text)[0]


# ---- Question/passage topical overlap ----

def content_terms(text: str) -> set[str]:
    """Rough content words with naive plural stripping, for a secondary relevance signal."""
    terms = set()
    for token in re.findall(r"[a-z]{4,}", text.lower()):
        if token in _STOP:
            continue
        terms.add(token[:-1] if token.endswith("s") and not token.endswith("ss") else token)
    return terms


# Question words that say little about the topic; ignored when looking for terms the passages don't cover.
_GENERIC_QUESTION_TERMS = {
    "policy", "company", "employee", "work", "working", "required", "require", "need", "allowed", "allow", "entitled",
    "exact", "many", "much", "long", "often", "possible", "able", "should", "what", "when", "where", "which", "does",
    "have", "there", "rule", "know", "please", "tell", "after", "before",
}


def conflict_concerns_question(finding: ConflictFinding, question: str, min_coverage: float = 0.75) -> bool:
    """True when most of the conflict's head phrase (what is being counted) appears in the question."""
    head = {term[:-1] if term.endswith("s") and not term.endswith("ss") else term for term in finding.head_terms}
    return bool(head) and len(head & content_terms(question)) / len(head) >= min_coverage


def uncovered_question_terms(question: str, passages: list[str]) -> list[str]:
    """Distinctive question terms that appear in none of the passages (e.g. 'parental' when only annual leave is covered)."""
    covered = set().union(*(content_terms(p) for p in passages)) if passages else set()
    # Compare in the same plural-stripped form content_terms produces (e.g. "does" -> "doe").
    generic = content_terms(" ".join(_GENERIC_QUESTION_TERMS))
    return sorted(content_terms(question) - covered - generic)


# ---- Attribution for answers the model forgot to cite ----

# A sentence is attributed to a passage only if that passage contains nearly all of the sentence's content words
# and every figure in it, i.e. the sentence restates the passage rather than adding to it.
MIN_ATTRIBUTION_COVERAGE = 0.8
MIN_ATTRIBUTION_TERMS = 3
_TRAILING_PUNCTUATION = re.compile(r"([.!?;:]+)$")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")
_BULLET_PREFIX = re.compile(r"^(\s*(?:[-•*]|\d+[.)])\s+)")


def _attribute_sentence(sentence: str, source_terms: dict[str, set[str]], source_figures: dict[str, set[str]]) -> str | None:
    """The source ID that fully supports the sentence, or None."""
    terms = content_terms(normalize_numbers(sentence))
    figures = extract_figures(sentence)
    best_id, best_coverage = None, 0.0
    for source_id, available in source_terms.items():
        if not figures <= source_figures[source_id]:
            continue
        coverage = len(terms & available) / len(terms)
        if coverage > best_coverage:
            best_id, best_coverage = source_id, coverage
    return best_id if best_coverage >= MIN_ATTRIBUTION_COVERAGE else None


def attribute_uncited_answer(answer: str, source_texts: dict[str, str]) -> str | None:
    """
    For an answer with no citation markers: adds ``[S#]`` to each sentence that one passage fully supports
    (>= 80% of its content words and all of its figures). Returns None if any substantive sentence isn't
    supported, so the caller keeps the HR fallback. Short connective text ("Here is a summary:") is left as is.
    Small local models often restate the passages correctly but omit the markers on broad questions.
    """
    source_terms = {source_id: content_terms(normalize_numbers(text)) for source_id, text in source_texts.items()}
    source_figures = {source_id: extract_figures(text) for source_id, text in source_texts.items()}
    attributed_any = False
    lines = []
    for line in answer.split("\n"):
        prefix_match = _BULLET_PREFIX.match(line)
        prefix = prefix_match.group(1) if prefix_match else ""
        sentences = []
        for sentence in _SENTENCE_SPLIT.split(line[len(prefix):].strip()) if line.strip() else []:
            terms = content_terms(normalize_numbers(sentence))
            if len(terms) < MIN_ATTRIBUTION_TERMS or (sentence.rstrip().endswith(":") and not extract_figures(sentence)):
                sentences.append(sentence)  # connective text or a lead-in, not a policy claim
                continue
            source_id = _attribute_sentence(sentence, source_terms, source_figures)
            if source_id is None:
                return None
            attributed_any = True
            punctuation = _TRAILING_PUNCTUATION.search(sentence.rstrip())
            body = sentence.rstrip()[: punctuation.start()] if punctuation else sentence.rstrip()
            sentences.append(f"{body} [{source_id}]{punctuation.group(1) if punctuation else ''}")
        lines.append(prefix + " ".join(sentences) if sentences else line)
    return "\n".join(lines) if attributed_any else None


# ---- Citation repair for cited answers ----

# A cited passage "supports" a claim if it contains at least half of the claim's content words and all its figures
# (lenient, to allow paraphrase). Stricter re-attribution (MIN_ATTRIBUTION_COVERAGE) is used to move a citation.
MIN_SUPPORT_COVERAGE = 0.5
_MARKER = re.compile(r"\s*\[(S\d{1,2})\]")


def _supports(claim: str, source_text_terms: set[str], source_figures: set[str]) -> bool:
    terms = content_terms(normalize_numbers(claim))
    if not terms:
        return True
    return extract_figures(claim) <= source_figures and len(terms & source_text_terms) / len(terms) >= MIN_SUPPORT_COVERAGE


def repair_citations(answer: str, source_texts: dict[str, str]) -> str:
    """
    Cleans up a cited answer before validation:
    - repeated claims (small models sometimes loop, e.g. the same bullet cited to S1, S2, S3...) are kept once;
    - a citation whose passage doesn't contain the claim is dropped; if none of a claim's citations support it,
      the citation moves to the one passage that fully supports it, or the original citations are kept so the
      figure and coverage checks still flag the claim.
    Only citation markers and duplicate claims change; the wording of the answer is never altered.
    """
    source_terms = {source_id: content_terms(normalize_numbers(text)) for source_id, text in source_texts.items()}
    source_figures = {source_id: extract_figures(text) for source_id, text in source_texts.items()}
    seen: set[str] = set()
    output: list[str] = []
    for line in answer.split("\n"):
        if not line.strip():
            output.append(line)
            continue
        prefix_match = _BULLET_PREFIX.match(line)
        prefix = prefix_match.group(1) if prefix_match else ""
        kept: list[str] = []
        for sentence in _SENTENCE_SPLIT.split(line[len(prefix):].strip()):
            cited = list(dict.fromkeys(_MARKER_ID.findall(sentence)))
            claim = _MARKER.sub("", _CITATION_LEAD_IN.sub("", sentence)).strip()
            fingerprint = re.sub(r"\W+", " ", claim.lower()).strip()
            if fingerprint and fingerprint in seen and len(content_terms(claim)) >= MIN_ATTRIBUTION_TERMS:
                continue  # duplicate claim
            seen.add(fingerprint)
            if not cited:
                kept.append(sentence)
                continue
            supported = [s for s in cited if s in source_texts and _supports(claim, source_terms[s], source_figures[s])]
            if not supported:
                best = _attribute_sentence(claim, source_terms, source_figures) if len(content_terms(claim)) >= MIN_ATTRIBUTION_TERMS else None
                supported = [best] if best else cited
            if supported == cited:
                kept.append(sentence)  # citations already right: keep the sentence exactly as written
                continue
            claim = _CITATION_LEAD_IN.sub("", _MARKER.sub("", _CITATION_LEAD_IN.sub("", sentence))).strip()
            claim = claim[:1].upper() + claim[1:]
            punctuation = _TRAILING_PUNCTUATION.search(claim)
            body = claim[: punctuation.start()] if punctuation else claim
            markers = "".join(f"[{s}]" for s in supported)
            kept.append(f"{body} {markers}{punctuation.group(1) if punctuation else ''}")
        if kept:
            output.append(prefix + " ".join(kept))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(output)).strip()


_MARKER_ID = re.compile(r"\[(S\d{1,2})\]")
# "According to [S2], ..." style lead-ins, removed when that citation has to move.
_CITATION_LEAD_IN = re.compile(r"(?i)\b(?:according to|as (?:stated|noted|described|mentioned) in|as per|per)\s+(?:\[S\d{1,2}\]\s*(?:and\s*)?)+,?\s*")
