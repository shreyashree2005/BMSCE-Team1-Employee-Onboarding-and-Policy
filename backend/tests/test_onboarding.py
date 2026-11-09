"""API tests for the onboarding endpoints (each test runs against its own seeded SQLite database).

The signed-in demo employee is a Software Developer with the role-based checklist from app/data/task_catalog.py.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.data.demo_users import PRIMARY_DEMO_EMPLOYEE, build_employee_tasks
from app.data.job_roles import JobRole
from app.data.task_catalog import build_role_checklist
from app.schemas.onboarding import TaskStatus
from app.services.onboarding_service import calculate_progress
from tests.conftest import REFERENCE_DATE

BASE = "/api/v1/onboarding"
PRIMARY_TASKS = [g.task for g in build_employee_tasks(PRIMARY_DEMO_EMPLOYEE)]
EXPECTED = calculate_progress(PRIMARY_TASKS, REFERENCE_DATE)
EMERGENCY_CONTACT = {"name": "Anil Nambiar", "relationship": "Parent", "phone": "+91 98450 12345", "email": ""}


def complete_emergency_contact(client: TestClient) -> dict:
    response = client.post(f"{BASE}/tasks/emergency_contact/action", json={"values": EMERGENCY_CONTACT})
    assert response.status_code == 200, response.text
    return response.json()


# ---- Listing and filtering ----


def test_list_tasks_returns_the_role_checklist_in_camel_case(client: TestClient) -> None:
    response = client.get(f"{BASE}/tasks")

    assert response.status_code == 200
    tasks = response.json()
    assert len(tasks) == len(PRIMARY_TASKS) == 13
    assert set(tasks[0]) == {"id", "stage", "title", "description", "category", "dueDate", "priority", "status", "updatedAt", "actionType", "completedAt", "dependsOn", "sequence", "firstStartedAt", "activeSince", "timeSpentSeconds"}
    titles = {task["title"] for task in tasks}
    for required in ["Complete employee profile", "Upload required documents", "Read company policies", "Complete security training", "Set up development environment", "Request Git access", "Set up IDE"]:
        assert required in titles
    assert all(task["actionType"] for task in tasks), "every task has an action"


def test_list_tasks_is_ordered_by_stage_then_due_date(client: TestClient) -> None:
    tasks = client.get(f"{BASE}/tasks").json()
    stage_order = ["Welcome", "Documentation", "Payroll & Benefits", "Training", "Ready to Go"]

    keys = [(stage_order.index(task["stage"]), task["dueDate"]) for task in tasks]
    assert keys == sorted(keys)


@pytest.mark.parametrize(
    ("query", "field", "value"),
    [
        ("status=completed", "status", "completed"),
        ("status=in_progress", "status", "in_progress"),
        ("status=pending", "status", "pending"),
        ("category=Payroll", "category", "Payroll"),
        ("stage=Training", "stage", "Training"),
    ],
)
def test_filters_return_only_matching_tasks(client: TestClient, query: str, field: str, value: str) -> None:
    tasks = client.get(f"{BASE}/tasks?{query}").json()

    assert tasks, f"expected at least one task for {query}"
    assert all(task[field] == value for task in tasks)


def test_status_filters_never_mix_statuses(client: TestClient) -> None:
    by_status = {status: {t["id"] for t in client.get(f"{BASE}/tasks", params={"status": status}).json()} for status in ("pending", "in_progress", "completed")}
    all_ids = {t["id"] for t in client.get(f"{BASE}/tasks").json()}

    assert by_status["pending"].isdisjoint(by_status["in_progress"]) and by_status["in_progress"].isdisjoint(by_status["completed"])
    assert by_status["pending"] | by_status["in_progress"] | by_status["completed"] == all_ids
    assert by_status["in_progress"] == {"emergency_contact"}
    assert len(by_status["completed"]) == EXPECTED.completed_tasks


def test_filters_combine(client: TestClient) -> None:
    tasks = client.get(f"{BASE}/tasks", params={"status": "pending", "stage": "Training"}).json()

    assert [task["id"] for task in tasks] == ["company_policies", "security_training"]


def test_invalid_filter_value_is_rejected(client: TestClient) -> None:
    assert client.get(f"{BASE}/tasks?status=done").status_code == 422


# ---- Single task ----


def test_get_task_by_id(client: TestClient) -> None:
    response = client.get(f"{BASE}/tasks/profile")

    assert response.status_code == 200
    assert response.json()["title"] == "Complete employee profile"
    assert response.json()["actionType"] == "form"


def test_get_unknown_task_returns_404(client: TestClient) -> None:
    response = client.get(f"{BASE}/tasks/does-not-exist")

    assert response.status_code == 404
    assert "does-not-exist" in response.json()["detail"]


# ---- Status updates ----


def test_starting_a_task_persists(client: TestClient) -> None:
    response = client.patch(f"{BASE}/tasks/security_training", json={"status": "in_progress"})

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert client.get(f"{BASE}/tasks/security_training").json()["status"] == "in_progress"


def test_tasks_cannot_be_completed_without_doing_the_action(client: TestClient) -> None:
    response = client.patch(f"{BASE}/tasks/security_training", json={"status": "completed"})

    assert response.status_code == 409
    assert "finish its steps" in response.json()["detail"]
    assert client.get(f"{BASE}/tasks/security_training").json()["status"] == "pending"


def test_task_can_be_started_reset_and_completed_through_its_action(client: TestClient) -> None:
    for status in ["in_progress", "pending"]:
        response = client.patch(f"{BASE}/tasks/emergency_contact", json={"status": status})
        assert response.status_code == 200
        assert response.json()["status"] == status
    state = complete_emergency_contact(client)
    assert state["task"]["status"] == "completed"
    assert state["task"]["completedAt"] is not None


def test_completed_tasks_can_be_reopened(client: TestClient) -> None:
    response = client.patch(f"{BASE}/tasks/profile", json={"status": "in_progress"})
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert response.json()["completedAt"] is None


def test_update_only_changes_status(client: TestClient) -> None:
    before = client.get(f"{BASE}/tasks/goals").json()

    after = client.patch(f"{BASE}/tasks/goals", json={"status": "in_progress", "title": "Hacked"}).json()

    assert after["updatedAt"] >= before["updatedAt"]
    # Starting a task also starts its timer (server timestamps); nothing else changes.
    assert after["firstStartedAt"] and after["activeSince"] == after["firstStartedAt"] and after["timeSpentSeconds"] == 0
    timing = {"updatedAt": None, "firstStartedAt": None, "activeSince": None, "timeSpentSeconds": None}
    assert {**after, **timing} == {**before, "status": "in_progress", **timing}


@pytest.mark.parametrize("payload", [{"status": "done"}, {"status": ""}, {}])
def test_update_with_invalid_payload_is_rejected(client: TestClient, payload: dict) -> None:
    response = client.patch(f"{BASE}/tasks/goals", json=payload)

    assert response.status_code == 422
    assert client.get(f"{BASE}/tasks/goals").json()["status"] == "pending"


def test_update_unknown_task_returns_404(client: TestClient) -> None:
    assert client.patch(f"{BASE}/tasks/nope", json={"status": "in_progress"}).status_code == 404


# ---- Progress ----


def test_progress_matches_seed_data(client: TestClient) -> None:
    progress = client.get(f"{BASE}/progress").json()

    assert progress["totalTasks"] == 13
    assert progress["completedTasks"] == 7
    assert progress["inProgressTasks"] == 1
    assert progress["pendingTasks"] == 5
    assert progress["completionPercentage"] == 54
    assert progress["referenceDate"] == "2026-11-07"
    assert progress["overdueTasks"] == EXPECTED.overdue_tasks == 3


def test_progress_stages_identify_current_stage(client: TestClient) -> None:
    stages = client.get(f"{BASE}/progress").json()["stages"]

    assert [s["name"] for s in stages] == ["Welcome", "Documentation", "Payroll & Benefits", "Training", "Ready to Go"]
    assert [s["status"] for s in stages] == ["current", "upcoming", "completed", "upcoming", "upcoming"]
    assert stages[0] == {"name": "Welcome", "completedTasks": 4, "totalTasks": 5, "status": "current"}


def test_progress_categories_add_up_to_total(client: TestClient) -> None:
    progress = client.get(f"{BASE}/progress").json()

    assert sum(c["totalTasks"] for c in progress["categories"]) == progress["totalTasks"]
    assert sum(c["completedTasks"] for c in progress["categories"]) == progress["completedTasks"]


def test_progress_updates_after_completing_a_task(client: TestClient) -> None:
    complete_emergency_contact(client)

    progress = client.get(f"{BASE}/progress").json()

    assert progress["completedTasks"] == 8
    assert progress["inProgressTasks"] == 0
    assert progress["overdueTasks"] == 2
    documentation = next(s for s in progress["stages"] if s["name"] == "Documentation")
    assert documentation["status"] == "completed"


def test_progress_handles_empty_checklist() -> None:
    progress = calculate_progress([], REFERENCE_DATE)

    assert progress.total_tasks == 0
    assert progress.completion_percentage == 0
    assert all(stage.status == "completed" for stage in progress.stages)


def test_completed_tasks_are_never_overdue() -> None:
    tasks = [g.task.model_copy(update={"status": TaskStatus.COMPLETED}) for g in build_role_checklist(JobRole.OTHER, date(2026, 1, 1))]

    assert calculate_progress(tasks, date(2030, 1, 1)).overdue_tasks == 0
