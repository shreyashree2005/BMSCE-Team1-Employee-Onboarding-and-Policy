"""Database migrations and demo-data seeding."""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, is_usable_password_hash
from app.services.onboarding_repository import TASK_RECORD_FIELDS
from app.services.work_calendar import WorkCalendar
from app.data.demo_users import DEMO_EMPLOYEES, DEMO_HR_USERS, build_employee_tasks
from app.data.task_catalog import LEGACY_ACTION_KEYS, GeneratedTask
from app.db import models  # noqa: F401  (registers ORM models on Base.metadata)
from app.db.base import Base
from app.db.models import EmployeeProfileRecord, OnboardingTaskRecord, UserRecord
from app.schemas.auth import UserRole
from app.schemas.onboarding import TaskStatus

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    return config


def migrate_database(engine: Engine) -> None:
    """Applies pending Alembic migrations (creating the schema on an empty database, adopting pre-Alembic ones)."""
    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def create_tables(engine: Engine) -> None:
    """Creates tables straight from the models (used by unit tests that don't need migrations)."""
    Base.metadata.create_all(engine)


@dataclass
class SeedReport:
    users_created: int = 0
    tasks_created: int = 0
    passwords_set: int = 0
    checklists_upgraded: int = 0


@lru_cache(maxsize=4)
def _demo_password_hash(password: str) -> str:
    # Demo accounts share one password, so one hash per process keeps startup fast (each real user gets their own salt).
    return hash_password(password)


def count_onboarding_tasks(session: Session, employee_id: int | None = None) -> int:
    query = select(func.count()).select_from(OnboardingTaskRecord)
    if employee_id is not None:
        query = query.where(OnboardingTaskRecord.employee_id == employee_id)
    return session.scalar(query) or 0


def _add_tasks(session: Session, employee_id: int, generated: list[GeneratedTask]) -> None:
    session.add_all(
        OnboardingTaskRecord(
            employee_id=employee_id,
            task_key=g.task.id,
            action_key=g.action_key,
            completed_at=datetime.now(timezone.utc) if g.task.status == TaskStatus.COMPLETED else None,
            **g.task.model_dump(include=TASK_RECORD_FIELDS),
        )
        for g in generated
    )


def backfill_task_actions(session: Session) -> int:
    """Gives tasks from the original fixed checklist (t1-t18) their action, so every existing task is actionable."""
    updated = 0
    for record in session.scalars(select(OnboardingTaskRecord).where(OnboardingTaskRecord.action_key.is_(None))):
        action_key = LEGACY_ACTION_KEYS.get(record.task_key)
        if action_key:
            record.action_key = action_key
            updated += 1
    if updated:
        session.commit()
        logger.info("Assigned actions to %d existing onboarding task(s).", updated)
    return updated


def _has_legacy_checklist(session: Session, employee_id: int) -> bool:
    keys = session.scalars(select(OnboardingTaskRecord.task_key).where(OnboardingTaskRecord.employee_id == employee_id)).all()
    return bool(keys) and all(key in LEGACY_ACTION_KEYS for key in keys)


def seed_demo_data(session: Session, demo_password: str, calendar: WorkCalendar | None = None) -> SeedReport:
    """
    Creates any missing demo accounts and gives demo employees their job-role checklist.

    Existing users, passwords and real employees' tasks are never changed. The only exceptions: accounts created by
    the 0002 migration with an unusable password receive the demo password, and *fictional demo employees* whose
    checklist is still the original fixed 18-task template are moved to their role-based checklist.
    """
    report = SeedReport()
    existing = {user.email: user for user in session.scalars(select(UserRecord))}

    for hr in DEMO_HR_USERS:
        user = existing.get(hr.email)
        if user is None:
            session.add(UserRecord(email=hr.email, full_name=hr.full_name, password_hash=_demo_password_hash(demo_password), role=UserRole.HR))
            report.users_created += 1
        elif not is_usable_password_hash(user.password_hash):
            user.password_hash = _demo_password_hash(demo_password)
            report.passwords_set += 1

    for employee in DEMO_EMPLOYEES:
        user = existing.get(employee.email)
        if user is None:
            user = UserRecord(email=employee.email, full_name=employee.full_name, password_hash=_demo_password_hash(demo_password), role=UserRole.EMPLOYEE)
            user.profile = EmployeeProfileRecord(
                first_name=employee.first_name,
                last_name=employee.last_name,
                job_title=employee.job_title,
                department=employee.department,
                location=employee.location,
                start_date=employee.start_date,
                manager_name=employee.manager_name,
                buddy_name=employee.buddy_name,
                job_role=employee.job_role.value,
            )
            session.add(user)
            session.flush()
            report.users_created += 1
        else:
            if not is_usable_password_hash(user.password_hash):
                user.password_hash = _demo_password_hash(demo_password)
                report.passwords_set += 1
            if user.profile is not None and user.profile.job_role is None:
                user.profile.job_role = employee.job_role.value
                user.profile.job_title = employee.job_title
                user.profile.department = employee.department

        if _has_legacy_checklist(session, user.id):
            session.execute(delete(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == user.id))
            session.flush()
            report.checklists_upgraded += 1
        if count_onboarding_tasks(session, user.id) == 0:
            tasks = build_employee_tasks(employee, calendar)
            _add_tasks(session, user.id, tasks)
            report.tasks_created += len(tasks)

    try:
        session.commit()
    except IntegrityError:
        # Another process seeded at the same time (e.g. several workers starting together); its data wins.
        session.rollback()
        logger.info("Demo data was seeded concurrently by another process; skipping.")
        return SeedReport()
    if report.users_created or report.tasks_created or report.passwords_set or report.checklists_upgraded:
        logger.info(
            "Seeded demo data: %d users, %d tasks, %d passwords set, %d demo checklists moved to role-based tasks.",
            report.users_created, report.tasks_created, report.passwords_set, report.checklists_upgraded,
        )
    return report


def initialize_database(
    engine: Engine, session: Session, *, seed_demo_data_enabled: bool, demo_password: str, calendar: WorkCalendar | None = None
) -> None:
    migrate_database(engine)
    backfill_task_actions(session)
    if seed_demo_data_enabled:
        seed_demo_data(session, demo_password, calendar)
