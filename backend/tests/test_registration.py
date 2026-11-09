"""Employee self-registration: validation, role assignment, data created, isolation and abuse protection."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.password_policy import password_problems
from app.data.job_roles import JobRole
from app.data.task_catalog import templates_for
from app.core.security import verify_password
from app.db.models import EmployeeProfileRecord, OnboardingTaskRecord, UserRecord
from app.main import create_app
from app.schemas.auth import UserRole
from tests.conftest import CSRF_HEADERS, EMPLOYEE_EMAIL, HR_EMAIL, REFERENCE_DATE, login, make_settings

REGISTER = "/api/v1/auth/register"
STRONG = "Harbour-Lights-42"
NEW_EMAIL = "arjun.mehta@example.com"
DEVELOPER_TASKS = len(templates_for(JobRole.SOFTWARE_DEVELOPER))


def payload(**overrides: object) -> dict:
    body = {"fullName": "Arjun Mehta", "email": NEW_EMAIL, "password": STRONG, "confirmPassword": STRONG, "jobRole": "software_developer"}
    body.update(overrides)
    return body


def register(client: TestClient, headers: dict | None = None, **overrides: object):
    return client.post(REGISTER, json=payload(**overrides), headers=CSRF_HEADERS if headers is None else headers)


def stored_user(client: TestClient, email: str = NEW_EMAIL) -> UserRecord | None:
    with client.app.state.session_factory() as session:
        user = session.scalars(select(UserRecord).where(UserRecord.email == email)).first()
        if user is not None:
            _ = user.profile  # load before the session closes
        return user


def detail(response) -> str:  # noqa: ANN001
    body = response.json()["detail"]
    return body if isinstance(body, str) else " ".join(item["msg"] for item in body)


# ---- Success ----


def test_registration_creates_an_employee_and_signs_them_in(anonymous_client: TestClient) -> None:
    response = register(anonymous_client)

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == NEW_EMAIL
    assert body["user"]["fullName"] == "Arjun Mehta"
    assert body["user"]["role"] == "employee"
    assert body["user"]["profile"]["firstName"] == "Arjun"
    assert body["user"]["profile"]["lastName"] == "Mehta"
    assert body["user"]["profile"]["startDate"] == REFERENCE_DATE.isoformat()
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("onboardiq_session=") and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "password" not in response.text.lower()
    # The session works straight away.
    assert anonymous_client.get("/api/v1/auth/me").json()["email"] == NEW_EMAIL


def test_registration_stores_a_scrypt_hash_never_the_password(anonymous_client: TestClient) -> None:
    register(anonymous_client)
    user = stored_user(anonymous_client)
    assert user is not None
    assert user.role == UserRole.EMPLOYEE and user.is_active
    assert STRONG not in user.password_hash
    assert user.password_hash.startswith("scrypt$")
    assert verify_password(STRONG, user.password_hash)


def test_registration_creates_profile_and_a_fresh_checklist(anonymous_client: TestClient) -> None:
    register(anonymous_client)
    tasks = anonymous_client.get("/api/v1/onboarding/tasks").json()
    progress = anonymous_client.get("/api/v1/onboarding/progress").json()

    assert len(tasks) == DEVELOPER_TASKS
    assert {t["status"] for t in tasks} == {"pending"}
    assert progress["completedTasks"] == 0 and progress["overdueTasks"] == 0  # due dates start from today
    assert min(t["dueDate"] for t in tasks) >= REFERENCE_DATE.isoformat()

    with anonymous_client.app.state.session_factory() as session:
        user_id = session.scalars(select(UserRecord.id).where(UserRecord.email == NEW_EMAIL)).one()
        assert session.scalar(select(func.count()).select_from(EmployeeProfileRecord).where(EmployeeProfileRecord.user_id == user_id)) == 1
        assert session.scalar(select(func.count()).select_from(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == user_id)) == DEVELOPER_TASKS


def test_new_employee_can_sign_in_later_with_their_password(anonymous_client: TestClient) -> None:
    register(anonymous_client)
    anonymous_client.post("/api/v1/auth/logout", headers=CSRF_HEADERS)
    assert login(anonymous_client, NEW_EMAIL, STRONG)["user"]["role"] == "employee"


def test_email_is_normalised(anonymous_client: TestClient) -> None:
    response = register(anonymous_client, email="  Arjun.Mehta@Example.COM ", fullName="  Arjun   Mehta ")
    assert response.status_code == 201
    assert response.json()["user"]["email"] == NEW_EMAIL
    assert response.json()["user"]["fullName"] == "Arjun Mehta"


def test_new_employee_appears_on_the_hr_dashboard(anonymous_client: TestClient) -> None:
    register(anonymous_client)
    login(anonymous_client, HR_EMAIL)
    employees = anonymous_client.get("/api/v1/hr/employees", params={"search": "arjun"}).json()["employees"]
    assert [(e["fullName"], e["department"], e["status"], e["completedTasks"]) for e in employees] == [("Arjun Mehta", "Engineering", "not_started", 0)]


# ---- Privilege escalation ----


@pytest.mark.parametrize("extra", [{"role": "hr"}, {"role": "employee"}, {"isActive": True}, {"is_admin": True}, {"profile": {"department": "HR"}}])
def test_extra_fields_such_as_role_are_rejected(anonymous_client: TestClient, extra: dict) -> None:
    response = register(anonymous_client, **extra)
    assert response.status_code == 422
    assert stored_user(anonymous_client) is None


def test_registered_users_have_no_hr_access(anonymous_client: TestClient) -> None:
    register(anonymous_client)
    assert anonymous_client.get("/api/v1/hr/summary").status_code == 403
    upload = anonymous_client.post("/api/v1/policies/documents", files={"file": ("x.txt", b"Policy text. " * 20, "text/plain")}, headers=CSRF_HEADERS)
    assert upload.status_code == 403


def test_new_employee_sees_only_their_own_data(anonymous_client: TestClient) -> None:
    register(anonymous_client)
    contact = {"name": "Meena Mehta", "relationship": "Parent", "phone": "+91 98450 00000"}
    blocked = anonymous_client.post("/api/v1/onboarding/tasks/emergency_contact/action", json={"values": contact}, headers=CSRF_HEADERS)
    assert blocked.status_code == 409 and "Complete employee profile" in blocked.json()["detail"]  # prerequisite first
    profile = {"phone": "+91 98765 43210", "personal_email": "meena@personal.example", "date_of_birth": "2000-02-02", "address": "1 MG Road, Bengaluru"}
    response = anonymous_client.post("/api/v1/onboarding/tasks/profile/action", json={"values": profile}, headers=CSRF_HEADERS)
    assert response.status_code == 200
    response = anonymous_client.post("/api/v1/onboarding/tasks/emergency_contact/action", json={"values": contact}, headers=CSRF_HEADERS)
    assert response.status_code == 200
    assert anonymous_client.get("/api/v1/onboarding/progress").json()["completedTasks"] == 2

    login(anonymous_client, EMPLOYEE_EMAIL)  # the demo employee is unaffected
    assert anonymous_client.get("/api/v1/onboarding/progress").json()["completedTasks"] == 7
    assert anonymous_client.get("/api/v1/onboarding/tasks/emergency_contact/action").json()["values"].get("name") != "Meena Mehta"


# ---- Duplicates ----


def test_duplicate_email_is_rejected(anonymous_client: TestClient) -> None:
    assert register(anonymous_client).status_code == 201
    anonymous_client.post("/api/v1/auth/logout", headers=CSRF_HEADERS)

    again = register(anonymous_client, email=NEW_EMAIL.upper(), password="Another-Strong-77", confirmPassword="Another-Strong-77")
    assert again.status_code == 409
    assert "already exists" in detail(again)
    assert "set-cookie" not in again.headers
    # The original password still works; nothing was overwritten.
    assert login(anonymous_client, NEW_EMAIL, STRONG)


@pytest.mark.parametrize("email", [EMPLOYEE_EMAIL, HR_EMAIL])
def test_existing_demo_accounts_cannot_be_taken_over(anonymous_client: TestClient, email: str) -> None:
    response = register(anonymous_client, email=email)
    assert response.status_code == 409
    with anonymous_client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(UserRecord).where(UserRecord.email == email)) == 1


# ---- Validation ----


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"fullName": ""}, ""),
        ({"fullName": "Arjun"}, "first and last name"),
        ({"fullName": "Arjun M3hta"}, "letters only"),
        ({"fullName": "<script>alert(1)</script> x"}, "letters only"),
        ({"email": ""}, ""),
        ({"email": "not-an-email"}, "valid email"),
        ({"email": "arjun@localhost"}, "valid email"),
        ({"email": "a b@example.com"}, "valid email"),
        ({"password": "", "confirmPassword": ""}, ""),
        ({"confirmPassword": "Harbour-Lights-43"}, "don't match"),
        ({"password": "Short1A", "confirmPassword": "Short1A"}, "at least 10"),
        ({"password": "alllowercase123", "confirmPassword": "alllowercase123"}, "uppercase"),
        ({"password": "ALLUPPERCASE123", "confirmPassword": "ALLUPPERCASE123"}, "lowercase"),
        ({"password": "NoNumbersHere-", "confirmPassword": "NoNumbersHere-"}, "number"),
        ({"password": "Password12345", "confirmPassword": "Password12345"}, "common"),
        ({"password": "ArjunRocks2026", "confirmPassword": "ArjunRocks2026"}, "name or email"),
        ({"password": "x" * 129, "confirmPassword": "x" * 129}, ""),
    ],
)
def test_invalid_input_is_rejected(anonymous_client: TestClient, overrides: dict, message: str) -> None:
    response = register(anonymous_client, **overrides)
    assert response.status_code == 422
    assert message.lower() in detail(response).lower()
    assert stored_user(anonymous_client) is None


@pytest.mark.parametrize("missing", ["fullName", "email", "password", "confirmPassword"])
def test_all_fields_are_required(anonymous_client: TestClient, missing: str) -> None:
    body = payload()
    del body[missing]
    assert anonymous_client.post(REGISTER, json=body, headers=CSRF_HEADERS).status_code == 422


def test_passwords_are_not_trimmed(anonymous_client: TestClient) -> None:
    padded = f" {STRONG} "
    assert register(anonymous_client, password=padded, confirmPassword=padded).status_code == 201
    anonymous_client.post("/api/v1/auth/logout", headers=CSRF_HEADERS)
    assert anonymous_client.post("/api/v1/auth/login", json={"email": NEW_EMAIL, "password": STRONG}, headers=CSRF_HEADERS).status_code == 401
    assert login(anonymous_client, NEW_EMAIL, padded)


def test_password_policy_unit() -> None:
    assert password_problems("Harbour-Lights-42") == []
    assert password_problems("Mehta-Harbour-42", full_name="Arjun Mehta") == ["Don't include your name or email address."]
    assert "Include a number." in password_problems("Harbour-Lights")


# ---- Abuse protection & configuration ----


def test_registration_requires_the_verification_header(anonymous_client: TestClient) -> None:
    response = register(anonymous_client, headers={})
    assert response.status_code == 403
    assert stored_user(anonymous_client) is None


def test_registration_is_rate_limited_per_client(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url, registration_max_per_hour=2))) as client:
        assert register(client, email="a.one@example.com").status_code == 201
        assert register(client, email="a.two@example.com").status_code == 201
        blocked = register(client, email="a.three@example.com")
        assert blocked.status_code == 429
        assert int(blocked.headers["retry-after"]) > 0
        assert stored_user(client, "a.three@example.com") is None


def test_registration_can_be_turned_off(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url, allow_self_registration=False))) as client:
        response = register(client)
        assert response.status_code == 403
        assert "turned off" in detail(response)
        assert stored_user(client) is None


# ---- Job roles ----


@pytest.mark.parametrize("job_role", [role.value for role in JobRole])
def test_job_role_decides_the_checklist(anonymous_client: TestClient, job_role: str) -> None:
    response = register(anonymous_client, jobRole=job_role)
    assert response.status_code == 201
    profile = response.json()["user"]["profile"]
    assert profile["jobRole"] == job_role and profile["jobRoleLabel"]
    tasks = anonymous_client.get("/api/v1/onboarding/tasks").json()
    expected = templates_for(JobRole(job_role))
    assert {t["id"] for t in tasks} == {t.key for t in expected}
    assert all(t["status"] == "pending" and t["actionType"] for t in tasks)


def test_different_roles_get_different_checklists(anonymous_client: TestClient) -> None:
    register(anonymous_client, jobRole="hr")
    hr_tasks = {t["id"] for t in anonymous_client.get("/api/v1/onboarding/tasks").json()}
    anonymous_client.post("/api/v1/auth/logout", headers=CSRF_HEADERS)
    register(anonymous_client, email="dev.person@example.com", fullName="Dev Person", jobRole="software_developer")
    dev_tasks = {t["id"] for t in anonymous_client.get("/api/v1/onboarding/tasks").json()}

    assert {"profile", "documents", "company_policies", "security_training"} <= hr_tasks & dev_tasks  # shared tasks
    assert "hr_system_training" in hr_tasks - dev_tasks
    assert {"git_access", "ide_setup", "dev_environment"} <= dev_tasks - hr_tasks
    assert len(hr_tasks) != len(dev_tasks)


def test_hr_job_role_never_grants_hr_access(anonymous_client: TestClient) -> None:
    response = register(anonymous_client, jobRole="hr")
    assert response.json()["user"]["role"] == "employee"
    assert anonymous_client.get("/api/v1/hr/summary").status_code == 403


@pytest.mark.parametrize("job_role", [None, "", "ceo", "HR "])
def test_job_role_is_required_and_validated(anonymous_client: TestClient, job_role: str | None) -> None:
    body = payload()
    if job_role is None:
        del body["jobRole"]
    else:
        body["jobRole"] = job_role
    assert anonymous_client.post(REGISTER, json=body, headers=CSRF_HEADERS).status_code == 422
    assert stored_user(anonymous_client) is None


# ---- Separate first / middle / last name fields (the sign-up form) ----


def parts_payload(**overrides: object) -> dict:
    body = payload(fullName=None, firstName="Arjun", middleName="Kumar", lastName="Mehta")
    body.pop("fullName")
    body.update(overrides)
    return {key: value for key, value in body.items() if value is not None}


def test_name_parts_with_a_middle_name_are_combined(anonymous_client: TestClient) -> None:
    response = anonymous_client.post(REGISTER, json=parts_payload(), headers=CSRF_HEADERS)
    assert response.status_code == 201, response.text
    body = response.json()["user"]
    assert body["fullName"] == "Arjun Kumar Mehta"
    assert body["role"] == "employee"
    assert (body["profile"]["firstName"], body["profile"]["lastName"]) == ("Arjun", "Mehta")
    user = stored_user(anonymous_client)
    assert user is not None and user.full_name == "Arjun Kumar Mehta" and user.role == UserRole.EMPLOYEE
    assert (user.profile.first_name, user.profile.last_name) == ("Arjun", "Mehta")


def test_name_parts_without_a_middle_name(anonymous_client: TestClient) -> None:
    response = anonymous_client.post(REGISTER, json=parts_payload(middleName=None), headers=CSRF_HEADERS)
    assert response.status_code == 201, response.text
    assert response.json()["user"]["fullName"] == "Arjun Mehta"
    # A blank middle name counts as none.
    other = anonymous_client.post(REGISTER, json=parts_payload(middleName="   ", email="a.two@example.com"), headers=CSRF_HEADERS)
    assert other.status_code == 201 and other.json()["user"]["fullName"] == "Arjun Mehta"


def test_name_parts_keep_multi_word_names_and_trim_spaces(anonymous_client: TestClient) -> None:
    response = anonymous_client.post(REGISTER, json=parts_payload(firstName="  Mary   Ann ", middleName=None, lastName="O'Neil-Rao"), headers=CSRF_HEADERS)
    assert response.status_code == 201, response.text
    user = stored_user(anonymous_client)
    assert user is not None and user.full_name == "Mary Ann O'Neil-Rao"
    assert (user.profile.first_name, user.profile.last_name) == ("Mary Ann", "O'Neil-Rao")


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"firstName": None}, "first name"),
        ({"lastName": "  "}, "last name"),
        ({"firstName": "Arjun3"}, "first name using letters only"),
        ({"middleName": "K@"}, "middle name using letters only"),
        ({"fullName": "Arjun Mehta"}, "either the name parts or fullName"),
    ],
)
def test_invalid_name_parts_are_rejected(anonymous_client: TestClient, overrides: dict, message: str) -> None:
    response = anonymous_client.post(REGISTER, json=parts_payload(**overrides), headers=CSRF_HEADERS)
    assert response.status_code == 422
    assert message in detail(response)
    assert stored_user(anonymous_client) is None


@pytest.mark.parametrize("extra", [{"role": "hr"}, {"isAdmin": True}])
def test_name_parts_still_cannot_request_hr_access(anonymous_client: TestClient, extra: dict) -> None:
    response = anonymous_client.post(REGISTER, json=parts_payload(**extra), headers=CSRF_HEADERS)
    assert response.status_code == 422
    assert stored_user(anonymous_client) is None


def test_null_middle_name_is_accepted(anonymous_client: TestClient) -> None:
    response = anonymous_client.post(REGISTER, json={**parts_payload(), "middleName": None}, headers=CSRF_HEADERS)
    assert response.status_code == 201, response.text
    assert response.json()["user"]["fullName"] == "Arjun Mehta"


def test_hr_job_role_with_full_name_parts_is_still_an_employee_without_hr_access(anonymous_client: TestClient) -> None:
    body = parts_payload(firstName="Ravi", middleName="Shankar", lastName="N C", jobRole="hr")
    response = anonymous_client.post(REGISTER, json=body, headers=CSRF_HEADERS)
    assert response.status_code == 201, response.text
    user = response.json()["user"]
    assert (user["fullName"], user["role"], user["profile"]["jobRole"]) == ("Ravi Shankar N C", "employee", "hr")
    assert anonymous_client.get("/api/v1/hr/summary").status_code == 403
    assert anonymous_client.get("/api/v1/helpdesk/admin/tickets").status_code == 403
