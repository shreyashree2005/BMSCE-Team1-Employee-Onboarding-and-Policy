"""Evaluation framework tests: metric maths, dataset ground truth against the real files, and reproducibility."""

import json
from pathlib import Path

import pytest

from app.schemas.policies import DocumentFileType
from app.services.policies.chunking import chunk_blocks
from app.services.policies.extraction import extract_text
from app.services.policies.grounding import normalize_for_matching
from evaluation import metrics
from evaluation.runner import REPO_ROOT, load_dataset, run_evaluation

FILE_TYPES = {".pdf": DocumentFileType.PDF, ".docx": DocumentFileType.DOCX, ".txt": DocumentFileType.TXT}


# ---- Metrics ----


def test_hits_at_k_counts_expected_sources_found() -> None:
    ranked = [5, 9, 2, 7]
    assert metrics.hits_at_k(ranked, [{2}], 1) == 0
    assert metrics.hits_at_k(ranked, [{2}], 3) == 1
    assert metrics.hits_at_k(ranked, [{9}, {7}], 2) == 0.5
    assert metrics.hits_at_k(ranked, [], 5) is None


def test_reciprocal_rank() -> None:
    assert metrics.reciprocal_rank([5, 9, 2], [{2, 9}]) == 0.5
    assert metrics.reciprocal_rank([5, 9, 2], [{4}]) == 0.0
    assert metrics.reciprocal_rank([5], []) is None


def test_fact_coverage_normalises_numbers_and_case() -> None:
    found, missing = metrics.fact_coverage("Employees receive eighteen (18) days. Payslips arrive two working days before payment.", ["18 days", "2 working days", "march 31"])
    assert found == ["18 days", "2 working days"] and missing == ["march 31"]


def test_ratio_and_mean_never_invent_values() -> None:
    assert metrics.ratio(0, 0) is None
    assert metrics.ratio(1, 3) == 0.3333
    assert metrics.mean([None, None]) is None
    assert metrics.mean([1.0, None, 0.0]) == 0.5


def test_binary_rates() -> None:
    rates = metrics.binary_rates([(True, True), (True, False), (False, True), (False, False)])
    assert rates == {"true_positives": 1, "false_positives": 1, "false_negatives": 1, "true_negatives": 1, "precision": 0.5, "recall": 0.5}


# ---- Dataset ground truth ----

DATASET = load_dataset()


def _document_text(relative_path: str, page: int | None, section: str | None) -> str:
    path = REPO_ROOT / relative_path
    blocks = extract_text(FILE_TYPES[path.suffix], path.read_bytes()).blocks
    chunks = chunk_blocks(blocks, 500, 100)
    return " ".join(c.text for c in chunks if (page is None or c.page_number == page) and (section is None or c.section == section))


def test_dataset_corpora_files_exist() -> None:
    for files in DATASET.corpora.values():
        for relative in files:
            assert (REPO_ROOT / relative).is_file(), relative


@pytest.mark.parametrize("case", [c for c in DATASET.cases if c.key_facts], ids=lambda c: c.id)
def test_every_key_fact_is_in_the_expected_source_location(case) -> None:
    """Ground truth must come from the actual files: each key fact appears in one of the expected sources at the stated page/section."""
    corpus = DATASET.corpora[case.corpus]
    texts = []
    for source in case.expected_sources:
        path = next(p for p in corpus if Path(p).name == source.document)
        texts.append(normalize_for_matching(_document_text(path, source.page, source.section)))
    for fact in case.key_facts:
        assert any(normalize_for_matching(fact) in text for text in texts), f"{case.id}: '{fact}' not found in expected sources"


def test_dataset_covers_required_categories() -> None:
    categories = {category for case in DATASET.cases for category in case.categories}
    for required in ["direct", "cross_document", "unanswerable", "numeric", "salary", "leave", "benefits", "dates", "ambiguous", "conflict", "follow_up", "injection"]:
        assert required in categories, required
    assert all(not c.answerable and c.expect_escalation for c in DATASET.cases if "unanswerable" in c.categories)


def test_unanswerable_cases_are_really_absent_from_the_corpus() -> None:
    corpus_text = normalize_for_matching(" ".join(_document_text(p, None, None) for p in DATASET.corpora["base"]))
    for term in ["parental", "maternity", "dress code", "gym", "stock option", "meeting room"]:
        assert term not in corpus_text, term


# ---- Runner (deterministic: hashing embeddings + scripted generator) ----

SUBSET = ["leave-annual-days", "security-password-length", "unanswerable-off-topic", "conflict-annual-days", "conflict-control-sick-days", "injection-vacation-days", "followup-annual-after-sick"]


def _without_timing(results: dict) -> dict:
    copy = json.loads(json.dumps(results))
    copy["meta"].pop("generated_at")
    copy["meta"].pop("duration_seconds")
    return copy


def test_evaluation_is_reproducible_and_saves_json(tmp_path: Path) -> None:
    out = tmp_path / "results.json"
    first = run_evaluation(mode="scripted", embedding_provider="hashing", case_ids=SUBSET, output_path=out)
    second = run_evaluation(mode="scripted", embedding_provider="hashing", case_ids=SUBSET)

    assert _without_timing(first) == _without_timing(second)
    saved = json.loads(out.read_text(encoding="utf-8"))
    assert saved["meta"]["mode"] == "scripted"
    assert "NOT measure the answer quality" in saved["meta"]["disclaimer"]
    assert sorted(c["id"] for c in saved["cases"]) == sorted(SUBSET)  # runner keeps dataset order
    assert set(saved["aggregates"]) >= {"retrieval", "abstention", "citations", "answers", "escalation", "conflicts", "injection"}


def test_evaluation_scores_key_behaviours() -> None:
    results = run_evaluation(mode="scripted", embedding_provider="hashing", case_ids=SUBSET)
    by_id = {c["id"]: c for c in results["cases"]}

    assert by_id["unanswerable-off-topic"]["answer"]["answered_from_documents"] is False
    assert by_id["conflict-annual-days"]["answer"]["conflict_detected"] is True
    assert by_id["conflict-annual-days"]["answer"]["escalated"] is True
    assert by_id["conflict-control-sick-days"]["answer"]["conflict_detected"] is False
    assert by_id["injection-vacation-days"]["answer"]["forbidden_content_found"] == []
    assert results["aggregates"]["citations"]["raw_citation_validity"] == 1.0
    assert results["validator_probes"]["unsupported_figures"]["faithful_quotes_falsely_flagged_rate"] == 0.0


def test_unknown_case_ids_are_rejected() -> None:
    with pytest.raises(ValueError, match="Unknown case IDs"):
        run_evaluation(mode="scripted", embedding_provider="hashing", case_ids=["does-not-exist"])


def test_llm_mode_requires_credentials() -> None:
    from tests.conftest import make_settings

    with pytest.raises(SystemExit, match="LLM_API_KEY"):
        run_evaluation(mode="llm", embedding_provider="hashing", case_ids=SUBSET[:1], settings=make_settings("sqlite://"))
