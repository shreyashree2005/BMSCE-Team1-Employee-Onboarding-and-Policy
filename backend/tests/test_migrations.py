"""Alembic migrations: fresh databases, upgrading pre-authentication databases without data loss, and model sync."""

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import Engine, inspect, select, text

from app.data.demo_users import DEMO_EMPLOYEES
from app.data.demo_users import PRIMARY_DEMO_EMPLOYEE, build_employee_tasks
from app.data.onboarding_seed import build_seed_tasks
from app.data.task_catalog import LEGACY_ACTION_KEYS
from app.db.base import Base
from app.db.init_db import alembic_config, migrate_database
from app.db.models import OnboardingTaskRecord, UserRecord
from app.db.session import create_db_engine, create_session_factory
from app.main import create_app
from tests.conftest import EMPLOYEE_EMAIL, SignedInClient, make_settings


def upgrade_to(engine: Engine, revision: str) -> None:
    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, revision)


def create_legacy_database(database_url: str, *, with_alembic_version: bool) -> Engine:
    """A Phase 2.2-3.3 database: one global checklist keyed by task ID, with some progress made."""
    engine = create_db_engine(database_url)
    upgrade_to(engine, "0001")
    with engine.begin() as connection:
        for task in build_seed_tasks():
            values = task.model_dump(mode="json", exclude={"updated_at"})  # enums are stored by value
            connection.execute(
                text(
                    "INSERT INTO onboarding_tasks (id, stage, title, description, category, due_date, priority, status) "
                    "VALUES (:id, :stage, :title, :description, :category, :due_date, :priority, :status)"
                ),
                values,
            )
        connection.execute(text("UPDATE onboarding_tasks SET status = 'completed' WHERE id = 't14'"))  # progress to preserve
        if not with_alembic_version:
            connection.execute(text("DROP TABLE alembic_version"))  # databases created by create_all before Alembic
    return engine


def legacy_statuses(engine: Engine) -> dict[str, str]:
    with engine.connect() as connection:
        return dict(connection.execute(text("SELECT id, status FROM onboarding_tasks")).all())


def test_fresh_database_migrates_to_head_and_is_idempotent(database_url: str) -> None:
    engine = create_db_engine(database_url)
    try:
        migrate_database(engine)
        migrate_database(engine)  # second run is a no-op
        tables = set(inspect(engine).get_table_names())
        assert {"users", "employee_profiles", "onboarding_tasks", "policy_documents", "policy_chunks", "alembic_version"} <= tables
        assert {"task_progress", "task_documents", "emergency_contacts", "bank_details", "password_reset_tokens"} <= tables
        with engine.connect() as connection:
            assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0004"
    finally:
        engine.dispose()


def test_models_and_migrations_are_in_sync(database_url: str) -> None:
    engine = create_db_engine(database_url)
    try:
        migrate_database(engine)
        with engine.connect() as connection:
            diff = compare_metadata(MigrationContext.configure(connection, opts={"compare_type": True}), Base.metadata)
        assert diff == []
    finally:
        engine.dispose()


def _assert_legacy_progress_preserved(database_url: str, before: dict[str, str]) -> None:
    engine = create_db_engine(database_url)
    try:
        with create_session_factory(engine)() as session:
            shreya = session.scalars(select(UserRecord).where(UserRecord.email == EMPLOYEE_EMAIL)).one()
            rows = session.scalars(select(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == shreya.id)).all()
            assert {row.task_key: row.status.value for row in rows} == before
            assert {row.task_key: row.action_key for row in rows} == LEGACY_ACTION_KEYS  # every legacy task got its action
            assert shreya.profile is not None
            assert len(session.scalars(select(OnboardingTaskRecord)).all()) == 18
    finally:
        engine.dispose()


def test_upgrade_preserves_existing_checklist_progress(database_url: str) -> None:
    """Without demo seeding (as for real accounts), the migrated checklist and its progress are kept as they are."""
    legacy = create_legacy_database(database_url, with_alembic_version=True)
    before = legacy_statuses(legacy)
    legacy.dispose()
    assert before["t14"] == "completed"

    with TestClient(create_app(make_settings(database_url, seed_demo_data=False))):
        pass

    _assert_legacy_progress_preserved(database_url, before)


def test_upgraded_demo_account_moves_to_its_role_checklist(database_url: str) -> None:
    create_legacy_database(database_url, with_alembic_version=True).dispose()

    # Startup migrates; demo seeding gives the migrated demo account the demo password and its role-based checklist.
    with SignedInClient(create_app(make_settings(database_url)), EMPLOYEE_EMAIL) as client:
        tasks = {t["id"] for t in client.get("/api/v1/onboarding/tasks").json()}
    assert tasks == {g.task.id for g in build_employee_tasks(PRIMARY_DEMO_EMPLOYEE)}


def test_pre_alembic_databases_are_adopted(database_url: str) -> None:
    legacy = create_legacy_database(database_url, with_alembic_version=False)
    before = legacy_statuses(legacy)
    legacy.dispose()

    with TestClient(create_app(make_settings(database_url, seed_demo_data=False))):
        pass
    with TestClient(create_app(make_settings(database_url, seed_demo_data=False))):  # restarting must not duplicate anything
        pass

    _assert_legacy_progress_preserved(database_url, before)


def test_downgrade_restores_the_previous_schema(database_url: str) -> None:
    legacy = create_legacy_database(database_url, with_alembic_version=True)
    before = legacy_statuses(legacy)
    migrate_database(legacy)

    config = alembic_config()
    with legacy.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0001")
    try:
        assert "users" not in inspect(legacy).get_table_names()
        assert legacy_statuses(legacy) == before
    finally:
        legacy.dispose()
