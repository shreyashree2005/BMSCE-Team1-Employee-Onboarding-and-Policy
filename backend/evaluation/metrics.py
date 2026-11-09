"""Pure metric functions. Kept free of I/O so they are easy to unit test."""

from collections.abc import Iterable, Sequence

from app.services.policies.grounding import normalize_for_matching


def ratio(numerator: float, denominator: float) -> float | None:
    """numerator / denominator, or None when there is nothing to measure (never a misleading 0 or 1)."""
    return None if denominator == 0 else round(numerator / denominator, 4)


def mean(values: Iterable[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return None if not present else round(sum(present) / len(present), 4)


def hits_at_k(ranked_ids: Sequence[int], relevant_groups: Sequence[set[int]], k: int) -> float | None:
    """
    Recall@K over *expected sources*: the share of relevant groups (one group per expected source) with at
    least one relevant chunk in the top K results. Returns None when the case has no expected sources.
    """
    if not relevant_groups:
        return None
    top = set(ranked_ids[:k])
    return sum(1 for group in relevant_groups if group & top) / len(relevant_groups)


def reciprocal_rank(ranked_ids: Sequence[int], relevant_groups: Sequence[set[int]]) -> float | None:
    """1 / rank of the first relevant chunk from any expected source (0 if none was retrieved)."""
    if not relevant_groups:
        return None
    relevant = set().union(*relevant_groups)
    for rank, chunk_id in enumerate(ranked_ids, start=1):
        if chunk_id in relevant:
            return 1 / rank
    return 0.0


def fact_coverage(answer: str, key_facts: Sequence[str]) -> tuple[list[str], list[str]]:
    """Which expected key facts appear in the answer after normalisation (case, number words, apostrophes)."""
    normalized = normalize_for_matching(answer)
    found = [fact for fact in key_facts if normalize_for_matching(fact) in normalized]
    return found, [fact for fact in key_facts if fact not in found]


def contains_any(answer: str, phrases: Sequence[str]) -> list[str]:
    normalized = normalize_for_matching(answer)
    return [phrase for phrase in phrases if normalize_for_matching(phrase) in normalized]


def binary_rates(pairs: Iterable[tuple[bool, bool]]) -> dict[str, float | int | None]:
    """Precision/recall for (expected, predicted) boolean pairs, e.g. conflict detection."""
    tp = fp = fn = tn = 0
    for expected, predicted in pairs:
        if expected and predicted:
            tp += 1
        elif predicted:
            fp += 1
        elif expected:
            fn += 1
        else:
            tn += 1
    return {"true_positives": tp, "false_positives": fp, "false_negatives": fn, "true_negatives": tn, "precision": ratio(tp, tp + fp), "recall": ratio(tp, tp + fn)}
