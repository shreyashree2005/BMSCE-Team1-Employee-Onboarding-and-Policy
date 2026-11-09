"""Regression tests for broad policy questions ("What is the leave policy?").

MOCK TESTS: answers come from a FakeLLM and tables from synthetic layout text; no AI provider is contacted.
The behaviour was verified separately against the real local model (see the README / completion report).

Root cause covered here: the real model restated the retrieved passages correctly but without [S#] markers, and
the pipeline replaced every marker-less answer with the HR fallback.
"""

import re

import pytest
from fastapi.testclient import TestClient

from app.services.llm.provider import LLMMessage
from app.services.policies.assistant import _BROAD_QUESTION, BROAD_QUESTION_TOP_K, FALLBACK_ANSWER
from app.services.policies.extraction import _remove_running_headers
from app.services.policies.grounding import attribute_uncited_answer, repair_citations
from app.services.policies.pdf_tables import layout_text_to_plain, split_numbered_sections
from app.services.policies.service import PolicyDocumentService
from app.services.policies.text_cleanup import clean_extraction_artifacts
from tests.policy_samples import LEAVE_POLICY, PAYROLL_POLICY, SECURITY_POLICY
from tests.test_policy_chat import FakeLLM, app_and_llm, ask, sources_in, upload  # noqa: F401 (fixture)

SOURCES = {
    "S1": "Full-time employees receive eighteen (18) days of paid annual leave per calendar year. Annual leave accrues monthly at 1.5 days per month of service.",
    "S2": "Employees are entitled to eight (8) days of paid sick leave per calendar year. A medical certificate is required for absences longer than three consecutive days.",
}


# ---- Attribution of marker-less answers (unit) ----


def test_faithful_uncited_answer_gets_citations_before_punctuation() -> None:
    answer = (
        "Here is an overview of the leave policy:\n"
        "- Full-time employees receive eighteen (18) days of paid annual leave per calendar year.\n"
        "- Employees are entitled to eight (8) days of paid sick leave per calendar year."
    )
    assert attribute_uncited_answer(answer, SOURCES) == (
        "Here is an overview of the leave policy:\n"
        "- Full-time employees receive eighteen (18) days of paid annual leave per calendar year [S1].\n"
        "- Employees are entitled to eight (8) days of paid sick leave per calendar year [S2]."
    )


@pytest.mark.parametrize(
    "answer",
    [
        "Full-time employees receive twenty (20) days of paid annual leave per calendar year.",  # wrong figure
        "Employees can take unlimited remote working days whenever their manager agrees.",  # not in any passage
        # One faithful sentence is not enough: every substantive sentence must be supported.
        "Full-time employees receive eighteen (18) days of paid annual leave per calendar year. Unused leave is paid out every December as a cash bonus.",
        "Here is an overview:",  # nothing substantive to attribute
    ],
)
def test_unsupported_uncited_answers_are_not_attributed(answer: str) -> None:
    assert attribute_uncited_answer(answer, SOURCES) is None


def test_attribution_requires_the_figure_to_be_in_the_same_passage() -> None:
    # "eight" is in S2, but the rest of the sentence is about annual leave (S1): no single passage supports it.
    assert attribute_uncited_answer("Full-time employees receive eight (8) days of paid annual leave per calendar year.", SOURCES) is None


# ---- Through the API (FakeLLM) ----


def test_marker_less_but_grounded_answer_is_kept_with_citations(app_and_llm: tuple[TestClient, FakeLLM]) -> None:
    client, llm = app_and_llm

    def respond(messages: list[LLMMessage]) -> str:  # restates a passage verbatim, no [S#]
        text = next(t for t in sources_in(messages).values() if "annual leave" in t)
        return next(s for s in text.split(". ") if "annual leave" in s).strip().rstrip(".") + "."

    llm.responder = respond
    upload(client, "leave.txt", LEAVE_POLICY)

    body = ask(client, "What is the leave policy?")

    assert body["answer"] != FALLBACK_ANSWER
    assert body["answeredFromDocuments"] is True
    assert body["citations"] and all(c["documentName"] == "leave.txt" for c in body["citations"])
    assert f"[{body['citations'][0]['sourceId']}]" in body["answer"]


def test_marker_less_answer_with_invented_content_still_falls_back(app_and_llm: tuple[TestClient, FakeLLM]) -> None:
    client, llm = app_and_llm
    llm.responder = lambda messages: "Employees receive a free company car after five years and unlimited vacation."
    upload(client, "leave.txt", LEAVE_POLICY)

    body = ask(client, "What is the leave policy?")

    assert body["answer"] == FALLBACK_ANSWER
    assert body["escalation"]["recommended"] is True
    assert body["citations"] == []


def test_marker_less_answer_with_a_wrong_figure_still_falls_back(app_and_llm: tuple[TestClient, FakeLLM]) -> None:
    client, llm = app_and_llm
    llm.responder = lambda messages: "Full-time employees receive 25 days of paid annual leave per calendar year."
    upload(client, "leave.txt", LEAVE_POLICY)

    assert ask(client, "What is the leave policy?")["answer"] == FALLBACK_ANSWER


def test_prompt_asks_for_cited_overviews(app_and_llm: tuple[TestClient, FakeLLM]) -> None:
    client, llm = app_and_llm
    upload(client, "leave.txt", LEAVE_POLICY)
    ask(client, "What is the leave policy?")
    system = llm.calls[0][0]["content"]
    assert 'broad question such as "What is the leave policy?"' in system
    assert "without repeating yourself" in system


# ---- Citation repair (unit) ----

REPAIR_SOURCES = {
    "S1": "Always connect through the company VPN, and do not use public Wi-Fi without the VPN.",
    "S2": "Passwords must be at least fourteen (14) characters long. Passwords must not be reused across systems or shared with anyone.",
    "S3": "Leave type: Casual leave; Days per year: 6; Carry forward: No.",
}


def test_repeated_claims_are_collapsed() -> None:
    looped = "\n".join(f"- Casual leave: 6 days per year [S{i}]" for i in range(1, 4))
    assert repair_citations(looped, REPAIR_SOURCES) == "- Casual leave: 6 days per year [S3]"


def test_citations_move_to_the_passage_that_contains_the_claim() -> None:
    answer = "- Passwords must not be reused across systems or shared with anyone. [S1]\n- Passwords must be at least fourteen (14) characters long. [S2]"
    assert repair_citations(answer, REPAIR_SOURCES) == (
        "- Passwords must not be reused across systems or shared with anyone [S2].\n- Passwords must be at least fourteen (14) characters long. [S2]"
    )


def test_correct_citations_leave_the_sentence_untouched() -> None:
    answer = "According to [S2], you must use passwords of at least 14 characters."
    assert repair_citations(answer, REPAIR_SOURCES) == answer


def test_unsupported_claims_keep_their_citations_for_the_validators() -> None:
    answer = "Employees get a free laptop bag every year [S1]."
    assert repair_citations(answer, REPAIR_SOURCES) == answer


def test_repair_never_changes_wording_of_kept_claims(app_and_llm: tuple[TestClient, FakeLLM]) -> None:
    client, llm = app_and_llm

    def respond(messages: list[LLMMessage]) -> str:
        ids = list(sources_in(messages))
        text = sources_in(messages)[ids[0]]
        sentence = next(s for s in text.split(". ") if "annual leave" in s).strip().rstrip(".")
        return "\n".join(f"- {sentence} [{source_id}]" for source_id in ids)  # the same claim cited to every passage

    llm.responder = respond
    upload(client, "leave.txt", LEAVE_POLICY)
    upload(client, "security.txt", SECURITY_POLICY)

    body = ask(client, "How many days of paid annual leave do employees receive?")
    assert body["answer"].count("\n") == 0  # one claim left
    assert all(c["documentName"] == "leave.txt" for c in body["citations"])


# ---- Broad questions draw on the policy they are about ----


def test_broad_question_sources_come_from_the_top_matching_policy(app_and_llm: tuple[TestClient, FakeLLM]) -> None:
    client, llm = app_and_llm
    for name, text in [("leave.txt", LEAVE_POLICY), ("security.txt", SECURITY_POLICY), ("payroll.txt", PAYROLL_POLICY)]:
        upload(client, name, text)

    ask(client, "What is the payroll policy?")

    prompt = llm.calls[0][-1]["content"]
    documents = set(re.findall(r'document="([^"]+)"', prompt))
    assert documents == {"payroll.txt"}


def test_specific_questions_still_search_all_policies(app_and_llm: tuple[TestClient, FakeLLM]) -> None:
    client, llm = app_and_llm
    for name, text in [("leave.txt", LEAVE_POLICY), ("security.txt", SECURITY_POLICY), ("payroll.txt", PAYROLL_POLICY)]:
        upload(client, name, text)
    requested: list[str | None] = []
    original = PolicyDocumentService.search

    def spy(self, query, top_k, document_id=None):  # noqa: ANN001, ANN202
        requested.append(document_id)
        return original(self, query, top_k, document_id)

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(PolicyDocumentService, "search", spy)
        ask(client, "When is salary paid?")
    assert requested == [None]  # one corpus-wide search, no document restriction


# ---- PDF structure: sections and running headers (unit) ----


def test_pages_split_at_numbered_section_headings() -> None:
    page = "Leave and Attendance Policy\nDocument control\n\n1. Annual paid leave\nFull-time employees receive 18 days.\n\n2. Sick leave\nEmployees get 8 days.\n1. Submit the form."
    parts = split_numbered_sections(page)
    assert [heading for heading, _ in parts] == [None, "1. Annual paid leave", "2. Sick leave"]
    assert parts[1][1] == "1. Annual paid leave\nFull-time employees receive 18 days."
    assert "1. Submit the form." in parts[2][1]  # a numbered sentence (ends with ".") is not a heading


def test_running_headers_and_footers_are_removed() -> None:
    pages = [
        "ACME (fictional) DEMO POLICY\n1. Leave\nEighteen days.\nPolicy LEA-001 Page 1 of 2",
        "ACME (fictional) DEMO POLICY\n2. Sick leave\nEight days.\nPolicy LEA-001 Page 2 of 2",
    ]
    cleaned = _remove_running_headers(pages)
    assert cleaned == ["1. Leave\nEighteen days.", "2. Sick leave\nEight days."]
    assert _remove_running_headers(["Only page\nText"]) == ["Only page\nText"]


def test_broad_questions_retrieve_more_passages_from_the_main_policy(app_and_llm: tuple[TestClient, FakeLLM], monkeypatch: pytest.MonkeyPatch) -> None:
    client, _ = app_and_llm
    for name, text in [("leave.txt", LEAVE_POLICY), ("security.txt", SECURITY_POLICY), ("payroll.txt", PAYROLL_POLICY)]:
        upload(client, name, text)
    calls: list[tuple[int, str | None]] = []
    original = PolicyDocumentService.search

    def spy(self, query, top_k, document_id=None):  # noqa: ANN001, ANN202
        calls.append((top_k, document_id))
        return original(self, query, top_k, document_id)

    monkeypatch.setattr(PolicyDocumentService, "search", spy)
    ask(client, "How many days of paid annual leave do employees receive?")
    ask(client, "What is the leave policy?")

    configured = client.app.state.settings.rag_top_k
    broad_k = max(configured, BROAD_QUESTION_TOP_K)
    leave_id = next(d["id"] for d in client.get("/api/v1/policies/documents").json() if d["filename"] == "leave.txt")
    assert calls[0] == (configured, None)  # specific question: one corpus-wide search
    assert calls[1] == (broad_k, None)  # broad question: corpus-wide search picks the policy...
    assert calls[2][1] == leave_id and calls[2][0] > broad_k  # ...then that policy's own passages
