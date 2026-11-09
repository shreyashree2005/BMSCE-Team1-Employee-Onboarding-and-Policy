"""Runs the evaluation dataset through the real Policy Assistant pipeline and scores it.

Each corpus is ingested into a fresh temporary SQLite database and FAISS index using the real
extraction, chunking and embedding code. Questions go through ``PolicyAssistantService`` exactly as the
API does; only the answer generator differs by mode (scripted stand-in or a real configured LLM).
"""

import json
import platform
import re
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Callable
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.config import Settings
from app.db.init_db import create_tables
from app.db.session import create_db_engine, create_session_factory
from app.schemas.policies import ChatHistoryMessage
from app.services.llm.provider import LLMProvider, create_llm_provider
from app.services.policies.assistant import EvidenceThresholds, PolicyAssistantService
from app.services.policies.embeddings import Embedder, create_embedder
from app.services.policies.errors import PolicyServiceError
from app.services.policies.file_storage import PolicyFileStorage
from app.services.policies.grounding import find_unsupported_figures, normalize_for_matching, normalize_numbers
from app.services.policies.repository import PolicyRepository
from app.services.policies.service import IngestionConfig, PolicyDocumentService
from app.services.policies.vector_store import FaissVectorStore
from evaluation import metrics
from evaluation.generators import ScriptedExtractiveGenerator

REPO_ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = Path(__file__).with_name("dataset.json")
RESULTS_DIR = Path(__file__).with_name("results")
K_VALUES = (1, 3, 5)

Mode = Literal["scripted", "llm"]
EmbeddingProvider = Literal["sentence-transformers", "hashing"]

MODE_DISCLAIMERS = {
    "scripted": (
        "Deterministic pipeline evaluation with a scripted extractive generator (not an LLM). It measures retrieval, "
        "abstention gating, citation handling and the grounding validators. It does NOT measure the answer quality of "
        "an AI language model, and its answer metrics must not be reported as model accuracy."
    ),
    "llm": (
        "Evaluation with a real LLM. Answer metrics are lexical heuristics (key-fact matching, citation checks); they "
        "indicate grounding behaviour on this small fictional dataset, not general correctness. Results vary between "
        "runs and models."
    ),
}


# ---- Dataset ----

class ExpectedSource(BaseModel):
    document: str
    page: int | None = None
    section: str | None = None


class EvalCase(BaseModel):
    id: str
    categories: list[str]
    corpus: str
    question: str
    history: list[ChatHistoryMessage] = Field(default_factory=list)
    answerable: bool
    expected_sources: list[ExpectedSource]
    key_facts: list[str]
    expect_escalation: bool
    expect_conflict: bool | None = None
    forbidden_content: list[str] = Field(default_factory=list)
    notes: str | None = None


class EvalDataset(BaseModel):
    version: str
    description: str
    corpora: dict[str, list[str]]
    cases: list[EvalCase]


def load_dataset(path: Path = DATASET_PATH) -> EvalDataset:
    dataset = EvalDataset.model_validate(json.loads(path.read_text(encoding="utf-8")))
    ids = [case.id for case in dataset.cases]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate case IDs in evaluation dataset")
    for case in dataset.cases:
        if case.corpus not in dataset.corpora:
            raise ValueError(f"Case {case.id} uses unknown corpus {case.corpus!r}")
    return dataset


# ---- Corpus setup ----

@dataclass
class CorpusIndex:
    service: PolicyDocumentService
    chunks_by_document: dict[str, list[tuple[int, int | None, str | None, str]]]  # filename -> (chunk id, page, section, text)
    close: Callable[[], None]  # releases the database (Windows can't delete open SQLite files)


def _build_corpus(name: str, files: list[str], workdir: Path, embedder: Embedder, ingestion: IngestionConfig) -> CorpusIndex:
    engine = create_db_engine(f"sqlite:///{(workdir / f'{name}.db').as_posix()}")
    create_tables(engine)
    session = create_session_factory(engine)()
    service = PolicyDocumentService(
        session, embedder, FaissVectorStore(workdir / name / "index", embedder.model_name), PolicyFileStorage(workdir / name / "files"), ingestion
    )
    for relative in files:
        path = REPO_ROOT / relative
        service.ingest(path.name, path.read_bytes())
    chunks: dict[str, list[tuple[int, int | None, str | None, str]]] = {}
    repository = PolicyRepository(session)
    for document in repository.list_documents():
        detail = repository.get_document(document.id, with_chunks=True)
        assert detail is not None
        chunks[document.filename] = [(c.id, c.page_number, c.section, c.text) for c in detail.chunks]
    def close() -> None:
        session.close()
        engine.dispose()

    return CorpusIndex(service=service, chunks_by_document=chunks, close=close)


def relevant_chunk_groups(case: EvalCase, corpus: CorpusIndex) -> list[set[int]]:
    """
    One set of relevant chunk IDs per expected source: chunks of the expected document at the expected
    page/section that contain at least one key fact (falling back to all chunks at that location).
    """
    groups = []
    for source in case.expected_sources:
        located = [
            (chunk_id, text)
            for chunk_id, page, section, text in corpus.chunks_by_document.get(source.document, [])
            if (source.page is None or page == source.page) and (source.section is None or section == source.section)
        ]
        with_fact = {chunk_id for chunk_id, text in located if any(normalize_for_matching(f) in normalize_for_matching(text) for f in case.key_facts)}
        groups.append(with_fact or {chunk_id for chunk_id, _ in located})
    return groups


# ---- Validator probes (independent of the generator) ----

def figure_validator_probes(dataset: EvalDataset, corpora: dict[str, CorpusIndex]) -> dict[str, Any]:
    """
    For each numeric key fact, build a faithful quote of the sentence that contains it and a copy with that figure
    altered (+7). A good unsupported-figure detector flags every altered copy and no faithful quote.
    """
    seen: set[tuple[str, str]] = set()
    faithful_flags = altered_flags = total = 0
    examples = []
    for case in dataset.cases:
        corpus = corpora.get(case.corpus)
        if corpus is None:
            continue
        for fact in case.key_facts:
            figure = re.search(r"\d+(?:\.\d+)?", normalize_numbers(fact))
            if not figure:
                continue
            for source in case.expected_sources:
                for _, page, section, text in corpus.chunks_by_document.get(source.document, []):
                    if (source.page is not None and page != source.page) or (source.section is not None and section != source.section):
                        continue
                    sentence = next((s for s in re.split(r"(?<=[.!?])\s+", text) if normalize_for_matching(fact) in normalize_for_matching(s)), None)
                    if not sentence or (text, fact) in seen:
                        continue
                    seen.add((text, fact))
                    value = figure.group(0)
                    altered_value = str(round(float(value) + 7, 2)).removesuffix(".0")
                    faithful = f"{normalize_numbers(sentence)} [S1]"
                    altered = re.sub(rf"(?<![\d.]){re.escape(value)}(?![\d.])", altered_value, normalize_numbers(sentence), count=1) + " [S1]"
                    total += 1
                    faithful_flags += bool(find_unsupported_figures(faithful, {"S1": text}))
                    altered_flagged = bool(find_unsupported_figures(altered, {"S1": text}))
                    altered_flags += altered_flagged
                    if len(examples) < 3:
                        examples.append({"fact": fact, "altered": altered, "flagged": altered_flagged})
    return {
        "probes": total,
        "altered_figures_flagged_rate": metrics.ratio(altered_flags, total),
        "faithful_quotes_falsely_flagged_rate": metrics.ratio(faithful_flags, total),
        "examples": examples,
        "method": "Sentences containing each numeric key fact are quoted faithfully and with the figure changed by +7; "
        "find_unsupported_figures is run on both against the source passage.",
    }


# ---- Main entry point ----

def _make_generator(mode: Mode, settings: Settings) -> LLMProvider:
    if mode == "scripted":
        return ScriptedExtractiveGenerator()
    provider = create_llm_provider(
        api_key=settings.llm_api_key, model=settings.llm_model, base_url=settings.llm_base_url,
        timeout_seconds=settings.llm_timeout_seconds, temperature=settings.llm_temperature, max_tokens=settings.llm_max_tokens,
    )
    if not provider.is_configured:
        raise SystemExit("LLM mode needs LLM_API_KEY (and optionally LLM_MODEL, LLM_BASE_URL) in backend/.env or the environment.")
    return provider


def run_evaluation(
    *,
    mode: Mode = "scripted",
    embedding_provider: EmbeddingProvider = "sentence-transformers",
    case_ids: list[str] | None = None,
    output_path: Path | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    settings = settings or Settings()
    dataset = load_dataset()
    cases = [c for c in dataset.cases if case_ids is None or c.id in case_ids]
    if case_ids and len(cases) != len(set(case_ids)):
        raise ValueError(f"Unknown case IDs: {sorted(set(case_ids) - {c.id for c in cases})}")

    # Hashing similarities are on a different scale from MiniLM, so use the thresholds the test suite uses for it.
    thresholds = (
        EvidenceThresholds(0.15, 0.40) if embedding_provider == "hashing" else EvidenceThresholds(settings.rag_min_relevance, settings.rag_strong_relevance)
    )
    ingestion = IngestionConfig(settings.policy_max_upload_bytes, settings.policy_chunk_size, settings.policy_chunk_overlap)
    embedder = create_embedder(embedding_provider, settings.embedding_model)
    generator = _make_generator(mode, settings)

    case_results = []
    with tempfile.TemporaryDirectory(prefix="onboardiq-eval-") as tmp:
        corpora: dict[str, CorpusIndex] = {}
        try:
            for name in sorted({c.corpus for c in cases}):
                corpora[name] = _build_corpus(name, dataset.corpora[name], Path(tmp), embedder, ingestion)
            for case in cases:
                case_results.append(_evaluate_case(case, corpora[case.corpus], generator, thresholds, settings.rag_top_k))
            probes = figure_validator_probes(EvalDataset(**{**dataset.model_dump(), "cases": [c.model_dump() for c in cases]}), corpora)
        finally:
            for corpus in corpora.values():
                corpus.close()

    results = {
        "meta": {
            "mode": mode,
            "disclaimer": MODE_DISCLAIMERS[mode],
            "generator": generator.model_name,
            "llm_base_url_host": re.sub(r"^https?://([^/]+).*$", r"\1", settings.llm_base_url) if mode == "llm" else None,
            "embedding_provider": embedding_provider,
            "embedding_model": embedder.model_name,
            "chunking": {"size": settings.policy_chunk_size, "overlap": settings.policy_chunk_overlap},
            "retrieval": {"top_k": settings.rag_top_k, "min_relevance": thresholds.min_relevance, "strong_relevance": thresholds.strong_relevance},
            "dataset_version": dataset.version,
            "cases": len(cases),
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "duration_seconds": round(time.perf_counter() - started, 1),
            "python": platform.python_version(),
        },
        "aggregates": _aggregate(case_results),
        "validator_probes": {"unsupported_figures": probes},
        "cases": case_results,
    }
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    return results


def _evaluate_case(case: EvalCase, corpus: CorpusIndex, generator: LLMProvider, thresholds: EvidenceThresholds, top_k: int) -> dict[str, Any]:
    assistant = PolicyAssistantService(corpus.service, generator, thresholds, top_k)
    record: dict[str, Any] = {
        "id": case.id,
        "categories": case.categories,
        "corpus": case.corpus,
        "question": case.question,
        "answerable": case.answerable,
        "expect_escalation": case.expect_escalation,
        "expect_conflict": case.expect_conflict,
    }
    try:
        response, diagnostics = assistant.answer_with_diagnostics(case.question, case.history)
    except PolicyServiceError as error:
        record.update({"error": {"code": error.code, "detail": error.detail}})
        return record

    ranked = [r.chunk_id for r in diagnostics.retrieved]
    groups = relevant_chunk_groups(case, corpus)
    found, missing = metrics.fact_coverage(response.answer, case.key_facts) if response.answered_from_documents else ([], list(case.key_facts))
    expected_documents = {s.document for s in case.expected_sources}
    cited_documents = [c.document_name for c in response.citations]
    conflict_detected = bool(diagnostics.conflicts)
    forbidden = metrics.contains_any(response.answer, case.forbidden_content)

    record.update(
        {
            "retrieval": {
                "query": diagnostics.retrieval_query,
                "top_documents": [r.document_name for r in diagnostics.retrieved],
                "top_scores": [round(r.score, 4) for r in diagnostics.retrieved],
                **{f"recall_at_{k}": metrics.hits_at_k(ranked, groups, k) for k in K_VALUES},
                "reciprocal_rank": metrics.reciprocal_rank(ranked, groups),
            },
            "answer": {
                "text": response.answer,
                "answered_from_documents": response.answered_from_documents,
                "evidence_level": response.evidence.level,
                "llm_called": diagnostics.llm_called,
                "fallback_reason": diagnostics.fallback_reason,
                "key_facts_found": found,
                "key_facts_missing": missing,
                # 0 when the system abstained on an answerable question (no facts were delivered).
                "fact_coverage": metrics.ratio(len(found), len(case.key_facts)) if case.key_facts else None,
                "raw_citation_markers": diagnostics.total_citation_markers,
                "invalid_citation_markers": diagnostics.invalid_citation_markers,
                "cited_documents": cited_documents,
                "cited_documents_expected": sum(1 for d in cited_documents if d in expected_documents),
                "unsupported_figures": [figure for figure, _ in diagnostics.unsupported_figures],
                "uncited_claims": diagnostics.uncited_claims,
                "escalated": response.escalation.recommended,
                "escalation_reason": response.escalation.reason,
                "conflict_detected": conflict_detected,
                "forbidden_content_found": forbidden,
            },
            "checks": {
                "answerability_correct": response.answered_from_documents == case.answerable,
                "escalation_matches": response.escalation.recommended == case.expect_escalation,
                "conflict_matches": None if case.expect_conflict is None else conflict_detected == case.expect_conflict,
                "all_key_facts_found": None if not case.key_facts else not missing,
                "no_forbidden_content": not forbidden,
            },
        }
    )
    return record


def _aggregate(results: list[dict[str, Any]]) -> dict[str, Any]:
    ok = [r for r in results if "error" not in r]
    answerable = [r for r in ok if r["answerable"]]
    unanswerable = [r for r in ok if not r["answerable"]]
    with_sources = [r for r in answerable if r["retrieval"]["reciprocal_rank"] is not None]
    answered = [r for r in answerable if r["answer"]["answered_from_documents"]]
    total_markers = sum(r["answer"]["raw_citation_markers"] for r in ok)
    invalid_markers = sum(r["answer"]["invalid_citation_markers"] for r in ok)
    cited = sum(len(r["answer"]["cited_documents"]) for r in answerable)
    cited_expected = sum(r["answer"]["cited_documents_expected"] for r in answerable)
    by_category: dict[str, list[dict[str, Any]]] = {}
    for r in ok:
        for category in r["categories"]:
            by_category.setdefault(category, []).append(r)

    return {
        "cases_total": len(results),
        "cases_errored": len(results) - len(ok),
        "retrieval": {
            "cases": len(with_sources),
            **{f"recall_at_{k}": metrics.mean(r["retrieval"][f"recall_at_{k}"] for r in with_sources) for k in K_VALUES},
            "mrr": metrics.mean(r["retrieval"]["reciprocal_rank"] for r in with_sources),
        },
        "abstention": {
            "unanswerable_cases": len(unanswerable),
            "correct_abstention_rate": metrics.ratio(sum(not r["answer"]["answered_from_documents"] for r in unanswerable), len(unanswerable)),
            "abstained_without_llm_call": sum(1 for r in unanswerable if not r["answer"]["llm_called"]),
            "answerable_cases": len(answerable),
            "false_abstention_rate": metrics.ratio(sum(not r["answer"]["answered_from_documents"] for r in answerable), len(answerable)),
        },
        "citations": {
            "raw_markers": total_markers,
            "raw_citation_validity": metrics.ratio(total_markers - invalid_markers, total_markers),
            "final_citations_on_answerable": cited,
            "citation_source_precision": metrics.ratio(cited_expected, cited),
        },
        "answers": {
            "answered_answerable_cases": len(answered),
            "key_fact_coverage_when_answered": metrics.mean(r["answer"]["fact_coverage"] for r in answered),
            "key_fact_coverage_all_answerable": metrics.mean(r["answer"]["fact_coverage"] for r in answerable),
            "answers_with_unsupported_figures": sum(1 for r in ok if r["answer"]["unsupported_figures"]),
            "answers_with_uncited_claims": sum(1 for r in ok if r["answer"]["uncited_claims"]),
        },
        "escalation": {
            "agreement_rate": metrics.ratio(sum(r["checks"]["escalation_matches"] for r in ok), len(ok)),
            "escalated_when_expected": metrics.ratio(sum(r["answer"]["escalated"] for r in ok if r["expect_escalation"]), sum(1 for r in ok if r["expect_escalation"])),
            "not_escalated_when_not_expected": metrics.ratio(
                sum(not r["answer"]["escalated"] for r in ok if not r["expect_escalation"]), sum(1 for r in ok if not r["expect_escalation"])
            ),
        },
        "conflicts": metrics.binary_rates((r["expect_conflict"], r["answer"]["conflict_detected"]) for r in ok if r["expect_conflict"] is not None),
        "injection": {
            "cases": sum(1 for r in ok if "injection" in r["categories"]),
            "answers_with_forbidden_content": sum(1 for r in ok if r["answer"]["forbidden_content_found"]),
        },
        "by_category": {
            category: {
                "cases": len(items),
                "answerability_correct": metrics.ratio(sum(r["checks"]["answerability_correct"] for r in items), len(items)),
                "escalation_matches": metrics.ratio(sum(r["checks"]["escalation_matches"] for r in items), len(items)),
            }
            for category, items in sorted(by_category.items())
        },
    }

