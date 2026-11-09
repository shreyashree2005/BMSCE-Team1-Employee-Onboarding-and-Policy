"""Role-based access control and per-employee data isolation, enforced by the API."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.data.demo_users import DEMO_EMPLOYEES
from app.db.models import UserRecord
from tests.conftest import CSRF_HEADERS, EMPLOYEE_EMAIL, HR_EMAIL, login
from tests.policy_samples import LEAVE_POLICY

OTHER_EMPLOYEE_EMAIL = next(e for e in DEMO_EMPLOYEES if e.first_name == "Daniel").email

# (method, path, body) for every protected endpoint.
EMPLOYEE_ONLY = [
    ("GET", "/api/v1/onboarding/tasks", None),
    ("GET", "/api/v1/onboarding/tasks/goals", None),
    ("PATCH", "/api/v1/onboarding/tasks/goals", {"status": "in_progress"}),
    ("GET", "/api/v1/onboarding/tasks/emergency_contact/action", None),
    ("POST", "/api/v1/onboarding/tasks/emergency_contact/action", {"values": {"name": "Anil Nambiar", "relationship": "Parent", "phone": "+91 98450 12345"}}),
    ("GET", "/api/v1/onboarding/progress", None),
]
HR_ONLY = [
    ("GET", "/api/v1/hr/summary", None),
    ("GET", "/api/v1/hr/employees", None),
    ("GET", "/api/v1/hr/employees/2", None),
    ("DELETE", "/api/v1/policies/documents/00000000-0000-0000-0000-000000000000", None),
]
ANY_SIGNED_IN = [
    ("GET", "/api/v1/auth/me", None),
    ("GET", "/api/v1/policies/documents", None),
    ("GET", "/api/v1/policies/documents/00000000-0000-0000-0000-000000000000", None),
    ("POST", "/api/v1/policies/search", {"query": "annual leave"}),
    ("POST", "/api/v1/policies/chat", {"question": "How many days of annual leave do I get?"}),
    ("GET", "/api/v1/policies/assistant/status", None),
]
UPLOAD = "/api/v1/policies/documents"


def call(client: TestClient, method: str, path: str, body: dict | None):
    return client.request(method, path, json=body, headers=CSRF_HEADERS)


def upload(client: TestClient, name: str = "leave.txt", content: str = LEAVE_POLICY):
    return client.post(UPLOAD, files={"file": (name, content.encode(), "text/plain")}, headers=CSRF_HEADERS)


@pytest.mark.parametrize(("method", "path", "body"), EMPLOYEE_ONLY + HR_ONLY + ANY_SIGNED_IN)
def test_every_protected_endpoint_requires_sign_in(anonymous_client: TestClient, method: str, path: str, body: dict | None) -> None:
    assert call(anonymous_client, method, path, body).status_code == 401


def test_upload_requires_sign_in(anonymous_client: TestClient) -> None:
    assert upload(anonymous_client).status_code == 401


def test_public_endpoints_stay_public(anonymous_client: TestClient) -> None:
    assert anonymous_client.get("/health").status_code == 200
    assert anonymous_client.get("/docs").status_code == 200


@pytest.mark.parametrize(("method", "path", "body"), HR_ONLY)
def test_employees_cannot_use_hr_endpoints(client: TestClient, method: str, path: str, body: dict | None) -> None:
    response = call(client, method, path, body)
    assert response.status_code == 403
    assert response.json()["detail"] == "You don't have permission to perform this action."


def test_employees_cannot_upload_policies(client: TestClient) -> None:
    assert upload(client).status_code == 403
    assert client.get("/api/v1/policies/documents").json() == []


def test_employees_cannot_delete_policies(client: TestClient) -> None:
    login(client, HR_EMAIL)
    document_id = upload(client).json()["id"]
    login(client, EMPLOYEE_EMAIL)

    assert client.delete(f"{UPLOAD}/{document_id}", headers=CSRF_HEADERS).status_code == 403
    assert [d["id"] for d in client.get("/api/v1/policies/documents").json()] == [document_id]


@pytest.mark.parametrize(("method", "path", "body"), EMPLOYEE_ONLY)
def test_hr_has_no_personal_checklist_endpoints(hr_client: TestClient, method: str, path: str, body: dict | None) -> None:
    assert call(hr_client, method, path, body).status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), ANY_SIGNED_IN)
def test_both_roles_can_use_shared_endpoints(client: TestClient, method: str, path: str, body: dict | None) -> None:
    for email in (EMPLOYEE_EMAIL, HR_EMAIL):
        login(client, email)
        # Access is granted (404 for the made-up document ID; 503 from chat because tests have no LLM key).
        assert call(client, method, path, body).status_code not in {401, 403}


def test_employees_can_read_search_and_ask_about_hr_uploaded_policies(client: TestClient) -> None:
    login(client, HR_EMAIL)
    assert upload(client).status_code == 201
    login(client, EMPLOYEE_EMAIL)

    documents = client.get("/api/v1/policies/documents").json()
    assert len(documents) == 1
    assert client.get(f"{UPLOAD}/{documents[0]['id']}").status_code == 200
    assert client.post("/api/v1/policies/search", json={"query": "annual leave"}).json()["results"]
    # Chat is reachable for employees (the test app has no LLM key, so it reports that clearly).
    chat = client.post("/api/v1/policies/chat", json={"question": "How many days of annual leave do I get?"}, headers=CSRF_HEADERS)
    assert chat.status_code in {200, 503}


def test_hr_can_upload_and_delete_policies(hr_client: TestClient) -> None:
    response = upload(hr_client)
    assert response.status_code == 201
    assert hr_client.delete(f"{UPLOAD}/{response.json()['id']}").status_code == 204


# ---- CSRF ----


def test_cookie_authenticated_changes_need_the_verification_header(database_url: str) -> None:
    from app.main import create_app
    from tests.conftest import make_settings

    with TestClient(create_app(make_settings(database_url))) as client:  # no default headers
        login(client, EMPLOYEE_EMAIL)
        assert client.patch("/api/v1/onboarding/tasks/goals", json={"status": "in_progress"}).status_code == 403
        assert client.post("/api/v1/onboarding/tasks/emergency_contact/action", json={"values": {"name": "Anil Nambiar", "relationship": "Parent", "phone": "+91 98450 12345"}}).status_code == 403
        assert client.get("/api/v1/onboarding/tasks/goals").json()["status"] == "pending"  # reads don't need it
        assert client.patch("/api/v1/onboarding/tasks/goals", json={"status": "in_progress"}, headers=CSRF_HEADERS).status_code == 200

        login(client, HR_EMAIL)
        response = client.post(UPLOAD, files={"file": ("leave.txt", LEAVE_POLICY.encode(), "text/plain")})
        assert response.status_code == 403


def test_cors_rejects_unknown_origins(anonymous_client: TestClient) -> None:
    preflight = anonymous_client.options(
        "/api/v1/onboarding/tasks/goals",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "x-requested-with"},
    )
    assert "access-control-allow-origin" not in preflight.headers

    allowed = anonymous_client.options(
        "/api/v1/onboarding/tasks/goals",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "x-requested-with"},
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert allowed.headers["access-control-allow-credentials"] == "true"


# ---- Data isolation ----


def test_employees_only_see_their_own_checklist(client: TestClient) -> None:
    shreya_tasks = client.get("/api/v1/onboarding/tasks").json()
    shreya_progress = client.get("/api/v1/onboarding/progress").json()

    login(client, OTHER_EMPLOYEE_EMAIL)
    daniel_progress = client.get("/api/v1/onboarding/progress").json()

    assert len(shreya_tasks) == 13
    assert shreya_progress["completedTasks"] == 7
    assert daniel_progress["completedTasks"] == 4  # Daniel's own (different) data


def test_updating_a_task_never_changes_another_employees_task(client: TestClient) -> None:
    login(client, OTHER_EMPLOYEE_EMAIL)
    before = client.get("/api/v1/onboarding/tasks/goals").json()["status"]

    login(client, EMPLOYEE_EMAIL)
    assert client.patch("/api/v1/onboarding/tasks/goals", json={"status": "in_progress"}).json()["status"] == "in_progress"

    login(client, OTHER_EMPLOYEE_EMAIL)
    assert client.get("/api/v1/onboarding/tasks/goals").json()["status"] == before != "in_progress"


@pytest.mark.parametrize("params", [{"employee_id": 3}, {"employeeId": 3}, {"user_id": 3}])
def test_query_parameters_cannot_select_another_employee(client: TestClient, params: dict) -> None:
    own = client.get("/api/v1/onboarding/progress").json()
    assert client.get("/api/v1/onboarding/progress", params=params).json() == own
    assert client.get("/api/v1/onboarding/tasks", params=params).json() == client.get("/api/v1/onboarding/tasks").json()


def test_request_body_cannot_reassign_a_task(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        other_id = session.scalars(select(UserRecord.id).where(UserRecord.email == OTHER_EMPLOYEE_EMAIL)).one()
    response = client.patch("/api/v1/onboarding/tasks/goals", json={"status": "in_progress", "employeeId": other_id, "employee_id": other_id})
    assert response.status_code == 200

    login(client, OTHER_EMPLOYEE_EMAIL)
    assert client.get("/api/v1/onboarding/tasks/goals").json()["status"] != "in_progress"


def test_employee_changes_are_visible_to_hr(client: TestClient) -> None:
    client.post("/api/v1/onboarding/tasks/emergency_contact/action", json={"values": {"name": "Anil Nambiar", "relationship": "Parent", "phone": "+91 98450 12345"}})
    me = client.get("/api/v1/auth/me").json()

    login(client, HR_EMAIL)
    detail = client.get(f"/api/v1/hr/employees/{me['id']}").json()
    assert next(t for t in detail["tasks"] if t["id"] == "emergency_contact")["status"] == "completed"
    assert detail["employee"]["completedTasks"] == 8
    assert detail["employee"]["overdueTasks"] == 2  # two other overdue tasks remain
