"""HR dashboard API: figures are computed from the stored checklists."""

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.data.demo_users import DEMO_EMPLOYEES
from app.db.models import OnboardingTaskRecord, UserRecord
from app.schemas.auth import UserRole
from app.schemas.onboarding import TaskStatus
from tests.conftest import CSRF_HEADERS, EMPLOYEE_EMAIL, HR_EMAIL, REFERENCE_DATE, login

BASE = "/api/v1/hr"
SUMMARY_KEYS = {
    "totalEmployees", "statusCounts", "totalTasks", "completedTasks", "openTasks",
    "inProgressTasks", "overdueTasks", "averageCompletion", "departments", "referenceDate",
}  # fmt: skip


def stored_tasks(client: TestClient) -> list[OnboardingTaskRecord]:
    with client.app.state.session_factory() as session:
        return list(session.scalars(select(OnboardingTaskRecord)))


def test_summary_matches_the_database(hr_client: TestClient) -> None:
    summary = hr_client.get(f"{BASE}/summary").json()
    tasks = stored_tasks(hr_client)

    assert set(summary) == SUMMARY_KEYS
    assert summary["totalEmployees"] == len(DEMO_EMPLOYEES)
    assert summary["totalTasks"] == len(tasks)
    assert summary["completedTasks"] == sum(t.status == TaskStatus.COMPLETED for t in tasks)
    assert summary["openTasks"] == summary["totalTasks"] - summary["completedTasks"]
    assert summary["inProgressTasks"] == sum(t.status == TaskStatus.IN_PROGRESS for t in tasks)
    assert summary["overdueTasks"] == sum(t.status != TaskStatus.COMPLETED and t.due_date < REFERENCE_DATE for t in tasks)
    assert sum(summary["statusCounts"].values()) == summary["totalEmployees"]
    assert summary["referenceDate"] == REFERENCE_DATE.isoformat()
    assert "Product Engineering" in summary["departments"]


def test_summary_reacts_to_employee_progress(hr_client: TestClient) -> None:
    before = hr_client.get(f"{BASE}/summary").json()

    login(hr_client, EMPLOYEE_EMAIL)
    # Completing an overdue task through its action (the emergency contact form).
    response = hr_client.post("/api/v1/onboarding/tasks/emergency_contact/action", json={"values": {"name": "Anil Nambiar", "relationship": "Parent", "phone": "+91 98450 12345"}}, headers=CSRF_HEADERS)
    assert response.status_code == 200
    login(hr_client, HR_EMAIL)

    after = hr_client.get(f"{BASE}/summary").json()
    assert after["completedTasks"] == before["completedTasks"] + 1
    assert after["inProgressTasks"] == before["inProgressTasks"] - 1
    assert after["overdueTasks"] == before["overdueTasks"] - 1


def test_employee_list_contains_progress_without_sensitive_fields(hr_client: TestClient) -> None:
    body = hr_client.get(f"{BASE}/employees").json()

    assert body["totalEmployees"] == body["totalMatching"] == len(body["employees"]) == len(DEMO_EMPLOYEES)
    shreya = next(e for e in body["employees"] if e["email"] == EMPLOYEE_EMAIL)
    assert shreya["fullName"] == "Shreya Nambiar"
    assert (shreya["completedTasks"], shreya["totalTasks"], shreya["overdueTasks"]) == (7, 13, 3)
    assert shreya["completionPercentage"] == 54
    assert (shreya["jobRole"], shreya["jobRoleLabel"]) == ("software_developer", "Software Developer")
    assert shreya["status"] == "at_risk"
    assert shreya["currentStage"] == "Welcome"
    assert shreya["lastActivityAt"] is not None
    for forbidden in ("password", "passwordHash", "lastLoginAt", "isActive"):
        assert forbidden not in shreya
    assert "scrypt$" not in hr_client.get(f"{BASE}/employees").text


def test_hr_accounts_are_not_listed_as_employees(hr_client: TestClient) -> None:
    emails = {e["email"] for e in hr_client.get(f"{BASE}/employees").json()["employees"]}
    assert HR_EMAIL not in emails


def test_employees_needing_attention_are_listed_first(hr_client: TestClient) -> None:
    order = ["at_risk", "not_started", "on_track", "completed"]
    statuses = [e["status"] for e in hr_client.get(f"{BASE}/employees").json()["employees"]]
    assert statuses == sorted(statuses, key=order.index)


def test_status_filter(hr_client: TestClient) -> None:
    for status in ("at_risk", "not_started", "on_track", "completed"):
        body = hr_client.get(f"{BASE}/employees", params={"status": status}).json()
        assert all(e["status"] == status for e in body["employees"])
        assert len(body["employees"]) == body["statusCounts"][{"at_risk": "atRisk", "not_started": "notStarted", "on_track": "onTrack"}.get(status, status)]

    completed = hr_client.get(f"{BASE}/employees", params={"status": "completed"}).json()["employees"]
    assert [e["fullName"] for e in completed] == ["Meera Pillai"]
    not_started = hr_client.get(f"{BASE}/employees", params={"status": "not_started"}).json()["employees"]
    assert [e["fullName"] for e in not_started] == ["Ananya Bose"]


def test_search_matches_name_email_or_job_title(hr_client: TestClient) -> None:
    def names(search: str) -> list[str]:
        return [e["fullName"] for e in hr_client.get(f"{BASE}/employees", params={"search": search}).json()["employees"]]

    assert names("shreya") == ["Shreya Nambiar"]
    assert names("SNEHA.KULKARNI@") == ["Sneha Kulkarni"]
    assert "Karthik Raman" in names("devops")
    assert names("no such person") == []


def test_status_counts_follow_search_and_department_filters(hr_client: TestClient) -> None:
    body = hr_client.get(f"{BASE}/employees", params={"department": "Product Engineering"}).json()
    assert {e["department"] for e in body["employees"]} == {"Product Engineering"}
    assert sum(body["statusCounts"].values()) == body["totalMatching"] == len(body["employees"])
    assert body["totalEmployees"] == len(DEMO_EMPLOYEES)


def test_invalid_filters_are_rejected(hr_client: TestClient) -> None:
    assert hr_client.get(f"{BASE}/employees", params={"status": "great"}).status_code == 422
    assert hr_client.get(f"{BASE}/employees", params={"search": "x" * 101}).status_code == 422


def test_employee_detail_includes_tasks_and_progress(hr_client: TestClient) -> None:
    employees = hr_client.get(f"{BASE}/employees", params={"search": "shreya"}).json()["employees"]
    detail = hr_client.get(f"{BASE}/employees/{employees[0]['id']}").json()

    assert detail["employee"]["email"] == EMPLOYEE_EMAIL
    assert detail["buddyName"] == "Rohan Das"
    assert len(detail["tasks"]) == 13
    assert detail["progress"]["completedTasks"] == 7
    assert all(t["actionType"] for t in detail["tasks"])
    assert [s["name"] for s in detail["progress"]["stages"]][0] == "Welcome"


def test_employee_detail_404s_for_unknown_ids_and_hr_accounts(hr_client: TestClient) -> None:
    with hr_client.app.state.session_factory() as session:
        hr_id = session.scalars(select(UserRecord.id).where(UserRecord.role == UserRole.HR)).first()
    assert hr_client.get(f"{BASE}/employees/999999").status_code == 404
    assert hr_client.get(f"{BASE}/employees/{hr_id}").status_code == 404
    assert hr_client.get(f"{BASE}/employees/not-a-number").status_code == 422


def test_deactivated_employees_are_excluded(hr_client: TestClient) -> None:
    with hr_client.app.state.session_factory() as session:
        session.scalars(select(UserRecord).where(UserRecord.email == EMPLOYEE_EMAIL)).one().is_active = False
        session.commit()
    body = hr_client.get(f"{BASE}/employees").json()
    assert EMPLOYEE_EMAIL not in {e["email"] for e in body["employees"]}
    assert hr_client.get(f"{BASE}/summary").json()["totalEmployees"] == len(DEMO_EMPLOYEES) - 1
