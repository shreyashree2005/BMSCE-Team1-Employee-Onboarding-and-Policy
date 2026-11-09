"""Database persistence, seeding and error-handling tests."""

from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateTable

from app.services.onboarding_repository import TASK_RECORD_FIELDS
from app.core.security import create_access_token, verify_password
from app.data.demo_users import DEMO_EMPLOYEES, DEMO_HR_USERS, PRIMARY_DEMO_EMPLOYEE, build_employee_tasks
from app.data.onboarding_seed import build_seed_tasks
from app.data.task_catalog import LEGACY_ACTION_KEYS
from app.db import init_db
from app.db.init_db import backfill_task_actions, count_onboarding_tasks, seed_demo_data
from app.db.models import EmployeeProfileRecord, OnboardingTaskRecord, UserRecord
from app.db.session import create_db_engine, create_session_factory
from app.main import create_app
from app.schemas.auth import UserRole
from app.schemas.onboarding import OnboardingStage, TaskCategory, TaskStatus
from app.services.onboarding_repository import SqlAlchemyTaskRepository, TaskNotFoundError
from tests.conftest import CSRF_HEADERS, DEMO_PASSWORD, EMPLOYEE_EMAIL, SignedInClient, make_settings

PRIMARY_COUNT = len(build_employee_tasks(PRIMARY_DEMO_EMPLOYEE))
DEMO_USER_COUNT = len(DEMO_HR_USERS) + len(DEMO_EMPLOYEES)
ALL_DEMO_TASKS = sum(len(build_employee_tasks(e)) for e in DEMO_EMPLOYEES)
EMERGENCY_CONTACT = {"name": "Anil Nambiar", "relationship": "Parent", "phone": "+91 98450 12345"}


def employee_id(session: Session, email: str = EMPLOYEE_EMAIL) -> int:
    return session.scalars(select(UserRecord.id).where(UserRecord.email == email)).one()


def seed(session: Session) -> int:
    """Seeds demo data and returns the primary demo employee's user ID."""
    seed_demo_data(session, DEMO_PASSWORD)
    return employee_id(session)


def user_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(UserRecord)) or 0


def add_legacy_checklist(session: Session, user_id: int, statuses: dict[str, TaskStatus] | None = None) -> None:
    """The original fixed 18-task checklist, without actions (as stored before task actions existed)."""
    for task in build_seed_tasks():
        status = (statuses or {}).get(task.id, TaskStatus.PENDING)
        session.add(OnboardingTaskRecord(employee_id=user_id, task_key=task.id, **task.model_dump(include=TASK_RECORD_FIELDS - {"status"}), status=status))
    session.commit()


# ---- Seeding ----


def test_seed_inserts_demo_users_and_role_checklists_into_empty_database(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        report = seed_demo_data(session, DEMO_PASSWORD)
        assert report.users_created == DEMO_USER_COUNT == 10
        assert report.tasks_created == ALL_DEMO_TASKS
        assert count_onboarding_tasks(session, employee_id(session)) == PRIMARY_COUNT == 13
        assert count_onboarding_tasks(session) == ALL_DEMO_TASKS


def test_demo_checklist_sizes_depend_on_job_role(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        seed_demo_data(session, DEMO_PASSWORD)
        sizes = {e.job_role: count_onboarding_tasks(session, employee_id(session, e.email)) for e in DEMO_EMPLOYEES}
        assert len(set(sizes.values())) > 1, "different roles get different numbers of tasks"
        assert 18 not in sizes.values()
        profile = session.get(UserRecord, employee_id(session)).profile
        assert profile.job_role == "software_developer"
        assert all(t.action_key for t in session.scalars(select(OnboardingTaskRecord)))


def test_seeded_passwords_are_hashed_never_plaintext(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        seed_demo_data(session, DEMO_PASSWORD)
        for user in session.scalars(select(UserRecord)):
            assert DEMO_PASSWORD not in user.password_hash
            assert user.password_hash.startswith("scrypt$")
            assert verify_password(DEMO_PASSWORD, user.password_hash)


def test_seed_is_idempotent(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        seed_demo_data(session, DEMO_PASSWORD)
    with session_factory() as session:
        report = seed_demo_data(session, DEMO_PASSWORD)
        assert (report.users_created, report.tasks_created, report.passwords_set, report.checklists_upgraded) == (0, 0, 0, 0)
        assert user_count(session) == DEMO_USER_COUNT
        assert count_onboarding_tasks(session) == ALL_DEMO_TASKS


def test_seed_never_overwrites_task_updates_or_passwords(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user_id = seed(session)
        SqlAlchemyTaskRepository(session, user_id).update_status("goals", TaskStatus.IN_PROGRESS)
        original_hash = session.get(UserRecord, user_id).password_hash

    with session_factory() as session:
        seed_demo_data(session, "a-different-password")
        assert SqlAlchemyTaskRepository(session, user_id).get_task("goals").status == TaskStatus.IN_PROGRESS
        assert session.get(UserRecord, user_id).password_hash == original_hash


def test_seed_skips_employees_who_already_have_tasks(session_factory: sessionmaker[Session]) -> None:
    template = build_employee_tasks(PRIMARY_DEMO_EMPLOYEE)[0]
    with session_factory() as session:
        user = UserRecord(email=EMPLOYEE_EMAIL, full_name="Shreya Nambiar", password_hash="!unusable", role=UserRole.EMPLOYEE)
        session.add(user)
        session.flush()
        session.add(OnboardingTaskRecord(employee_id=user.id, task_key="custom-1", action_key="profile", **template.task.model_dump(include=TASK_RECORD_FIELDS)))
        session.commit()

    with session_factory() as session:
        report = seed_demo_data(session, DEMO_PASSWORD)
        assert report.passwords_set == 1  # the unusable password was replaced by the demo password
        assert [task.id for task in SqlAlchemyTaskRepository(session, employee_id(session)).list_tasks()] == ["custom-1"]
        assert user_count(session) == DEMO_USER_COUNT  # no duplicate account for the existing email


def test_demo_employees_on_the_old_fixed_checklist_move_to_role_checklists(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user = UserRecord(email=EMPLOYEE_EMAIL, full_name="Shreya Nambiar", password_hash="!unusable", role=UserRole.EMPLOYEE)
        session.add(user)
        session.flush()
        add_legacy_checklist(session, user.id)

    with session_factory() as session:
        report = seed_demo_data(session, DEMO_PASSWORD)
        assert report.checklists_upgraded == 1
        keys = {t.id for t in SqlAlchemyTaskRepository(session, employee_id(session)).list_tasks()}
        assert keys == {g.task.id for g in build_employee_tasks(PRIMARY_DEMO_EMPLOYEE)}


def test_real_accounts_keep_their_legacy_checklist_and_get_actions(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user = UserRecord(email="real.person@example.com", full_name="Real Person", password_hash="scrypt$x", role=UserRole.EMPLOYEE)
        session.add(user)
        session.flush()
        add_legacy_checklist(session, user.id, {"t1": TaskStatus.COMPLETED, "t2": TaskStatus.IN_PROGRESS})
        real_id = user.id

    with session_factory() as session:
        seed_demo_data(session, DEMO_PASSWORD)
        assert backfill_task_actions(session) == 18
        tasks = {t.id: t for t in SqlAlchemyTaskRepository(session, real_id).list_tasks()}
        assert len(tasks) == 18  # nothing deleted
        assert tasks["t1"].status == TaskStatus.COMPLETED and tasks["t2"].status == TaskStatus.IN_PROGRESS  # progress kept
        assert all(t.action_type for t in tasks.values())
        records = session.scalars(select(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == real_id))
        assert {r.task_key: r.action_key for r in records} == LEGACY_ACTION_KEYS


def test_seed_tolerates_concurrent_seeding(session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch) -> None:
    """If another process inserts the rows between our check and insert, seeding backs off cleanly."""
    with session_factory() as session:
        seed_demo_data(session, DEMO_PASSWORD)

    monkeypatch.setattr(init_db, "count_onboarding_tasks", lambda _session, _employee_id=None: 0)
    with session_factory() as session:
        report = seed_demo_data(session, DEMO_PASSWORD)  # duplicate keys -> IntegrityError -> rolled back
        assert report.tasks_created == 0

    with session_factory() as session:
        assert count_onboarding_tasks(session) == ALL_DEMO_TASKS


def test_employee_profiles_are_linked_to_users(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        seed_demo_data(session, DEMO_PASSWORD)
        user = session.get(UserRecord, employee_id(session))
        assert user.profile is not None
        assert user.profile.job_title == PRIMARY_DEMO_EMPLOYEE.job_title
        hr = session.scalars(select(UserRecord).where(UserRecord.email == DEMO_HR_USERS[0].email)).one()
        assert hr.profile is None  # HR accounts don't have an onboarding profile


def test_deleting_a_user_removes_their_profile_and_tasks(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user_id = seed(session)
        session.delete(session.get(UserRecord, user_id))
        session.commit()
    with session_factory() as session:
        assert count_onboarding_tasks(session, user_id) == 0
        assert session.scalar(select(func.count()).select_from(EmployeeProfileRecord).where(EmployeeProfileRecord.user_id == user_id)) == 0
        assert count_onboarding_tasks(session) == ALL_DEMO_TASKS - PRIMARY_COUNT  # other employees untouched


# ---- Repository persistence ----


def test_updates_persist_across_sessions(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user_id = seed(session)
        SqlAlchemyTaskRepository(session, user_id).update_status("goals", TaskStatus.IN_PROGRESS)

    with session_factory() as fresh_session:
        assert SqlAlchemyTaskRepository(fresh_session, user_id).get_task("goals").status == TaskStatus.IN_PROGRESS


def test_updates_persist_across_engine_recreation(database_url: str) -> None:
    """Simulates a server restart: a brand-new engine reads what the previous one wrote."""
    first_engine = create_db_engine(database_url)
    init_db.create_tables(first_engine)
    with create_session_factory(first_engine)() as session:
        user_id = seed(session)
        SqlAlchemyTaskRepository(session, user_id).update_status("security_training", TaskStatus.COMPLETED)
    first_engine.dispose()

    second_engine = create_db_engine(database_url)
    with create_session_factory(second_engine)() as session:
        repository = SqlAlchemyTaskRepository(session, user_id)
        task = repository.get_task("security_training")
        assert task.status == TaskStatus.COMPLETED and task.completed_at is not None
        assert len(repository.list_tasks()) == PRIMARY_COUNT
    second_engine.dispose()


def test_repository_round_trips_every_field(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        stored = {task.id: task for task in SqlAlchemyTaskRepository(session, seed(session)).list_tasks()}

    # Derived fields (dependencies, catalog order, timing) are computed on read, not stored as given.
    exclude = {"updated_at", "completed_at", "action_type", "depends_on", "sequence", "first_started_at", "active_since", "time_spent_seconds"}
    for original in build_employee_tasks(PRIMARY_DEMO_EMPLOYEE):
        assert stored[original.task.id].model_dump(exclude=exclude) == original.task.model_dump(exclude=exclude)
        assert stored[original.task.id].updated_at is not None
        assert stored[original.task.id].action_type is not None


def test_repository_filters_in_sql(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        repository = SqlAlchemyTaskRepository(session, seed(session))

        assert {t.id for t in repository.list_tasks(category=TaskCategory.PAYROLL)} == {"bank_details"}
        assert {t.id for t in repository.list_tasks(status=TaskStatus.IN_PROGRESS)} == {"emergency_contact"}
        assert {t.id for t in repository.list_tasks(stage=OnboardingStage.TRAINING, status=TaskStatus.PENDING)} == {"company_policies", "security_training"}


def test_repository_is_scoped_to_one_employee(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        shreya = seed(session)
        meera = employee_id(session, next(e for e in DEMO_EMPLOYEES if e.first_name == "Meera").email)
        SqlAlchemyTaskRepository(session, shreya).update_status("profile", TaskStatus.PENDING)

        # The same task key belongs to each employee separately.
        assert SqlAlchemyTaskRepository(session, meera).get_task("profile").status == TaskStatus.COMPLETED
        assert SqlAlchemyTaskRepository(session, shreya).get_task("profile").status == TaskStatus.PENDING
        assert len(SqlAlchemyTaskRepository(session, shreya).list_tasks()) == PRIMARY_COUNT


def test_repository_raises_for_unknown_task(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        repository = SqlAlchemyTaskRepository(session, seed(session))
        with pytest.raises(TaskNotFoundError):
            repository.get_task("missing")
        with pytest.raises(TaskNotFoundError):
            repository.update_status("missing", TaskStatus.COMPLETED)
        with pytest.raises(TaskNotFoundError):  # a user with no checklist
            SqlAlchemyTaskRepository(session, 999_999).get_task("profile")


def test_audit_timestamps_are_recorded(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user_id = seed(session)
        SqlAlchemyTaskRepository(session, user_id).update_status("goals", TaskStatus.IN_PROGRESS)

    with session_factory() as session:
        record = session.scalars(
            select(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == user_id, OnboardingTaskRecord.task_key == "goals")
        ).one()
        assert record.created_at is not None
        assert record.updated_at is not None


# ---- Application lifecycle ----


def test_api_updates_survive_application_restart(database_url: str) -> None:
    settings = make_settings(database_url)

    with SignedInClient(create_app(settings), EMPLOYEE_EMAIL) as first_run:
        response = first_run.post("/api/v1/onboarding/tasks/emergency_contact/action", json={"values": EMERGENCY_CONTACT})
        assert response.status_code == 200

    with SignedInClient(create_app(settings), EMPLOYEE_EMAIL) as second_run:
        tasks = second_run.get("/api/v1/onboarding/tasks").json()
        assert len(tasks) == PRIMARY_COUNT, "restart must not duplicate seed data"
        assert next(t for t in tasks if t["id"] == "emergency_contact")["status"] == "completed"
        assert second_run.get("/api/v1/onboarding/progress").json()["completedTasks"] == 8
        saved = second_run.get("/api/v1/onboarding/tasks/emergency_contact/action").json()["values"]
        assert saved["name"] == EMERGENCY_CONTACT["name"]


def test_sessions_survive_application_restart(database_url: str) -> None:
    """The development signing secret is persisted, so a browser session stays valid after an API restart."""
    settings = make_settings(database_url)
    with SignedInClient(create_app(settings), EMPLOYEE_EMAIL) as first_run:
        cookies = dict(first_run.cookies)

    with TestClient(create_app(settings), cookies=cookies) as second_run:
        assert second_run.get("/api/v1/auth/me").json()["email"] == EMPLOYEE_EMAIL


def test_startup_migrates_and_seeds(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url))):
        pass  # entering the client runs the startup hook

    engine = create_db_engine(database_url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert {"onboarding_tasks", "users", "employee_profiles", "alembic_version", "task_progress", "task_documents", "bank_details", "emergency_contacts", "password_reset_tokens"} <= tables
        with create_session_factory(engine)() as session:
            assert count_onboarding_tasks(session, employee_id(session)) == PRIMARY_COUNT
            assert user_count(session) == DEMO_USER_COUNT
    finally:
        engine.dispose()


def test_seeding_can_be_disabled(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url, seed_demo_data=False))) as client:
        response = client.post("/api/v1/auth/login", json={"email": EMPLOYEE_EMAIL, "password": DEMO_PASSWORD}, headers=CSRF_HEADERS)
        assert response.status_code == 401  # no demo accounts exist

    engine = create_db_engine(database_url)
    try:
        with create_session_factory(engine)() as session:
            assert user_count(session) == 0
            assert count_onboarding_tasks(session) == 0
    finally:
        engine.dispose()


def test_database_failure_returns_503_without_leaking_details(tmp_path: Path) -> None:
    # A directory can't be opened as a SQLite database, so every query fails.
    broken_url = f"sqlite:///{tmp_path.as_posix()}"
    app = create_app(make_settings(broken_url))
    client = TestClient(app, raise_server_exceptions=False)  # no startup on purpose
    # A validly signed token, so the request reaches the database (loading the user) and fails there.
    token, _ = create_access_token(user_id=1, role="employee", secret=app.state.jwt_secret, expires_minutes=5)

    response = client.get("/api/v1/onboarding/tasks", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 503
    body = response.json()
    assert body == {"detail": "The database is temporarily unavailable. Please try again shortly."}
    assert "sqlite" not in response.text.lower()


# ---- PostgreSQL compatibility ----


def test_schema_compiles_for_postgresql() -> None:
    ddl = str(CreateTable(OnboardingTaskRecord.__table__).compile(dialect=postgresql.dialect()))

    assert "CREATE TABLE onboarding_tasks" in ddl
    assert "CONSTRAINT task_status CHECK" in ddl
    assert "'in_progress'" in ddl and "'Payroll & Benefits'" in ddl
    assert "UNIQUE (employee_id, task_key)" in ddl
    users_ddl = str(CreateTable(UserRecord.__table__).compile(dialect=postgresql.dialect()))
    assert "CREATE TABLE users" in users_ddl and "UNIQUE (email)" in users_ddl


def test_postgresql_engine_uses_psycopg_driver() -> None:
    engine = create_db_engine("postgresql+psycopg://user:secret@localhost:5432/onboardiq")
    try:
        assert engine.dialect.name == "postgresql"
        assert engine.dialect.driver == "psycopg"
    finally:
        engine.dispose()


def test_reference_date_is_respected() -> None:
    assert make_settings("sqlite://").today() == date(2026, 11, 7)
