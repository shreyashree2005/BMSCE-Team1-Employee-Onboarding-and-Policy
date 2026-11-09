"""Answer generators for evaluation.

``ScriptedExtractiveGenerator`` is a deterministic stand-in for an LLM. It quotes the source
sentences that share the most content words with the question and cites them, presents both
sides when OnboardIQ flags a conflict, and abstains when nothing overlaps. It is NOT a language
model: results obtained with it measure the pipeline around the model (retrieval, gating,
citation handling and validation), never the quality of an AI model.
"""

import re

from app.services.llm.provider import LLMMessage
from app.services.policies.assistant import FALLBACK_ANSWER
from app.services.policies.grounding import content_terms

_SOURCE_BLOCK = re.compile(r'<source id="(S\d+)"[^>]*>\n(.*?)\n</source>', re.DOTALL)
_CONFLICT_NOTE = re.compile(r"Note from OnboardIQ: these passages appear to conflict \((.*?)\)\.", re.DOTALL)
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
# Question words that carry no topic information.
_QUESTION_WORDS = {"what", "when", "where", "which", "does", "many", "much", "need", "about", "policy", "company", "should", "there", "after"}


class ScriptedExtractiveGenerator:
    model_name = "scripted-extractive-reference (not an LLM)"
    is_configured = True

    def __init__(self) -> None:
        self.calls = 0

    def complete(self, messages: list[LLMMessage]) -> str:
        self.calls += 1
        final = messages[-1]["content"]
        # The question line only (OnboardIQ's citation reminder follows it after a blank line).
        question = final.rsplit("Employee question:", 1)[-1].split("\n\n", 1)[0]
        terms = content_terms(question) - _QUESTION_WORDS
        sources = _SOURCE_BLOCK.findall(final)

        candidates = []  # (overlap terms, source order, sentence order, source id, sentence)
        for source_order, (source_id, text) in enumerate(sources):
            for sentence_order, sentence in enumerate(s.strip() for s in _SENTENCE.split(text)):
                if "removed]" in sentence:
                    continue
                overlap = terms & content_terms(sentence)
                if overlap:
                    candidates.append((overlap, source_order, sentence_order, source_id, sentence))
        if not candidates:
            return FALLBACK_ANSWER
        candidates.sort(key=lambda c: (-len(c[0]), c[1], c[2]))

        chosen = [candidates[0]]
        conflict = _CONFLICT_NOTE.search(final)
        if conflict:
            # Present the best sentence from each conflicting source rather than choosing one.
            for source_id in dict.fromkeys(re.findall(r"S\d+", conflict.group(1))):
                best = next((c for c in candidates if c[3] == source_id), None)
                if best and best not in chosen:
                    chosen.append(best)
        else:
            # Add a sentence from another source only if it covers question terms the first one didn't.
            covered = set(candidates[0][0])
            extra = next((c for c in candidates[1:] if c[3] != candidates[0][3] and c[0] - covered), None)
            if extra:
                chosen.append(extra)

        lines = [f"- According to the policy: {sentence} [{source_id}]" for _, _, _, source_id, sentence in chosen]
        if conflict:
            lines.append("ESCALATE: The policies state different figures; please confirm which applies with HR.")
        return "\n".join(lines)
