"""Forgot / reset password: emailed single-use links, no account enumeration, sessions signed out after a reset."""

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import PasswordResetTokenRecord, UserRecord
from app.main import create_app
from tests.conftest import CSRF_HEADERS, DEMO_PASSWORD, EMPLOYEE_EMAIL, login, make_settings

FORGOT = "/api/v1/auth/forgot-password"
VERIFY = "/api/v1/auth/reset-password/verify"
RESET = "/api/v1/auth/reset-password"
NEW_PASSWORD = "Lantern-Harbour-58"


def outbox(client: TestClient) -> list[Path]:
    folder = client.app.state.settings.mail_outbox_dir
    return sorted(folder.glob("*.eml")) if folder.exists() else []


def request_link(client: TestClient, email: str = EMPLOYEE_EMAIL) -> str:
    response = client.post(FORGOT, json={"email": email}, headers=CSRF_HEADERS)
    assert response.status_code == 202, response.text
    message = outbox(client)[-1].read_text(encoding="utf-8")
    match = re.search(r"/reset-password\?token=([A-Za-z0-9_-]{20,})", message)
    assert match, message
    return match.group(1)


def reset(client: TestClient, token: str, password: str = NEW_PASSWORD, confirm: str | None = None):
    return client.post(RESET, json={"token": token, "password": password, "confirmPassword": confirm or password}, headers=CSRF_HEADERS)


def test_full_reset_flow_changes_the_password(anonymous_client: TestClient) -> None:
    token = request_link(anonymous_client)
    message = outbox(anonymous_client)[-1].read_text(encoding="utf-8")
    assert "To: shreya.nambiar@onboardiq-demo.example" in message
    assert "http://localhost:5173/reset-password?token=" in message

    assert anonymous_client.post(VERIFY, json={"token": token}, headers=CSRF_HEADERS).json() == {"valid": True, "emailHint": "s*************@onboardiq-demo.example"}
    response = reset(anonymous_client, token)
    assert response.status_code == 200
    assert "Sign in with your new password" in response.json()["message"]

    old = anonymous_client.post("/api/v1/auth/login", json={"email": EMPLOYEE_EMAIL, "password": DEMO_PASSWORD}, headers=CSRF_HEADERS)
    assert old.status_code == 401
    assert login(anonymous_client, EMPLOYEE_EMAIL, NEW_PASSWORD)["user"]["email"] == EMPLOYEE_EMAIL


def test_unknown_emails_get_the_same_response_and_no_email(anonymous_client: TestClient) -> None:
    known = anonymous_client.post(FORGOT, json={"email": EMPLOYEE_EMAIL}, headers=CSRF_HEADERS)
    unknown = anonymous_client.post(FORGOT, json={"email": "nobody@onboardiq-demo.example"}, headers=CSRF_HEADERS)
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert len(outbox(anonymous_client)) == 1


def test_tokens_are_stored_hashed(anonymous_client: TestClient) -> None:
    token = request_link(anonymous_client)
    with anonymous_client.app.state.session_factory() as session:
        stored = session.scalars(select(PasswordResetTokenRecord)).one()
        assert token not in stored.token_hash and len(stored.token_hash) == 64


def test_links_work_once(anonymous_client: TestClient) -> None:
    token = request_link(anonymous_client)
    assert reset(anonymous_client, token).status_code == 200
    again = reset(anonymous_client, token, "Another-Harbour-91")
    assert again.status_code == 400 and "invalid or has expired" in again.json()["detail"]
    assert anonymous_client.post(VERIFY, json={"token": token}, headers=CSRF_HEADERS).json() == {"valid": False, "emailHint": None}


def test_expired_links_are_rejected(anonymous_client: TestClient) -> None:
    token = request_link(anonymous_client)
    with anonymous_client.app.state.session_factory() as session:
        record = session.scalars(select(PasswordResetTokenRecord)).one()
        record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        session.commit()
    assert reset(anonymous_client, token).status_code == 400


def test_a_new_request_invalidates_older_links(anonymous_client: TestClient) -> None:
    first = request_link(anonymous_client)
    second = request_link(anonymous_client)
    assert reset(anonymous_client, first).status_code == 400
    assert reset(anonymous_client, second).status_code == 200


def test_made_up_tokens_are_rejected(anonymous_client: TestClient) -> None:
    assert reset(anonymous_client, "x" * 43).status_code == 400
    assert anonymous_client.post(RESET, json={"token": "short", "password": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD}, headers=CSRF_HEADERS).status_code == 422


def test_new_password_must_be_strong_and_confirmed(anonymous_client: TestClient) -> None:
    token = request_link(anonymous_client)
    assert reset(anonymous_client, token, NEW_PASSWORD, "Different-Harbour-58").status_code == 422
    weak = reset(anonymous_client, token, "password123")
    assert weak.status_code == 422 and "too weak" in weak.json()["detail"]
    named = reset(anonymous_client, token, "ShreyaRocks-2026")
    assert named.status_code == 422
    assert reset(anonymous_client, token).status_code == 200  # the token survived the rejected attempts


def test_a_reset_signs_out_existing_sessions(anonymous_client: TestClient, database_url: str) -> None:
    login(anonymous_client, EMPLOYEE_EMAIL)
    assert anonymous_client.get("/api/v1/auth/me").status_code == 200

    with TestClient(create_app(make_settings(database_url))) as other_browser:
        token = request_link(other_browser)
        assert reset(other_browser, token).status_code == 200

    response = anonymous_client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "password was changed" in response.json()["detail"]
    with anonymous_client.app.state.session_factory() as session:
        assert session.scalars(select(UserRecord).where(UserRecord.email == EMPLOYEE_EMAIL)).one().session_version == 1


def test_requests_are_rate_limited(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url, password_reset_max_per_hour=2))) as client:
        for _ in range(2):
            assert client.post(FORGOT, json={"email": EMPLOYEE_EMAIL}, headers=CSRF_HEADERS).status_code == 202
        blocked = client.post(FORGOT, json={"email": EMPLOYEE_EMAIL}, headers=CSRF_HEADERS)
        assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0


def test_reset_endpoints_require_the_verification_header(anonymous_client: TestClient) -> None:
    assert anonymous_client.post(FORGOT, json={"email": EMPLOYEE_EMAIL}).status_code == 403
    assert anonymous_client.post(VERIFY, json={"token": "x" * 43}).status_code == 403
    assert anonymous_client.post(RESET, json={"token": "x" * 43, "password": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD}).status_code == 403
    assert outbox(anonymous_client) == []


def test_inactive_accounts_get_no_reset_email(anonymous_client: TestClient) -> None:
    with anonymous_client.app.state.session_factory() as session:
        session.scalars(select(UserRecord).where(UserRecord.email == EMPLOYEE_EMAIL)).one().is_active = False
        session.commit()
    assert anonymous_client.post(FORGOT, json={"email": EMPLOYEE_EMAIL}, headers=CSRF_HEADERS).status_code == 202
    assert outbox(anonymous_client) == []
