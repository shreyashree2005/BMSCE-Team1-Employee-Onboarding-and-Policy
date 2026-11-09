"""Command line: python -m evaluation [--mode scripted|llm] [--embedding sentence-transformers|hashing] [--cases a,b] [--output file]"""

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

from evaluation.runner import RESULTS_DIR, run_evaluation


def _fmt(value: float | None, percent: bool = True) -> str:
    if value is None:
        return "n/a"
    return f"{value * 100:.1f}%" if percent else f"{value:.3f}"


def print_summary(results: dict[str, Any]) -> None:
    meta, agg = results["meta"], results["aggregates"]
    print("=" * 96)
    print(f"OnboardIQ Policy Assistant evaluation · mode={meta['mode']} · generator={meta['generator']}")
    print(f"embedding={meta['embedding_model']} · top_k={meta['retrieval']['top_k']} · thresholds={meta['retrieval']['min_relevance']}/{meta['retrieval']['strong_relevance']}"
          f" · {meta['cases']} cases · {meta['duration_seconds']}s")
    print(f"NOTE: {meta['disclaimer']}")
    print("-" * 96)
    print(f"{'case':<32} {'RR':>5} {'ans?':>5} {'ok':>3} {'facts':>6} {'esc':>4} {'exp':>4} {'conf':>5} notes")
    for case in results["cases"]:
        if "error" in case:
            print(f"{case['id']:<32} ERROR {case['error']['code']}")
            continue
        a, c, rr = case["answer"], case["checks"], case["retrieval"]["reciprocal_rank"]
        notes = []
        if a["unsupported_figures"]:
            notes.append(f"unverified figures {a['unsupported_figures']}")
        if a["forbidden_content_found"]:
            notes.append(f"FORBIDDEN {a['forbidden_content_found']}")
        if a["fallback_reason"]:
            notes.append(a["fallback_reason"])
        print(
            f"{case['id']:<32} {'-' if rr is None else f'{rr:.2f}':>5} {'yes' if a['answered_from_documents'] else 'no':>5} "
            f"{'✓' if c['answerability_correct'] else '✗':>3} {'-' if a['fact_coverage'] is None else f'{a['fact_coverage']:.0%}':>6} "
            f"{'yes' if a['escalated'] else 'no':>4} {'yes' if case['expect_escalation'] else 'no':>4} "
            f"{'-' if case['expect_conflict'] is None else ('yes' if a['conflict_detected'] else 'no'):>5} {'; '.join(notes)}"
        )
    print("-" * 96)
    r, ab, ci, an, es, co = agg["retrieval"], agg["abstention"], agg["citations"], agg["answers"], agg["escalation"], agg["conflicts"]
    print(f"Retrieval ({r['cases']} answerable cases): Recall@1 {_fmt(r['recall_at_1'])} · Recall@3 {_fmt(r['recall_at_3'])} · Recall@5 {_fmt(r['recall_at_5'])} · MRR {_fmt(r['mrr'], False)}")
    print(f"Abstention: unanswerable correctly abstained {_fmt(ab['correct_abstention_rate'])} ({ab['abstained_without_llm_call']}/{ab['unanswerable_cases']} without an LLM call)"
          f" · false abstention on answerable {_fmt(ab['false_abstention_rate'])}")
    print(f"Citations: raw marker validity {_fmt(ci['raw_citation_validity'])} ({ci['raw_markers']} markers) · cited documents that were expected {_fmt(ci['citation_source_precision'])}")
    print(f"Answers: key-fact coverage when answered {_fmt(an['key_fact_coverage_when_answered'])} · over all answerable {_fmt(an['key_fact_coverage_all_answerable'])}"
          f" · answers with unverified figures {an['answers_with_unsupported_figures']}")
    print(f"Escalation: agreement {_fmt(es['agreement_rate'])} · escalated when expected {_fmt(es['escalated_when_expected'])} · not escalated when not expected {_fmt(es['not_escalated_when_not_expected'])}")
    print(f"Conflicts: precision {_fmt(co['precision'])} · recall {_fmt(co['recall'])} (TP {co['true_positives']}, FP {co['false_positives']}, FN {co['false_negatives']}, TN {co['true_negatives']})")
    print(f"Injection: {agg['injection']['answers_with_forbidden_content']}/{agg['injection']['cases']} answers contained forbidden content")
    p = results["validator_probes"]["unsupported_figures"]
    print(f"Figure-validator probes ({p['probes']}): altered figures flagged {_fmt(p['altered_figures_flagged_rate'])} · faithful quotes falsely flagged {_fmt(p['faithful_quotes_falsely_flagged_rate'])}")
    print("=" * 96)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m evaluation", description="Evaluate the OnboardIQ Policy Assistant on the sample-policy dataset.")
    parser.add_argument("--mode", choices=["scripted", "llm"], default="scripted", help="scripted = deterministic stand-in generator (default); llm = the LLM configured in backend/.env")
    parser.add_argument("--embedding", choices=["sentence-transformers", "hashing"], default="sentence-transformers", help="embedding provider (default: the real MiniLM model)")
    parser.add_argument("--cases", help="comma-separated case IDs to run (default: all)")
    parser.add_argument("--output", type=Path, help="JSON results path (default: evaluation/results/<mode>-<embedding>.json)")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.WARNING)
    output = args.output or RESULTS_DIR / f"{args.mode}-{'minilm' if args.embedding == 'sentence-transformers' else 'hashing'}.json"
    results = run_evaluation(mode=args.mode, embedding_provider=args.embedding, case_ids=args.cases.split(",") if args.cases else None, output_path=output)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    print_summary(results)
    print(f"Results saved to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
