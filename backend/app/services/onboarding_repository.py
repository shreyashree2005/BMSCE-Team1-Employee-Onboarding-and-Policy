"""Storage for onboarding tasks.

``TaskRepository`` is the interface the API depends on; ``SqlAlchemyTaskRepository`` implements it on top
of a SQLAlchemy session (PostgreSQL or SQLite). Every repository is bound to one employee: all reads and
writes are filtered by ``employee_id``, so one employee can never see or change another's tasks. Task IDs in
the API (``profile``, ``t9``...) are the per-employee ``task_key``.
"""

from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.task_catalog import action_for, prerequisites_for, sequence_for
from app.db.models import OnboardingTaskRecord
from app.schemas.onboarding import OnboardingStage, OnboardingTask, TaskCategory, TaskStatus


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: str) -> None:
        super().__init__(f"Onboarding task '{task_id}' was not found")
        self.task_id = task_id


class TaskRepository(Protocol):
    def list_tasks(
        self,
        status: TaskStatus | None = None,
        category: TaskCategory | None = None,
        stage: OnboardingStage | None = None,
    ) -> list[OnboardingTask]: ...

    def get_task(self, task_id: str) -> OnboardingTask: ...

    def update_status(self, task_id: str, status: TaskStatus) -> OnboardingTask: ...

    def blocking_prerequisites(self, task_id: str) -> list[OnboardingTaskRecord]: ...


def _utc(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)  # SQLite returns UTC timestamps without a zone
    return value


# OnboardingTask fields that are stored as columns when tasks are created (the rest are derived).
TASK_RECORD_FIELDS = {"stage", "title", "description", "category", "due_date", "priority", "status"}


def to_task_schema(record: OnboardingTaskRecord, depends_on: list[str] | None = None) -> OnboardingTask:
    action = action_for(record.action_key)
    started = record.first_started_at is not None
    return OnboardingTask(
        id=record.task_key,
        stage=record.stage,
        title=record.title,
        description=record.description,
        category=record.category,
        due_date=record.due_date,
        priority=record.priority,
        status=record.status,
        updated_at=_utc(record.updated_at),
        action_type=action.type.value if action else None,
        completed_at=_utc(record.completed_at),
        depends_on=depends_on or [],
        sequence=sequence_for(record.action_key),
        first_started_at=_utc(record.first_started_at),
        active_since=_utc(record.started_at),
        time_spent_seconds=(record.time_spent_seconds or 0) if started else None,
    )


def set_record_status(record: OnboardingTaskRecord, status: TaskStatus, now: datetime | None = None) -> None:
    """
    Applies a status change, keeping ``completed_at`` and the time tracking consistent with it.

    Time is counted only while a task is in progress: starting opens an active period, and pausing (back to
    pending), completing or reopening closes it and adds it to ``time_spent_seconds``. A reopened task keeps its
    earlier time, so the total reflects all the work done on it.
    """
    now = now or datetime.now(timezone.utc)
    if status == TaskStatus.IN_PROGRESS:
        if record.started_at is None:
            record.started_at = now
        if record.first_started_at is None:
            record.first_started_at = now
    elif record.started_at is not None:
        elapsed = int((now - _utc(record.started_at)).total_seconds())
        record.time_spent_seconds = (record.time_spent_seconds or 0) + max(elapsed, 0)
        record.started_at = None
    record.status = status
    record.completed_at = now if status == TaskStatus.COMPLETED else None


def dependency_map(records: list[OnboardingTaskRecord]) -> dict[str, list[str]]:
    """Task key -> keys of its prerequisite tasks, among the employee's own tasks (absent prerequisites are ignored)."""
    by_action: dict[str, str] = {}
    for record in records:
        if record.action_key:
            by_action.setdefault(record.action_key, record.task_key)
    return {
        record.task_key: [by_action[p] for p in prerequisites_for(record.action_key) if p in by_action and by_action[p] != record.task_key]
        for record in records
    }


def incomplete_prerequisites(session: Session, record: OnboardingTaskRecord) -> list[OnboardingTaskRecord]:
    """The prerequisite tasks of ``record`` that the same employee hasn't completed yet."""
    needed = prerequisites_for(record.action_key)
    if not needed:
        return []
    return list(
        session.scalars(
            select(OnboardingTaskRecord).where(
                OnboardingTaskRecord.employee_id == record.employee_id,
                OnboardingTaskRecord.action_key.in_(needed),
                OnboardingTaskRecord.status != TaskStatus.COMPLETED,
                OnboardingTaskRecord.id != record.id,
            )
        )
    )


def prerequisite_message(blocking: list[OnboardingTaskRecord]) -> str:
    titles = " and ".join(f"“{r.title}”" for r in blocking)
    return f"Complete {titles} first. This task depends on it."


class SqlAlchemyTaskRepository:
    def __init__(self, session: Session, employee_id: int) -> None:
        self._session = session
        self._employee_id = employee_id

    def list_tasks(
        self,
        status: TaskStatus | None = None,
        category: TaskCategory | None = None,
        stage: OnboardingStage | None = None,
    ) -> list[OnboardingTask]:
        query = select(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == self._employee_id)
        if status is not None:
            query = query.where(OnboardingTaskRecord.status == status)
        if category is not None:
            query = query.where(OnboardingTaskRecord.category == category)
        if stage is not None:
            query = query.where(OnboardingTaskRecord.stage == stage)
        dependencies = self.dependencies()
        return [to_task_schema(record, dependencies.get(record.task_key)) for record in self._session.scalars(query)]

    def get_task(self, task_id: str) -> OnboardingTask:
        return self.schema(self.get_record(task_id))

    def update_status(self, task_id: str, status: TaskStatus) -> OnboardingTask:
        record = self.get_record(task_id)
        set_record_status(record, status)
        self._session.commit()
        self._session.refresh(record)  # load the new updated_at
        return self.schema(record)

    def blocking_prerequisites(self, task_id: str) -> list[OnboardingTaskRecord]:
        return incomplete_prerequisites(self._session, self.get_record(task_id))

    def schema(self, record: OnboardingTaskRecord) -> OnboardingTask:
        return to_task_schema(record, self.dependencies().get(record.task_key))

    def dependencies(self) -> dict[str, list[str]]:
        return dependency_map(list(self._session.scalars(select(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == self._employee_id))))

    def get_record(self, task_id: str) -> OnboardingTaskRecord:
        record = self._session.scalars(
            select(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == self._employee_id, OnboardingTaskRecord.task_key == task_id)
        ).first()
        if record is None:
            raise TaskNotFoundError(task_id)
        return record
