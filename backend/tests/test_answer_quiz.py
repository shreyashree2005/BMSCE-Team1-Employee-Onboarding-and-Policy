"""Quizzes built from a Policy Assistant answer's passages: generation, server-side grading, history, access."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import PolicyQuizAttemptRecord
from app.main import create_app
from app.services.policy_quiz_generator import build_answer_quiz
from tests.conftest import EMPLOYEE_EMAIL, HR_EMAIL, SignedInClient, login, make_settings

QUIZZES = "/api/v1/policies/chat-quizzes"

# Fictional policy text in the style of the demo policies (figures written as "word (digits)").
LEAVE_TEXT = """OIQ-HR-LEA-001 Leave and Attendance Policy

1. Annual paid leave
Full-time employees receive eighteen (18) days of paid annual leave per calendar year. Annual leave accrues monthly at 1.5 days per month of service, starting from the date of joining. New joiners can start using accrued annual leave after completing their first thirty (30) days of service.

2. Carry forward
Up to ten (10) unused annual leave days may be carried forward into the next calendar year. Carried forward days must be used within the first quarter, after which they expire.

3. Sick leave
Employees are entitled to eight (8) days of paid sick leave per calendar year. A medical certificate from a registered doctor is required for sick leave longer than three (3) consecutive days.

4. Parental leave
Birthing parents receive twenty-six (26) weeks of paid maternity leave. Other parents receive ten (10) working days of paid parental leave within six (6) months of the birth or adoption.
"""
SHORT_TEXT = "Dress code\n\nWear business casual clothing in the office and smart clothing when meeting customers. Keep your desk tidy."


@pytest.fixture
def client(database_url: str) -> Iterator[TestClient]:
    with SignedInClient(create_app(make_settings(database_url)), HR_EMAIL) as hr:
        for name, text in (("OIQ-HR-LEA-001_Leave-and-Attendance-Policy.txt", LEAVE_TEXT), ("Dress-Code.txt", SHORT_TEXT)):
            assert hr.post("/api/v1/policies/documents", files={"file": (name, text.encode(), "text/plain")}).status_code == 201
        login(hr, EMPLOYEE_EMAIL)  # continue as the employee
        yield hr


def chunk_ids(client: TestClient, name_part: str) -> list[int]:
    docs = client.get("/api/v1/policies/documents").json()
    doc = next(d for d in docs if name_part in d["filename"])
    return [c["id"] for c in client.get(f"/api/v1/policies/documents/{doc['id']}").json()["chunks"]]


def answer_key(client: TestClient, ids: list[int]) -> dict[str, int]:
    with client.app.state.session_factory() as session:
        return {q.id: q.answer for q in build_answer_quiz(session, ids).quiz.questions}


def test_builds_five_questions_from_the_answer_passages_without_answers(client: TestClient) -> None:
    ids = chunk_ids(client, "Leave")[:2]
    response = client.post(QUIZZES, json={"chunkIds": ids})
    assert response.status_code == 200, response.text
    quiz = response.json()
    assert quiz["quizKey"] == "chat:OIQ-HR-LEA-001"
    assert quiz["title"] == "Leave and Attendance Policy quiz"
    assert quiz["questionCount"] == 5 and len(quiz["questions"]) == 5
    assert quiz["passScore"] == 4 and quiz["history"] == []
    for question in quiz["questions"]:
        assert set(question) == {"id", "question", "options"}, "no answer, explanation or source before grading"
        assert len(question["options"]) == 4 and len(set(question["options"])) == 4
        assert "____" in question["question"]
    # The first questions come from the cited passages, in citation order.
    assert quiz["questions"][0]["id"].startswith(f"c{ids[0]}-")
    text = " ".join(q["question"] for q in quiz["questions"])
    assert "paid annual leave" in text


def test_correct_options_are_the_policy_figures(client: TestClient) -> None:
    ids = chunk_ids(client, "Leave")[:2]
    quiz = client.post(QUIZZES, json={"chunkIds": ids}).json()
    key = answer_key(client, ids)
    by_id = {q["id"]: q for q in quiz["questions"]}
    annual = next(q for q in quiz["questions"] if "days of paid annual leave per calendar year" in q["question"])
    assert annual["options"][key[annual["id"]]] == "18"
    assert set(key) == set(by_id)


def test_building_is_deterministic(client: TestClient) -> None:
    ids = chunk_ids(client, "Leave")[:2]
    first = client.post(QUIZZES, json={"chunkIds": ids}).json()
    second = client.post(QUIZZES, json={"chunkIds": ids}).json()
    assert first["questions"] == second["questions"]


def test_grading_on_the_server_saves_the_attempt_with_sources(client: TestClient) -> None:
    ids = chunk_ids(client, "Leave")[:2]
    quiz = client.post(QUIZZES, json={"chunkIds": ids}).json()
    key = answer_key(client, ids)
    answers = {qid: answer for qid, answer in key.items()}
    wrong_id = quiz["questions"][0]["id"]
    answers[wrong_id] = (key[wrong_id] + 1) % 4

    response = client.post(f"{QUIZZES}/attempts", json={"chunkIds": ids, "answers": answers})
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["score"], result["total"], result["passed"], result["policyId"]) == (4, 5, True, "chat:OIQ-HR-LEA-001")
    assert result["completedTaskIds"] == []
    missed = next(r for r in result["results"] if r["id"] == wrong_id)
    assert missed["correct"] is False and missed["chosen"] == answers[wrong_id] and missed["correctOption"] == key[wrong_id]
    assert missed["explanation"].startswith("The policy says:")
    assert missed["source"]["chunkId"] in chunk_ids(client, "Leave")
    assert missed["source"]["documentName"].startswith("OIQ-HR-LEA-001")
    assert len(result["history"]) == 1

    # History persists and shows up when the quiz is built again.
    assert len(client.post(QUIZZES, json={"chunkIds": ids}).json()["history"]) == 1


def test_attempts_are_private_to_each_user(client: TestClient) -> None:
    ids = chunk_ids(client, "Leave")[:2]
    key = answer_key(client, ids)
    assert client.post(f"{QUIZZES}/attempts", json={"chunkIds": ids, "answers": key}).status_code == 200
    login(client, HR_EMAIL)
    assert client.post(QUIZZES, json={"chunkIds": ids}).json()["history"] == []
    with client.app.state.session_factory() as session:
        attempts = session.scalars(select(PolicyQuizAttemptRecord).where(PolicyQuizAttemptRecord.policy_id == "chat:OIQ-HR-LEA-001")).all()
        assert len(attempts) == 1


def test_chat_quiz_attempts_do_not_count_as_the_curated_policy_quiz(client: TestClient) -> None:
    ids = chunk_ids(client, "Leave")[:2]
    key = answer_key(client, ids)
    client.post(f"{QUIZZES}/attempts", json={"chunkIds": ids, "answers": key})
    curated = next(q for q in client.get("/api/v1/policies/quizzes").json() if q["policyId"] == "OIQ-HR-LEA-001")
    assert curated["attempts"] == 0 and curated["passed"] is False


@pytest.mark.parametrize(
    ("answers", "message"),
    [({}, "Answer every question"), ({"c1-s0": 0}, "Answer every question")],
)
def test_incomplete_answers_are_rejected(client: TestClient, answers: dict, message: str) -> None:
    ids = chunk_ids(client, "Leave")[:2]
    response = client.post(f"{QUIZZES}/attempts", json={"chunkIds": ids, "answers": answers})
    assert response.status_code == 422 and message in response.json()["detail"]


def test_out_of_range_option_is_rejected(client: TestClient) -> None:
    ids = chunk_ids(client, "Leave")[:2]
    answers = {qid: 9 for qid in answer_key(client, ids)}
    assert client.post(f"{QUIZZES}/attempts", json={"chunkIds": ids, "answers": answers}).status_code == 422


def test_unknown_or_deleted_passages_give_a_clear_error(client: TestClient) -> None:
    response = client.post(QUIZZES, json={"chunkIds": [999999]})
    assert response.status_code == 409 and "changed" in response.json()["detail"]


def test_a_policy_without_enough_figures_has_no_quiz(client: TestClient) -> None:
    response = client.post(QUIZZES, json={"chunkIds": chunk_ids(client, "Dress")})
    assert response.status_code == 422 and "enough specific details" in response.json()["detail"]


def test_requests_are_validated_and_need_sign_in(client: TestClient, database_url: str) -> None:
    assert client.post(QUIZZES, json={"chunkIds": []}).status_code == 422
    assert client.post(QUIZZES, json={"chunkIds": [1], "extra": True}).status_code == 422
    with TestClient(create_app(make_settings(database_url))) as anonymous:
        assert anonymous.post(QUIZZES, json={"chunkIds": [1]}).status_code == 401


def test_table_rows_are_not_used_as_questions() -> None:
    from app.services.policy_quiz_generator import _is_table_row

    assert _is_table_row("Leave type: Annual leave; Days per year: 18; Carry forward: Up to 10 days.")
    assert not _is_table_row("Step 3: Your manager approves or declines the request within two (2) working days.")
    assert not _is_table_row("Full-time employees receive eighteen (18) days of paid annual leave per calendar year.")
