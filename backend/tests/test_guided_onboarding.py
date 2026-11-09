"""Guided onboarding: work calendar, task dependencies and priorities, time tracking, policy understanding quizzes,
Help Desk tickets, profile photos and first-visit guidance preferences."""

import io
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.data.job_roles import JobRole
from app.data.policy_quizzes import POLICY_QUIZZES
from app.data.task_catalog import DEPENDENCIES, build_role_checklist, templates_for
from app.db.models import OnboardingTaskRecord
from app.schemas.onboarding import OnboardingStage, OnboardingTask, TaskCategory, TaskPriority, TaskStatus
from app.services.onboarding_repository import dependency_map, set_record_status
from app.services.onboarding_service import build_calendar, describe_day
from app.services.policy_quiz import pass_score, result_message
from app.services.helpdesk import HelpDeskError, validate_ticket
from app.services.profile_photo import ProfilePhotoError, process_photo
from app.services.work_calendar import DayType, Holiday, WorkCalendar, load_holidays
from tests.conftest import CSRF_HEADERS, DEMO_PASSWORD, EMPLOYEE_EMAIL, HR_EMAIL, login

SATURDAY = date(2026, 11, 7)  # the test reference date
DIWALI = Holiday(date(2026, 11, 10), "Diwali (Balipadyami)", DayType.FESTIVAL_HOLIDAY)
REPUBLIC_DAY = Holiday(date(2026, 1, 26), "Republic Day", DayType.COMPANY_HOLIDAY)
CALENDAR = WorkCalendar(["saturday", "sunday"], [DIWALI, REPUBLIC_DAY])
STRONG = "Harbour-Lights-42"


def task(task_id: str, due: date, status: TaskStatus = TaskStatus.PENDING) -> OnboardingTask:
    return OnboardingTask(
        id=task_id, stage=OnboardingStage.WELCOME, title=task_id, description="-", category=TaskCategory.ORIENTATION,
        due_date=due, priority=TaskPriority.MEDIUM, status=status,
    )  # fmt: skip


def register(client: TestClient, email: str = "new.hire@example.com", job_role: str = "data_analyst") -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={"fullName": "Nila Varma", "email": email, "jobRole": job_role, "password": STRONG, "confirmPassword": STRONG},
        headers=CSRF_HEADERS,
    )
    assert response.status_code == 201, response.text
    return response.json()["user"]


def png_bytes(size: tuple[int, int] = (40, 30), color: str = "navy") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


# ---- Work calendar ------------------------------------------------------------------------------------------------


def test_calendar_knows_weekends_and_configured_holidays_only() -> None:
    assert CALENDAR.day_type(date(2026, 11, 8)) == DayType.WEEKLY_OFF  # Sunday
    assert CALENDAR.day_type(SATURDAY) == DayType.WEEKLY_OFF
    assert CALENDAR.day_type(date(2026, 11, 10)) == DayType.FESTIVAL_HOLIDAY
    assert CALENDAR.day_type(date(2026, 1, 26)) == DayType.COMPANY_HOLIDAY
    assert CALENDAR.day_type(date(2026, 11, 11)) == DayType.WORKING  # an ordinary Wednesday is never a holiday
    assert CALENDAR.next_working_day(SATURDAY) == date(2026, 11, 9)
    assert CALENDAR.next_working_day(date(2026, 11, 9)) == date(2026, 11, 11)  # skips Diwali
    assert CALENDAR.on_or_after(date(2026, 11, 9)) == date(2026, 11, 9)
    sunday_only = WorkCalendar(["sunday"])
    assert sunday_only.is_working_day(SATURDAY) and not sunday_only.is_working_day(date(2026, 11, 8))


def test_calendar_rejects_bad_configuration(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        WorkCalendar(["funday"])
    with pytest.raises(ValueError):
        WorkCalendar(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    assert load_holidays(tmp_path / "missing.json") == []
    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    assert load_holidays(broken) == []
    mixed = tmp_path / "mixed.json"
    mixed.write_text(json.dumps({"holidays": [{"date": "2026-12-25", "name": "Christmas Day", "type": "festival"}, {"date": "bad", "name": "x"}]}), encoding="utf-8")
    assert load_holidays(mixed) == [Holiday(date(2026, 12, 25), "Christmas Day", DayType.FESTIVAL_HOLIDAY)]


def test_bundled_holiday_file_is_valid() -> None:
    holidays = load_holidays(Path(__file__).resolve().parents[1] / "app" / "data" / "company_holidays.json")
    assert len(holidays) >= 5 and all(h.name for h in holidays)
    assert len({h.date for h in holidays}) == len(holidays)


def test_day_reasons_explain_empty_days() -> None:
    tasks = [task("a", date(2026, 11, 9)), task("b", date(2026, 11, 12)), task("done", date(2026, 11, 11), TaskStatus.COMPLETED)]
    sunday = describe_day(date(2026, 11, 8), SATURDAY, tasks, CALENDAR)
    assert sunday.title == "Sunday — Weekly Holiday"
    assert sunday.reason == (
        "No onboarding activities are scheduled on this date because Sunday is a weekly holiday. "
        "Your next onboarding activity is scheduled for the next working day, Monday, November 9."
    )
    today = describe_day(SATURDAY, SATURDAY, tasks, CALENDAR)
    assert today.reason.startswith("No onboarding activities are scheduled today because Saturday is a weekly holiday.")
    diwali = describe_day(date(2026, 11, 10), SATURDAY, tasks, CALENDAR)
    assert diwali.day_type == "festival_holiday" and diwali.title == "Festival Holiday — Diwali (Balipadyami)"
    assert diwali.reason == "This date is a festival holiday: Diwali (Balipadyami). Your next assigned activity is on Thursday, November 12."
    assert diwali.next_working_day == date(2026, 11, 11)
    republic = describe_day(date(2026, 1, 26), date(2026, 1, 26), [], CALENDAR)
    assert republic.title == "Company Holiday — Republic Day"
    assert republic.reason == "Today is a company holiday: Republic Day. The next working day is Tuesday, January 27."
    # A working day whose only task is already completed lists the task and says it's all done.
    wednesday = describe_day(date(2026, 11, 11), SATURDAY, tasks, CALENDAR)
    assert wednesday.task_ids == ["done"] and wednesday.title == "All tasks completed"
    assert wednesday.reason == "You've completed all the onboarding tasks scheduled for this date. Your next assigned activity is on Thursday, November 12."
    # A day with open tasks needs no explanation.
    monday = describe_day(date(2026, 11, 9), SATURDAY, tasks, CALENDAR)
    assert monday.title == "1 task scheduled" and monday.reason is None and monday.note is None
    # An empty working day: no invented reason, just the plain statement and where onboarding continues.
    friday = describe_day(date(2026, 11, 13), SATURDAY, tasks, CALENDAR)
    assert friday.title == "No tasks scheduled" and friday.note is None
    assert friday.reason == "No onboarding tasks are scheduled for this date. You have no more onboarding tasks scheduled after this date."
    monday_before = describe_day(date(2026, 11, 9), date(2026, 11, 9), [task("b", date(2026, 11, 12))], CALENDAR)
    assert monday_before.reason == "No onboarding tasks are scheduled for this date. Your next assigned activity is on Thursday, November 12."
    assert monday_before.note and "spread across your working days" in monday_before.note


def test_saturday_is_a_working_day_when_the_schedule_says_so() -> None:
    """Weekly days off come from configuration; Saturdays are not assumed to be holidays."""
    six_day_week = WorkCalendar(["sunday"])
    saturday = describe_day(SATURDAY, SATURDAY, [task("a", date(2026, 11, 9))], six_day_week)
    assert saturday.day_type == "working" and saturday.title == "No tasks scheduled"
    assert saturday.reason == "No onboarding tasks are scheduled for this date. Your next assigned activity is on Monday, November 9."
    sunday = describe_day(date(2026, 11, 8), SATURDAY, [], six_day_week)
    assert sunday.day_type == "weekly_off" and "Sunday is a weekly holiday" in sunday.reason


def test_fifteen_day_calendar() -> None:
    calendar = build_calendar([], CALENDAR, SATURDAY)
    assert len(calendar.days) == 15 and calendar.days[0].date == SATURDAY and calendar.days[-1].date == date(2026, 11, 21)
    assert calendar.weekly_off_days == ["Saturday", "Sunday"]


def test_due_dates_move_off_weekends_and_holidays() -> None:
    for role in JobRole:
        tasks = build_role_checklist(role, SATURDAY, calendar=CALENDAR)
        assert len(tasks) == len(templates_for(role))
        assert all(CALENDAR.is_working_day(g.task.due_date) for g in tasks), role
        assert all(g.task.due_date >= SATURDAY for g in tasks)
    unshifted = {g.task.id: g.task.due_date for g in build_role_checklist(JobRole.SOFTWARE_DEVELOPER, SATURDAY)}
    shifted = {g.task.id: g.task.due_date for g in build_role_checklist(JobRole.SOFTWARE_DEVELOPER, SATURDAY, calendar=CALENDAR)}
    assert unshifted["profile"] == SATURDAY and shifted["profile"] == date(2026, 11, 9)
    assert unshifted["meet_engineering_team"] == date(2026, 11, 10) and shifted["meet_engineering_team"] == date(2026, 11, 11)


# ---- Priorities and dependencies ----------------------------------------------------------------------------------


def test_priorities_are_configured_not_all_high() -> None:
    for role in JobRole:
        priorities = {t.priority for t in templates_for(role)}
        assert TaskPriority.HIGH in priorities and len(priorities) >= 2, role


def test_dependencies_point_forward_in_the_schedule() -> None:
    """A prerequisite is never due after the task that depends on it."""
    for role in JobRole:
        generated = {g.action_key: g.task for g in build_role_checklist(role, SATURDAY, calendar=CALENDAR)}
        for action_key, prerequisites in DEPENDENCIES.items():
            for prerequisite in prerequisites:
                if action_key in generated and prerequisite in generated:
                    assert generated[prerequisite].due_date <= generated[action_key].due_date, (role, action_key, prerequisite)


def test_dependency_map_ignores_tasks_the_employee_does_not_have() -> None:
    records = [OnboardingTaskRecord(task_key=k, action_key=k) for k in ("profile", "documents", "security_training")]
    assert dependency_map(records) == {"profile": [], "documents": ["profile"], "security_training": []}  # no it_setup here


def test_dependent_task_cannot_start_or_complete_before_its_prerequisite(anonymous_client: TestClient) -> None:
    register(anonymous_client)
    tasks = {t["id"]: t for t in anonymous_client.get("/api/v1/onboarding/tasks").json()}
    assert tasks["documents"]["dependsOn"] == ["profile"] and tasks["profile"]["dependsOn"] == []
    assert tasks["sql_environment"]["dependsOn"] == ["analytics_access"]

    start = anonymous_client.patch("/api/v1/onboarding/tasks/documents", json={"status": "in_progress"}, headers=CSRF_HEADERS)
    assert start.status_code == 409 and "Complete employee profile" in start.json()["detail"]
    upload = anonymous_client.post(
        "/api/v1/onboarding/tasks/documents/documents", data={"documentType": "id_proof"}, files={"file": ("id.pdf", b"%PDF-1.4 x", "application/pdf")}, headers=CSRF_HEADERS
    )
    assert upload.status_code == 409 and upload.json()["code"] == "prerequisite_incomplete"

    profile = {"phone": "+91 98765 43210", "personal_email": "nila@personal.example", "date_of_birth": "2000-02-02", "address": "1 MG Road, Bengaluru"}
    assert anonymous_client.post("/api/v1/onboarding/tasks/profile/action", json={"values": profile}, headers=CSRF_HEADERS).status_code == 200
    assert anonymous_client.patch("/api/v1/onboarding/tasks/documents", json={"status": "in_progress"}, headers=CSRF_HEADERS).status_code == 200
    # Moving a blocked task back to pending is always allowed.
    assert anonymous_client.patch("/api/v1/onboarding/tasks/sql_environment", json={"status": "pending"}, headers=CSRF_HEADERS).status_code == 200


# ---- Time tracking ------------------------------------------------------------------------------------------------


def test_time_counts_only_while_in_progress_and_survives_reopening() -> None:
    record = OnboardingTaskRecord(task_key="x", status=TaskStatus.PENDING, time_spent_seconds=0)
    t0 = datetime(2026, 11, 9, 9, 0, tzinfo=timezone.utc)
    set_record_status(record, TaskStatus.IN_PROGRESS, t0)
    assert record.first_started_at == t0 and record.started_at == t0
    set_record_status(record, TaskStatus.PENDING, t0 + timedelta(seconds=60))  # paused
    assert record.time_spent_seconds == 60 and record.started_at is None
    set_record_status(record, TaskStatus.IN_PROGRESS, t0 + timedelta(minutes=30))  # resumed; the break isn't counted
    set_record_status(record, TaskStatus.COMPLETED, t0 + timedelta(minutes=30, seconds=212))
    assert record.time_spent_seconds == 272 and record.completed_at is not None and record.first_started_at == t0
    set_record_status(record, TaskStatus.PENDING, t0 + timedelta(hours=2))  # reopened: earlier work is kept
    assert record.time_spent_seconds == 272 and record.completed_at is None
    set_record_status(record, TaskStatus.IN_PROGRESS, t0 + timedelta(hours=3))
    set_record_status(record, TaskStatus.COMPLETED, t0 + timedelta(hours=3, seconds=28))
    assert record.time_spent_seconds == 300


def test_api_reports_server_side_timing(anonymous_client: TestClient) -> None:
    register(anonymous_client)
    before = anonymous_client.get("/api/v1/onboarding/tasks/profile").json()
    assert before["firstStartedAt"] is None and before["timeSpentSeconds"] is None
    started = anonymous_client.patch("/api/v1/onboarding/tasks/profile", json={"status": "in_progress"}, headers=CSRF_HEADERS).json()
    assert started["activeSince"] and started["timeSpentSeconds"] == 0
    profile = {"phone": "+91 98765 43210", "personal_email": "nila@personal.example", "date_of_birth": "2000-02-02", "address": "1 MG Road, Bengaluru"}
    done = anonymous_client.post("/api/v1/onboarding/tasks/profile/action", json={"values": profile}, headers=CSRF_HEADERS).json()["task"]
    assert done["status"] == "completed" and done["activeSince"] is None and done["timeSpentSeconds"] >= 0 and done["firstStartedAt"]


def test_calendar_endpoint(anonymous_client: TestClient) -> None:
    register(anonymous_client)
    calendar = anonymous_client.get("/api/v1/onboarding/calendar").json()
    assert calendar["today"] == "2026-11-07" and len(calendar["days"]) == 15
    by_date = {d["date"]: d for d in calendar["days"]}
    assert by_date["2026-11-07"]["dayType"] == "weekly_off" and "next working day, Monday, November 9" in by_date["2026-11-07"]["reason"]
    assert by_date["2026-11-07"]["title"] == "Saturday — Weekly Holiday"
    assert by_date["2026-11-10"]["dayType"] == "festival_holiday" and by_date["2026-11-10"]["taskIds"] == []
    assert "profile" in by_date["2026-11-09"]["taskIds"]
    assert anonymous_client.get("/api/v1/onboarding/calendar?days=0").status_code == 422


# ---- Policy understanding quizzes ---------------------------------------------------------------------------------


def publish(client: TestClient, policy_id: str = "OIQ-IT-SEC-006") -> None:
    login(client, HR_EMAIL)
    name = f"{policy_id}_Policy.txt"
    assert client.post("/api/v1/policies/documents", files={"file": (name, b"Policy text for the quiz. " * 30, "text/plain")}, headers=CSRF_HEADERS).status_code == 201
    login(client, EMPLOYEE_EMAIL)


def test_quiz_scoring_rules() -> None:
    assert pass_score(5, 80) == 4 and pass_score(3, 80) == 3 and pass_score(4, 50) == 2
    assert "every question correctly" in result_message(5, 5, 4)
    assert "you passed" in result_message(4, 5, 4)
    assert result_message(0, 5, 4) == "Your Score: 0/5. You may want to read the policy again before attempting the quiz."
    assert result_message(3, 5, 4).startswith("Your Score: 3/5. You need 4/5 to pass.")


def test_quiz_bank_matches_the_published_policies() -> None:
    assert set(POLICY_QUIZZES) == {"OIQ-HR-COC-007", "OIQ-IT-SEC-006", "OIQ-HR-LEA-001"}
    for quiz in POLICY_QUIZZES.values():
        assert 3 <= len(quiz.questions) <= 5
        assert all(len(q.options) == 4 and q.explanation.startswith("Section") for q in quiz.questions)


def test_quiz_never_sends_answers_and_grades_on_the_server(client: TestClient) -> None:
    publish(client)
    quiz = client.get("/api/v1/policies/quizzes/OIQ-IT-SEC-006")
    assert quiz.status_code == 200
    body = quiz.json()
    assert body["passScore"] == 4 and body["questionCount"] == 5 and body["history"] == [] and body["documentId"]
    assert "answer" not in quiz.text.lower().replace("answered", "")  # no answer keys anywhere in the payload
    bank = POLICY_QUIZZES["OIQ-IT-SEC-006"].questions

    wrong = {q.id: (q.answer + 1) % 4 for q in bank}
    zero = client.post("/api/v1/policies/quizzes/OIQ-IT-SEC-006/attempts", json={"answers": wrong}).json()
    assert zero["score"] == 0 and not zero["passed"] and "read the policy again" in zero["message"]
    assert all(r["correctOption"] == q.answer and not r["correct"] and r["explanation"] for r, q in zip(zero["results"], bank, strict=True))

    three = {q.id: q.answer if i < 3 else (q.answer + 1) % 4 for i, q in enumerate(bank)}
    failed = client.post("/api/v1/policies/quizzes/OIQ-IT-SEC-006/attempts", json={"answers": three}).json()
    assert failed["score"] == 3 and not failed["passed"] and failed["results"][0]["feedback"] == "Great! You understood this concept."

    passed = client.post("/api/v1/policies/quizzes/OIQ-IT-SEC-006/attempts", json={"answers": {q.id: q.answer for q in bank}}).json()
    assert passed["score"] == 5 and passed["passed"]
    assert [a["score"] for a in passed["history"]] == [0, 3, 5]
    summary = {q["policyId"]: q for q in client.get("/api/v1/policies/quizzes").json()}
    assert summary["OIQ-IT-SEC-006"]["passed"] and summary["OIQ-IT-SEC-006"]["bestScore"] == 5 and summary["OIQ-IT-SEC-006"]["attempts"] == 3


def test_quiz_validation(client: TestClient) -> None:
    unpublished = client.post("/api/v1/policies/quizzes/OIQ-HR-LEA-001/attempts", json={"answers": {q.id: 0 for q in POLICY_QUIZZES["OIQ-HR-LEA-001"].questions}})
    assert unpublished.status_code == 409
    publish(client)
    assert client.post("/api/v1/policies/quizzes/OIQ-IT-SEC-006/attempts", json={"answers": {"sec-updates": 1}}).status_code == 422
    bad_option = {q.id: 9 for q in POLICY_QUIZZES["OIQ-IT-SEC-006"].questions}
    assert client.post("/api/v1/policies/quizzes/OIQ-IT-SEC-006/attempts", json={"answers": bad_option}).status_code == 422
    assert client.post("/api/v1/policies/quizzes/OIQ-IT-SEC-006/attempts", json={"answers": {}, "score": 5}).status_code == 422
    assert client.get("/api/v1/policies/quizzes/NOT-A-POLICY").status_code == 404


def test_quiz_attempts_are_private(client: TestClient) -> None:
    publish(client)
    bank = POLICY_QUIZZES["OIQ-IT-SEC-006"].questions
    client.post("/api/v1/policies/quizzes/OIQ-IT-SEC-006/attempts", json={"answers": {q.id: q.answer for q in bank}})
    login(client, HR_EMAIL)
    assert client.get("/api/v1/policies/quizzes/OIQ-IT-SEC-006").json()["history"] == []


# ---- Help Desk ----------------------------------------------------------------------------------------------------


def test_ticket_validation_rules() -> None:
    category, subject, description = validate_ticket("payroll", "  Salary   slip missing ", "I can't find my October salary slip.")
    assert category.value == "payroll" and subject == "Salary slip missing"
    with pytest.raises(HelpDeskError) as error:
        validate_ticket("nonsense", "Hi", "short")
    assert set(error.value.fields) == {"category", "subject", "description"}


def test_employee_raises_and_tracks_tickets_and_hr_updates_them(client: TestClient) -> None:
    created = client.post(
        "/api/v1/helpdesk/tickets",
        data={"category": "document_upload", "subject": "Upload keeps failing", "description": "My address proof upload fails with an error."},
        files={"attachment": ("screen.png", png_bytes(), "image/png")},
    )
    assert created.status_code == 201, created.text
    ticket = created.json()
    assert ticket["reference"] == f"HD-{ticket['id']:06d}" and ticket["status"] == "open" and ticket["categoryLabel"] == "Document Upload Issues"
    assert ticket["attachment"]["filename"] == "screen.png" and ticket["createdAt"] and ticket["requesterName"] is None
    assert client.get(f"/api/v1/helpdesk/tickets/{ticket['id']}/attachment").status_code == 200
    assert [t["id"] for t in client.get("/api/v1/helpdesk/tickets").json()] == [ticket["id"]]
    assert client.get("/api/v1/helpdesk/admin/tickets").status_code == 403

    login(client, HR_EMAIL)
    all_tickets = client.get("/api/v1/helpdesk/admin/tickets").json()
    assert all_tickets[0]["requesterEmail"] == EMPLOYEE_EMAIL
    updated = client.patch(f"/api/v1/helpdesk/admin/tickets/{ticket['id']}", json={"status": "in_progress"})
    assert updated.status_code == 200 and updated.json()["status"] == "in_progress"
    resolved = client.patch(f"/api/v1/helpdesk/admin/tickets/{ticket['id']}", json={"status": "resolved"}).json()
    assert resolved["resolvedAt"]
    assert client.get("/api/v1/helpdesk/admin/summary").json()["byStatus"]["resolved"] == 1
    assert client.get(f"/api/v1/helpdesk/admin/tickets/{ticket['id']}/attachment").status_code == 200
    assert client.patch(f"/api/v1/helpdesk/admin/tickets/{ticket['id']}", json={"status": "answered"}).status_code == 422

    login(client, EMPLOYEE_EMAIL)
    assert client.get(f"/api/v1/helpdesk/tickets/{ticket['id']}").json()["status"] == "resolved"


def test_ticket_errors_and_isolation(client: TestClient) -> None:
    invalid = client.post("/api/v1/helpdesk/tickets", data={"category": "it_support", "subject": "x", "description": "y"})
    assert invalid.status_code == 422 and {"subject", "description"} <= set(invalid.json()["fields"])
    exe = client.post(
        "/api/v1/helpdesk/tickets",
        data={"category": "it_support", "subject": "Laptop issue", "description": "My laptop won't start."},
        files={"attachment": ("screen.png", b"MZ\x90\x00 not an image", "image/png")},
    )
    assert exe.status_code == 415
    mine = client.post("/api/v1/helpdesk/tickets", data={"category": "it_support", "subject": "VPN access", "description": "The VPN rejects my login."}).json()

    with TestClient(client.app) as other:
        register(other, "someone.else@example.com", "sales")
        assert other.get(f"/api/v1/helpdesk/tickets/{mine['id']}").status_code == 404
        assert other.get(f"/api/v1/helpdesk/tickets/{mine['id']}/attachment").status_code == 404
        assert other.get("/api/v1/helpdesk/tickets").json() == []


# ---- Profile photo and guidance preferences -----------------------------------------------------------------------


def test_photo_validation() -> None:
    data, content_type, extension = process_photo(png_bytes((1200, 800)), 2 * 1024 * 1024)
    assert content_type == "image/png" and extension == ".png"
    assert Image.open(io.BytesIO(data)).size == (512, 341)  # resized
    for content, status in [(b"", 422), (b"GIF89a....", 415), (b"\x89PNG\r\n\x1a\n" + b"garbage" * 10, 422), (png_bytes() + b"x" * 3_000_000, 413)]:
        with pytest.raises(ProfilePhotoError) as error:
            process_photo(content, 2 * 1024 * 1024)
        assert error.value.status_code == status


def test_profile_photo_upload_replace_and_remove(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").json()["photoUrl"] is None
    uploaded = client.post("/api/v1/auth/me/photo", files={"file": ("me.png", png_bytes(), "image/png")})
    assert uploaded.status_code == 200
    first_url = uploaded.json()["photoUrl"]
    assert first_url.startswith("/api/v1/auth/me/photo?v=")
    photo = client.get("/api/v1/auth/me/photo")
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/png"

    photos_dir = client.app.state.settings.profile_photos_dir
    jpeg = io.BytesIO()
    Image.new("RGB", (60, 60), "teal").save(jpeg, format="JPEG")
    replaced = client.post("/api/v1/auth/me/photo", files={"file": ("me.jpg", jpeg.getvalue(), "image/jpeg")})
    assert replaced.status_code == 200 and client.get("/api/v1/auth/me/photo").headers["content-type"] == "image/jpeg"
    assert len([p for p in photos_dir.rglob("*") if p.is_file()]) == 1  # the old file was removed

    assert client.post("/api/v1/auth/me/photo", files={"file": ("me.png", b"not an image", "image/png")}).status_code == 415
    removed = client.delete("/api/v1/auth/me/photo")
    assert removed.json()["photoUrl"] is None and client.get("/api/v1/auth/me/photo").status_code == 404
    assert not any(p.is_file() for p in photos_dir.rglob("*"))


def test_photo_requires_sign_in_and_csrf(anonymous_client: TestClient) -> None:
    assert anonymous_client.get("/api/v1/auth/me/photo").status_code == 401
    register(anonymous_client)
    no_csrf = anonymous_client.post("/api/v1/auth/me/photo", files={"file": ("me.png", png_bytes(), "image/png")})
    assert no_csrf.status_code == 403


def test_guidance_preferences_are_remembered_per_account(client: TestClient) -> None:
    me = client.get("/api/v1/auth/me").json()
    assert me["tourCompleted"] is False and me["companyIntroSeen"] is False
    updated = client.patch("/api/v1/auth/me/preferences", json={"tourCompleted": True}).json()
    assert updated["tourCompleted"] is True and updated["companyIntroSeen"] is False
    client.patch("/api/v1/auth/me/preferences", json={"companyIntroSeen": True})
    login(client, EMPLOYEE_EMAIL, DEMO_PASSWORD)  # a new session on another device
    again = client.get("/api/v1/auth/me").json()
    assert again["tourCompleted"] and again["companyIntroSeen"]
    assert client.patch("/api/v1/auth/me/preferences", json={"tourCompleted": False}).json()["tourCompleted"] is False
    assert client.patch("/api/v1/auth/me/preferences", json={"role": "hr"}).status_code == 422
