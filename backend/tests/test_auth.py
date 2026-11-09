"""Sign-in, sessions and sign-out."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import TOKEN_ISSUER, create_access_token
from app.db.models import UserRecord
from app.main import create_app
from tests.conftest import CSRF_HEADERS, DEMO_PASSWORD, EMPLOYEE_EMAIL, HR_EMAIL, login, make_settings

LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"
LOGOUT = "/api/v1/auth/logout"
COOKIE = "onboardiq_session"


def attempt(client: TestClient, email: str, password: str, headers: dict | None = None):
    return client.post(LOGIN, json={"email": email, "password": password}, headers=CSRF_HEADERS if headers is None else headers)


def with_session(client: TestClient, update) -> None:  # noqa: ANN001
    with client.app.state.session_factory() as session:
        update(session)
        session.commit()


# ---- Login ----


def test_employee_login_returns_profile_and_sets_secure_cookie(anonymous_client: TestClient) -> None:
    response = attempt(anonymous_client, EMPLOYEE_EMAIL, DEMO_PASSWORD)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == EMPLOYEE_EMAIL
    assert body["user"]["role"] == "employee"
    assert body["user"]["fullName"] == "Shreya Nambiar"
    assert body["user"]["profile"]["jobTitle"] == "Associate Software Engineer"
    assert datetime.fromisoformat(body["expiresAt"]) > datetime.now(timezone.utc)
    assert set(body) == {"user", "expiresAt"}  # the token itself is only in the httpOnly cookie

    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE}=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert response.headers["cache-control"] == "no-store"


def test_hr_login_has_no_employee_profile(anonymous_client: TestClient) -> None:
    body = attempt(anonymous_client, HR_EMAIL, DEMO_PASSWORD).json()
    assert body["user"]["role"] == "hr"
    assert body["user"]["profile"] is None


def test_login_email_is_case_and_whitespace_insensitive(anonymous_client: TestClient) -> None:
    assert attempt(anonymous_client, f"  {EMPLOYEE_EMAIL.upper()} ", DEMO_PASSWORD).status_code == 200


def test_wrong_password_and_unknown_email_get_the_same_answer(anonymous_client: TestClient) -> None:
    wrong_password = attempt(anonymous_client, EMPLOYEE_EMAIL, "not-the-password")
    unknown_email = attempt(anonymous_client, "nobody@onboardiq-demo.example", DEMO_PASSWORD)

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json() == {"detail": "Incorrect email or password."}
    assert "set-cookie" not in wrong_password.headers


@pytest.mark.parametrize(
    "payload",
    [{}, {"email": EMPLOYEE_EMAIL}, {"password": DEMO_PASSWORD}, {"email": "not-an-email", "password": "x"}, {"email": EMPLOYEE_EMAIL, "password": ""}],
)
def test_login_validates_input(anonymous_client: TestClient, payload: dict) -> None:
    assert anonymous_client.post(LOGIN, json=payload, headers=CSRF_HEADERS).status_code == 422


def test_overlong_password_is_rejected_without_hashing(anonymous_client: TestClient) -> None:
    assert attempt(anonymous_client, EMPLOYEE_EMAIL, "x" * 129).status_code == 422


def test_login_requires_the_request_verification_header(anonymous_client: TestClient) -> None:
    response = attempt(anonymous_client, EMPLOYEE_EMAIL, DEMO_PASSWORD, headers={})
    assert response.status_code == 403
    assert "set-cookie" not in response.headers


def test_login_cannot_choose_a_role(anonymous_client: TestClient) -> None:
    response = anonymous_client.post(LOGIN, json={"email": EMPLOYEE_EMAIL, "password": DEMO_PASSWORD, "role": "hr"}, headers=CSRF_HEADERS)
    assert response.json()["user"]["role"] == "employee"
    assert anonymous_client.get("/api/v1/hr/summary").status_code == 403


def test_inactive_users_cannot_sign_in(anonymous_client: TestClient) -> None:
    def deactivate(session):  # noqa: ANN001
        session.scalars(select(UserRecord).where(UserRecord.email == EMPLOYEE_EMAIL)).one().is_active = False

    with_session(anonymous_client, deactivate)
    assert attempt(anonymous_client, EMPLOYEE_EMAIL, DEMO_PASSWORD).status_code == 401


def test_successful_login_records_last_login(anonymous_client: TestClient) -> None:
    login(anonymous_client, EMPLOYEE_EMAIL)
    with anonymous_client.app.state.session_factory() as session:
        assert session.scalars(select(UserRecord).where(UserRecord.email == EMPLOYEE_EMAIL)).one().last_login_at is not None


# ---- Brute-force protection ----


def test_repeated_failures_are_rate_limited(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url, login_max_failed_attempts=3))) as client:
        for _ in range(3):
            assert attempt(client, EMPLOYEE_EMAIL, "wrong-password").status_code == 401

        blocked = attempt(client, EMPLOYEE_EMAIL, DEMO_PASSWORD)  # even the right password is refused while locked
        assert blocked.status_code == 429
        assert int(blocked.headers["retry-after"]) > 0
        assert "Too many failed sign-in attempts" in blocked.json()["detail"]

        assert attempt(client, HR_EMAIL, DEMO_PASSWORD).status_code == 200  # other accounts are unaffected


def test_successful_login_resets_the_failure_count(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url, login_max_failed_attempts=3))) as client:
        for _ in range(2):
            attempt(client, EMPLOYEE_EMAIL, "wrong-password")
        assert attempt(client, EMPLOYEE_EMAIL, DEMO_PASSWORD).status_code == 200
        for _ in range(2):
            assert attempt(client, EMPLOYEE_EMAIL, "wrong-password").status_code == 401
        assert attempt(client, EMPLOYEE_EMAIL, DEMO_PASSWORD).status_code == 200


# ---- Session ----


def test_me_returns_the_signed_in_user(anonymous_client: TestClient) -> None:
    login(anonymous_client, EMPLOYEE_EMAIL)
    response = anonymous_client.get(ME)
    assert response.status_code == 200
    assert response.json()["email"] == EMPLOYEE_EMAIL
    assert "passwordHash" not in response.text and "password" not in response.json()


def test_me_without_a_session_is_401(anonymous_client: TestClient) -> None:
    response = anonymous_client.get(ME)
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated. Please sign in."
    assert response.headers["www-authenticate"] == "Bearer"


def test_bearer_tokens_work_for_api_clients(anonymous_client: TestClient) -> None:
    app = anonymous_client.app
    with app.state.session_factory() as session:
        user = session.scalars(select(UserRecord).where(UserRecord.email == EMPLOYEE_EMAIL)).one()
    token, _ = create_access_token(user_id=user.id, role="employee", secret=app.state.jwt_secret, expires_minutes=5)
    headers = {"Authorization": f"Bearer {token}"}

    assert anonymous_client.get(ME, headers=headers).json()["email"] == EMPLOYEE_EMAIL
    # Bearer requests can't be forged cross-site, so they don't need the verification header.
    assert anonymous_client.patch("/api/v1/onboarding/tasks/goals", json={"status": "in_progress"}, headers=headers).status_code == 200


@pytest.mark.parametrize("header", ["Basic abc", "Bearer", "Bearer   ", "token"])
def test_malformed_authorization_headers_are_401(anonymous_client: TestClient, header: str) -> None:
    assert anonymous_client.get(ME, headers={"Authorization": header}).status_code == 401


def _forged(app, **changes) -> str:  # noqa: ANN001
    now = datetime.now(timezone.utc)
    claims = {"sub": "2", "role": "employee", "iss": TOKEN_ISSUER, "iat": now, "nbf": now, "exp": now + timedelta(minutes=5)}
    claims.update(changes)
    secret = changes.pop("_secret", None) or app.state.jwt_secret
    claims.pop("_secret", None)
    return jwt.encode(claims, secret, algorithm="HS256")


def _user_id(app, email: str) -> str:  # noqa: ANN001
    with app.state.session_factory() as session:
        return str(session.scalars(select(UserRecord.id).where(UserRecord.email == email)).one())


@pytest.mark.parametrize(
    "case",
    ["expired", "wrong_secret", "wrong_issuer", "missing_role", "tampered", "alg_none", "not_a_jwt", "unknown_user"],
)
def test_invalid_tokens_are_rejected(anonymous_client: TestClient, case: str) -> None:
    app = anonymous_client.app
    sub = _user_id(app, EMPLOYEE_EMAIL)
    past = datetime.now(timezone.utc) - timedelta(hours=2)
    tokens = {
        "expired": lambda: _forged(app, sub=sub, iat=past, nbf=past, exp=past + timedelta(minutes=5)),
        "wrong_secret": lambda: _forged(app, sub=sub, _secret="another-secret-that-is-long-enough-1234567890"),
        "wrong_issuer": lambda: _forged(app, sub=sub, iss="someone-else"),
        "missing_role": lambda: jwt.encode(
            {"sub": sub, "iss": TOKEN_ISSUER, "iat": datetime.now(timezone.utc), "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
            app.state.jwt_secret,
            algorithm="HS256",
        ),
        "tampered": lambda: _forged(app, sub=sub)[:-3] + "abc",
        "alg_none": lambda: jwt.encode({"sub": sub, "role": "hr", "iss": TOKEN_ISSUER, "iat": 0, "exp": 9_999_999_999}, None, algorithm="none"),
        "not_a_jwt": lambda: "definitely-not-a-token",
        "unknown_user": lambda: _forged(app, sub="999999"),
    }
    response = anonymous_client.get(ME, headers={"Authorization": f"Bearer {tokens[case]()}"})
    assert response.status_code == 401


def test_forged_role_claim_cannot_escalate_privileges(anonymous_client: TestClient) -> None:
    """Even a correctly signed token claiming 'hr' for an employee account is refused: the database role is authoritative."""
    app = anonymous_client.app
    token = _forged(app, sub=_user_id(app, EMPLOYEE_EMAIL), role="hr")
    response = anonymous_client.get("/api/v1/hr/summary", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_deactivating_a_user_ends_their_session_immediately(anonymous_client: TestClient) -> None:
    login(anonymous_client, EMPLOYEE_EMAIL)
    assert anonymous_client.get(ME).status_code == 200

    def deactivate(session):  # noqa: ANN001
        session.scalars(select(UserRecord).where(UserRecord.email == EMPLOYEE_EMAIL)).one().is_active = False

    with_session(anonymous_client, deactivate)
    assert anonymous_client.get(ME).status_code == 401


def test_session_cookie_expires_with_the_configured_lifetime(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url, access_token_expire_minutes=30))) as client:
        response = attempt(client, EMPLOYEE_EMAIL, DEMO_PASSWORD)
        assert "Max-Age=1800" in response.headers["set-cookie"]
        expires = datetime.fromisoformat(response.json()["expiresAt"])
        assert timedelta(minutes=29) < expires - datetime.now(timezone.utc) <= timedelta(minutes=30)


def test_secure_cookie_flag_follows_settings(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url, cookie_secure=True))) as client:
        assert "Secure" in attempt(client, EMPLOYEE_EMAIL, DEMO_PASSWORD).headers["set-cookie"]


# ---- Logout ----


def test_logout_clears_the_session_cookie(anonymous_client: TestClient) -> None:
    login(anonymous_client, EMPLOYEE_EMAIL)
    response = anonymous_client.post(LOGOUT, headers=CSRF_HEADERS)

    assert response.status_code == 204
    assert f'{COOKIE}=""' in response.headers["set-cookie"] or "Max-Age=0" in response.headers["set-cookie"]
    assert anonymous_client.get(ME).status_code == 401
    assert anonymous_client.get("/api/v1/onboarding/tasks").status_code == 401


def test_logout_without_a_session_is_harmless(anonymous_client: TestClient) -> None:
    assert anonymous_client.post(LOGOUT, headers=CSRF_HEADERS).status_code == 204


def test_logout_requires_the_request_verification_header(anonymous_client: TestClient) -> None:
    login(anonymous_client, EMPLOYEE_EMAIL)
    assert anonymous_client.post(LOGOUT).status_code == 403
    assert anonymous_client.get(ME).status_code == 200
