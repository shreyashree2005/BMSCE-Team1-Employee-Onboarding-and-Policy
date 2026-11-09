"""Shared fixtures. Every test gets its own SQLite database file and policy storage folder, so tests never share data."""

from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import DEFAULT_DEMO_PASSWORD, Settings
from app.data.demo_users import DEMO_HR_USERS, PRIMARY_DEMO_EMPLOYEE
from app.db.init_db import create_tables
from app.db.session import create_db_engine, create_session_factory
from app.main import create_app

REFERENCE_DATE = date(2026, 11, 7)

DEMO_PASSWORD = DEFAULT_DEMO_PASSWORD
EMPLOYEE_EMAIL = PRIMARY_DEMO_EMPLOYEE.email
HR_EMAIL = DEMO_HR_USERS[0].email
# The web app sends this on every request; the API requires it for cookie-authenticated changes (CSRF defence).
CSRF_HEADERS = {"X-Requested-With": "OnboardIQ"}


def login(client: TestClient, email: str = EMPLOYEE_EMAIL, password: str = DEMO_PASSWORD) -> dict:
    """Signs the client in (the session cookie is kept by the client) and returns the session JSON."""
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password}, headers=CSRF_HEADERS)
    assert response.status_code == 200, response.text
    return response.json()


class SignedInClient(TestClient):
    """A TestClient that runs startup, then signs in as ``email`` and sends the CSRF header like the web app."""

    def __init__(self, app, email: str = HR_EMAIL, **kwargs: object) -> None:  # noqa: ANN001
        super().__init__(app, headers=CSRF_HEADERS, **kwargs)
        self._email = email

    def __enter__(self) -> "SignedInClient":
        super().__enter__()
        login(self, self._email)
        return self


def make_settings(database_url: str, *, seed_demo_data: bool = True, **overrides: object) -> Settings:
    """Test settings: fixed 'today', deterministic hashing embeddings (no model download) and storage next to the test database."""
    database_path = database_url.removeprefix("sqlite:///")
    storage_dir = Path(database_path).parent / "policies" if database_path and database_path != database_url else Path(".pytest-policies")
    values: dict[str, object] = {
        "database_url": database_url,
        "reference_date": REFERENCE_DATE,
        "seed_demo_data": seed_demo_data,
        "embedding_provider": "hashing",
        "policy_storage_dir": storage_dir,
        "employee_documents_dir": storage_dir.parent / "employee-documents",
        "mail_outbox_dir": storage_dir.parent / "outbox",
        "profile_photos_dir": storage_dir.parent / "profile-photos",
        "helpdesk_attachments_dir": storage_dir.parent / "helpdesk",
        "policy_chunk_size": 400,
        "policy_chunk_overlap": 80,
        # Never pick up a real key from the developer's environment/.env: tests must not call a real LLM.
        "llm_api_key": None,
        "llm_base_url": "http://llm.invalid/v1",
        # No background model loading in tests.
        "warm_up_models": False,
        # Hashing embeddings score differently from MiniLM, so use thresholds suited to them.
        "rag_min_relevance": 0.15,
        "rag_strong_relevance": 0.40,
    }
    values.update(overrides)
    # _env_file=None: tests never read the developer's backend/.env (e.g. a local LLM configuration).
    return Settings(_env_file=None, **values)  # type: ignore[arg-type,call-arg]


@pytest.fixture
def database_url(tmp_path: Path) -> str:
    return f"sqlite:///{(tmp_path / 'onboardiq-test.db').as_posix()}"


@pytest.fixture
def client(database_url: str) -> Iterator[TestClient]:
    """API client for an app with its own database (startup migrates + seeds), signed in as the demo employee."""
    with SignedInClient(create_app(make_settings(database_url)), EMPLOYEE_EMAIL) as test_client:
        yield test_client


@pytest.fixture
def hr_client(database_url: str) -> Iterator[TestClient]:
    with SignedInClient(create_app(make_settings(database_url)), HR_EMAIL) as test_client:
        yield test_client


@pytest.fixture
def anonymous_client(database_url: str) -> Iterator[TestClient]:
    with TestClient(create_app(make_settings(database_url))) as test_client:
        yield test_client


@pytest.fixture
def engine(database_url: str) -> Iterator[Engine]:
    engine = create_db_engine(database_url)
    create_tables(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return create_session_factory(engine)
