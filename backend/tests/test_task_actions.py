"""Task actions: every task is completed by doing its real action, validated by the server."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.data.policy_quizzes import POLICY_QUIZZES
from app.data.task_catalog import ACTIONS, LEGACY_ACTION_KEYS, ActionType
from app.db.models import BankDetailsRecord, EmergencyContactRecord, OnboardingTaskRecord, TaskDocumentRecord, TaskProgressRecord, UserRecord
from tests.conftest import CSRF_HEADERS, EMPLOYEE_EMAIL, HR_EMAIL, login

BASE = "/api/v1/onboarding/tasks"
PDF = b"%PDF-1.4 fictional test document"
PNG = b"\x89PNG\r\n\x1a\n fictional image"
PROFILE = {"phone": "+91 98765 43210", "personal_email": "Shreya@Personal.example", "date_of_birth": "2001-05-20", "address": "42 Residency Road, Bengaluru 560025"}
BANK = {"account_holder": "Shreya Nambiar", "bank_name": "Demo Bank", "ifsc": "hdfc0001234", "account_number": "123456789012", "confirm_account_number": "123456789012"}


def action(client: TestClient, task: str) -> dict:
    response = client.get(f"{BASE}/{task}/action")
    assert response.status_code == 200, response.text
    return response.json()


def submit(client: TestClient, task: str, **body: object):
    return client.post(f"{BASE}/{task}/action", json=body, headers=CSRF_HEADERS)


def upload(client: TestClient, task: str, document_type: str, content: bytes = PDF, name: str = "scan.pdf"):
    return client.post(f"{BASE}/{task}/documents", data={"documentType": document_type}, files={"file": (name, content, "application/octet-stream")}, headers=CSRF_HEADERS)


def reopen(client: TestClient, task: str) -> None:
    assert client.patch(f"{BASE}/{task}", json={"status": "pending"}, headers=CSRF_HEADERS).status_code == 200


def db(client: TestClient):  # noqa: ANN201
    return client.app.state.session_factory()


# ---- Every task has a real action ----


def test_every_catalog_action_is_well_formed() -> None:
    for action_def in ACTIONS.values():
        if action_def.type == ActionType.FORM:
            assert action_def.fields and action_def.kind
        if action_def.type == ActionType.DOCUMENT_UPLOAD:
            assert action_def.documents
        if action_def.type == ActionType.CHECKLIST:
            assert action_def.items
        if action_def.type == ActionType.POLICY_ACKNOWLEDGMENT:
            assert action_def.policies
        if action_def.type == ActionType.TRAINING:
            assert action_def.sections
        if action_def.type == ActionType.QUIZ:
            assert action_def.quiz and all(0 <= q.answer < len(q.options) for q in action_def.quiz.questions)


def test_every_task_of_the_employee_exposes_its_action(client: TestClient) -> None:
    for task in client.get(BASE).json():
        state = action(client, task["id"])
        assert state["actionType"] == task["actionType"]
        assert state["instructions"]


def test_quiz_answers_are_never_sent_to_the_browser(client: TestClient) -> None:
    state = action(client, "security_training")
    assert state["quiz"]["questions"]
    assert all(set(q) == {"id", "question", "options"} for q in state["quiz"]["questions"])
    assert '"answer"' not in json.dumps(state)


# ---- Forms ----


def test_profile_form_validates_and_saves_to_the_employee_record(client: TestClient) -> None:
    reopen(client, "profile")
    bad = submit(client, "profile", values={"phone": "abc", "personal_email": "nope", "date_of_birth": "2024-01-01", "address": "x"})
    assert bad.status_code == 422
    assert set(bad.json()["fields"]) == {"phone", "personal_email", "date_of_birth", "address"}
    assert client.get(f"{BASE}/profile").json()["status"] == "pending"

    good = submit(client, "profile", values=PROFILE)
    assert good.status_code == 200
    assert good.json()["task"]["status"] == "completed"
    with db(client) as session:
        profile = session.scalars(select(UserRecord).where(UserRecord.email == EMPLOYEE_EMAIL)).one().profile
        assert (profile.phone, profile.personal_email, profile.date_of_birth.isoformat()) == ("+91 98765 43210", "shreya@personal.example", "2001-05-20")
    assert action(client, "profile")["values"]["phone"] == "+91 98765 43210"  # prefilled next time


def test_forms_reject_unknown_fields_and_missing_required_values(client: TestClient) -> None:
    assert submit(client, "emergency_contact", values={"name": "A B", "relationship": "Parent", "phone": "+91 98450 12345", "role": "hr"}).status_code == 422
    response = submit(client, "emergency_contact", values={"name": "", "relationship": "Cousin", "phone": "+91 98450 12345"})
    assert response.status_code == 422
    assert set(response.json()["fields"]) == {"name", "relationship"}


def test_emergency_contact_is_saved_to_its_own_table(client: TestClient) -> None:
    response = submit(client, "emergency_contact", values={"name": "Anil Nambiar", "relationship": "Parent", "phone": "+91 98450 12345", "email": "Anil@Example.com"})
    assert response.json()["task"]["status"] == "completed"
    with db(client) as session:
        contact = session.scalars(select(EmergencyContactRecord)).one()
        assert (contact.name, contact.relationship, contact.email) == ("Anil Nambiar", "Parent", "anil@example.com")


def test_bank_account_numbers_are_encrypted_and_never_returned(client: TestClient) -> None:
    reopen(client, "bank_details")
    mismatch = submit(client, "bank_details", values={**BANK, "confirm_account_number": "123456789000"})
    assert mismatch.status_code == 422 and "confirm_account_number" in mismatch.json()["fields"]
    assert submit(client, "bank_details", values={**BANK, "ifsc": "BAD"}).json()["fields"]["ifsc"].startswith("Enter a valid")

    response = submit(client, "bank_details", values=BANK)
    assert response.status_code == 200
    body = response.json()
    assert body["task"]["status"] == "completed"
    assert "123456789012" not in response.text
    assert body["maskedValues"] == {"account_number": "•••• 9012"}
    assert body["values"]["ifsc"] == "HDFC0001234"
    with db(client) as session:
        bank = session.scalars(select(BankDetailsRecord)).one()
        assert "123456789012" not in bank.account_number_encrypted
        assert client.app.state.data_cipher.decrypt(bank.account_number_encrypted) == "123456789012"
        progress = session.scalars(select(TaskProgressRecord)).all()
        assert all("123456789012" not in p.data for p in progress)


def test_access_request_keeps_the_fixed_system_value(client: TestClient) -> None:
    reopen(client, "git_access")
    response = submit(client, "git_access", values={"system": "Payroll database", "access_level": "Developer", "justification": "I need to push code for the onboarding service.", "manager_name": "Priya Nair"})
    assert response.status_code == 200
    assert response.json()["values"]["system"] == "Git (GitLab)"
    assert submit(client, "git_access", values={"access_level": "Root", "justification": "short", "manager_name": "x"}).status_code == 422


def test_meeting_dates_must_be_in_the_past(client: TestClient) -> None:
    future = submit(client, "meet_engineering_team", values={"met_on": "2027-01-01", "attendees": "Platform team", "notes": "Discussed the release process and on-call."})
    assert future.status_code == 422 and "met_on" in future.json()["fields"]
    ok = submit(client, "meet_engineering_team", values={"met_on": "2026-11-05", "attendees": "Platform team", "notes": "Discussed the release process and on-call."})
    assert ok.json()["task"]["status"] == "completed"


# ---- Checklists ----


def test_checklist_saves_progress_and_completes_only_when_every_step_is_done(client: TestClient) -> None:
    state = action(client, "ide_setup")
    ids = [i["id"] for i in state["items"]]
    reopen(client, "ide_setup")

    partial = submit(client, "ide_setup", checkedItems=ids[:1])
    assert partial.json()["task"]["status"] == "in_progress"
    assert [i["checked"] for i in partial.json()["items"]] == [True] + [False] * (len(ids) - 1)

    early = submit(client, "ide_setup", checkedItems=ids[:1], complete=True)
    assert early.status_code == 422
    assert submit(client, "ide_setup", checkedItems=["not-a-step"]).status_code == 422

    done = submit(client, "ide_setup", checkedItems=ids, complete=True)
    assert done.json()["task"]["status"] == "completed"


# ---- Documents ----


def test_documents_require_every_file_before_completion(client: TestClient) -> None:
    reopen(client, "documents")
    assert submit(client, "documents", complete=True).status_code == 422

    assert upload(client, "documents", "id_proof", b"plain text, not a document").status_code == 415
    assert upload(client, "documents", "passport_photo").status_code == 422
    first = upload(client, "documents", "id_proof", PNG, "id.png")
    assert first.status_code == 201
    assert first.json()["task"]["status"] == "in_progress"
    assert submit(client, "documents", complete=True).status_code == 422  # two still missing

    upload(client, "documents", "address_proof")
    last = upload(client, "documents", "education_certificate")
    assert [d["uploaded"]["contentType"] for d in last.json()["documents"]] == ["image/png", "application/pdf", "application/pdf"]
    assert submit(client, "documents", complete=True).json()["task"]["status"] == "completed"


def test_documents_are_stored_per_employee_and_downloadable_only_by_them(client: TestClient) -> None:
    reopen(client, "documents")
    state = upload(client, "documents", "id_proof").json()
    document_id = state["documents"][0]["uploaded"]["id"]
    download = client.get(f"{BASE}/documents/documents/{document_id}/file")
    assert download.status_code == 200 and download.content == PDF
    assert download.headers["x-content-type-options"] == "nosniff"
    with db(client) as session:
        stored = session.get(TaskDocumentRecord, document_id)
        shreya_id = stored.employee_id
        path = client.app.state.settings.employee_documents_dir / str(shreya_id) / stored.storage_name
        assert path.read_bytes() == PDF

    login(client, "daniel.okafor@onboardiq-demo.example")  # another employee, same task key
    assert client.get(f"{BASE}/documents/documents/{document_id}/file").status_code == 404
    assert client.delete(f"{BASE}/documents/documents/{document_id}", headers=CSRF_HEADERS).status_code == 404
    login(client, HR_EMAIL)
    assert client.get(f"{BASE}/documents/documents/{document_id}/file").status_code == 403


def test_uploading_again_replaces_the_document(client: TestClient) -> None:
    reopen(client, "documents")
    upload(client, "documents", "id_proof", name="old.pdf")
    state = upload(client, "documents", "id_proof", PNG, "new.png").json()
    assert state["documents"][0]["uploaded"]["filename"] == "new.png"
    with db(client) as session:
        assert len(session.scalars(select(TaskDocumentRecord).where(TaskDocumentRecord.document_type == "id_proof")).all()) == 1


def test_oversized_and_path_like_uploads_are_handled(client: TestClient) -> None:
    reopen(client, "documents")
    limit = client.app.state.settings.employee_document_max_bytes
    assert upload(client, "documents", "id_proof", PDF + b"0" * limit).status_code == 413
    state = upload(client, "documents", "id_proof", name="../../etc/passwd.pdf").json()
    assert state["documents"][0]["uploaded"]["filename"] == "passwd.pdf"


# ---- Policies ----


def publish_policies(client: TestClient) -> None:
    login(client, HR_EMAIL)
    for name, text in [
        ("OIQ-HR-COC-007_Code-of-Conduct.txt", "Code of Conduct. Treat colleagues with respect. Gifts are limited to INR 2,000 per occasion."),
        ("OIQ-IT-SEC-006_Security.txt", "IT Security Policy. Passwords must be at least fourteen characters long. Report incidents within one hour."),
    ]:
        assert client.post("/api/v1/policies/documents", files={"file": (name, text.encode(), "text/plain")}, headers=CSRF_HEADERS).status_code == 201
    login(client, EMPLOYEE_EMAIL)


def test_policy_acknowledgment_needs_published_policies(client: TestClient) -> None:
    state = action(client, "company_policies")
    assert [p["available"] for p in state["policies"]] == [False, False]
    response = submit(client, "company_policies", acknowledgedPolicies=["OIQ-HR-COC-007", "OIQ-IT-SEC-006"], signature="Shreya Nambiar")
    assert response.status_code == 409 and response.json()["code"] == "policy_unavailable"


def test_policy_acknowledgment_requires_every_policy_and_a_matching_signature(client: TestClient) -> None:
    publish_policies(client)
    state = action(client, "company_policies")
    assert all(p["available"] and p["documentId"] for p in state["policies"])
    file = client.get(f"/api/v1/policies/documents/{state['policies'][0]['documentId']}/file")
    assert file.status_code == 200 and b"Code of Conduct" in file.content

    assert submit(client, "company_policies", acknowledgedPolicies=["OIQ-HR-COC-007"], signature="Shreya Nambiar").status_code == 422
    wrong_name = submit(client, "company_policies", acknowledgedPolicies=["OIQ-HR-COC-007", "OIQ-IT-SEC-006"], signature="Someone Else")
    assert wrong_name.status_code == 422 and "signature" in wrong_name.json()["fields"]

    ok = submit(client, "company_policies", acknowledgedPolicies=["OIQ-HR-COC-007", "OIQ-IT-SEC-006"], signature="  shreya   nambiar ")
    # Acknowledged, but not complete until each policy's understanding quiz is passed.
    assert ok.json()["task"]["status"] == "in_progress"
    assert "understanding quiz" in ok.json()["message"]
    assert all(p["acknowledged"] and p["quizAvailable"] and not p["quizPassed"] for p in ok.json()["policies"])

    for policy_id in ("OIQ-HR-COC-007", "OIQ-IT-SEC-006"):
        quiz = POLICY_QUIZZES[policy_id]
        result = client.post(f"/api/v1/policies/quizzes/{policy_id}/attempts", json={"answers": {q.id: q.answer for q in quiz.questions}})
        assert result.status_code == 200 and result.json()["passed"]
    assert result.json()["completedTaskIds"] == ["company_policies"]
    final = action(client, "company_policies")
    assert final["task"]["status"] == "completed" and all(p["quizPassed"] for p in final["policies"])


# ---- Training & quizzes ----


def test_training_requires_every_module_then_a_passing_quiz(client: TestClient) -> None:
    sections = [s["id"] for s in action(client, "security_training")["sections"]]
    answers = {q.id: q.answer for q in ACTIONS["security_training"].quiz.questions}

    assert submit(client, "security_training", answers=answers).status_code == 409  # modules first
    first = submit(client, "security_training", completedSection=sections[0])
    assert first.json()["task"]["status"] == "in_progress"
    assert submit(client, "security_training", completedSection="made-up").status_code == 422
    for section in sections[1:]:
        submit(client, "security_training", completedSection=section)
    assert client.get(f"{BASE}/security_training").json()["status"] == "in_progress"  # quiz still to pass

    wrong = {qid: (answer + 1) % 4 for qid, answer in answers.items()}
    failed = submit(client, "security_training", answers=wrong).json()
    assert failed["task"]["status"] == "in_progress"
    assert failed["quiz"]["lastScore"] == 0 and not failed["quiz"]["passed"]
    assert not any(r["correct"] for r in failed["quiz"]["lastResults"])

    passed = submit(client, "security_training", answers=answers).json()
    assert passed["task"]["status"] == "completed"
    assert passed["quiz"]["passed"] and passed["quiz"]["bestScore"] == 100 and passed["quiz"]["attempts"] == 2


def test_quiz_requires_every_answer_and_the_pass_mark(client: TestClient) -> None:
    questions = ACTIONS["technical_onboarding"].quiz.questions
    assert submit(client, "technical_onboarding", answers={questions[0].id: questions[0].answer}).status_code == 422
    two_of_three = {q.id: q.answer for q in questions[:2]} | {questions[2].id: (questions[2].answer + 1) % 4}
    assert submit(client, "technical_onboarding", answers=two_of_three).json()["task"]["status"] == "in_progress"  # 67% < 80%
    all_right = {q.id: q.answer for q in questions}
    assert submit(client, "technical_onboarding", answers=all_right).json()["task"]["status"] == "completed"


# ---- Legacy checklists ----


def test_tasks_from_the_original_checklist_are_actionable(client: TestClient) -> None:
    with db(client) as session:
        user_id = session.scalars(select(UserRecord.id).where(UserRecord.email == EMPLOYEE_EMAIL)).one()
        template = session.scalars(select(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == user_id)).first()
        session.add(OnboardingTaskRecord(
            employee_id=user_id, task_key="t9", action_key=LEGACY_ACTION_KEYS["t9"], stage=template.stage, title="Submit emergency contact details",
            description="Legacy task", category=template.category, due_date=template.due_date, priority=template.priority, status="pending",
        ))  # fmt: skip
        session.commit()
    response = submit(client, "t9", values={"name": "Anil Nambiar", "relationship": "Parent", "phone": "+91 98450 12345"})
    assert response.status_code == 200 and response.json()["task"]["status"] == "completed"


@pytest.mark.parametrize("task", ["documents", "security_training", "goals"])
def test_actions_are_employee_only(hr_client: TestClient, task: str) -> None:
    assert hr_client.get(f"{BASE}/{task}/action").status_code == 403
    assert hr_client.post(f"{BASE}/{task}/action", json={}).status_code == 403
