"""Read-only onboarding analytics for HR, computed from the stored checklists (no cached or hardcoded figures)."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.data.job_roles import job_role_label
from app.db.models import OnboardingTaskRecord, UserRecord
from app.schemas.auth import UserRole
from app.schemas.hr import (
    STATUS_REVIEW_ORDER,
    EmployeeDetailOut,
    EmployeeListOut,
    EmployeeOnboardingStatus,
    EmployeeSummaryOut,
    HrSummaryOut,
    StatusCounts,
)
from app.schemas.onboarding import OnboardingTask, StageStatus, TaskStatus
from app.services.onboarding_repository import to_task_schema
from app.services.onboarding_service import calculate_progress, sort_tasks


class EmployeeNotFoundError(LookupError):
    pass


def onboarding_status(completed: int, total: int, overdue: int) -> EmployeeOnboardingStatus:
    if total > 0 and completed >= total:
        return EmployeeOnboardingStatus.COMPLETED
    if overdue > 0:
        return EmployeeOnboardingStatus.AT_RISK
    if completed == 0:
        return EmployeeOnboardingStatus.NOT_STARTED
    return EmployeeOnboardingStatus.ON_TRACK


@dataclass
class _Employee:
    user: UserRecord
    tasks: list[OnboardingTask]
    summary: EmployeeSummaryOut


def _summarize(user: UserRecord, tasks: list[OnboardingTask], today: date) -> EmployeeSummaryOut:
    progress = calculate_progress(tasks, today)
    current = next((stage.name for stage in progress.stages if stage.status == StageStatus.CURRENT), None)
    open_due = [task.due_date for task in tasks if task.status != TaskStatus.COMPLETED]
    activity = [task.updated_at for task in tasks if task.updated_at is not None]
    profile = user.profile
    first, _, last = user.full_name.partition(" ")
    return EmployeeSummaryOut(
        id=user.id,
        first_name=profile.first_name if profile else first,
        last_name=profile.last_name if profile else last,
        full_name=user.full_name,
        email=user.email,
        job_title=profile.job_title if profile else "",
        job_role=profile.job_role if profile else None,
        job_role_label=job_role_label(profile.job_role) if profile else None,
        department=profile.department if profile else "Unassigned",
        location=profile.location if profile else "",
        start_date=profile.start_date if profile else user.created_at.date(),
        manager_name=profile.manager_name if profile else None,
        status=onboarding_status(progress.completed_tasks, progress.total_tasks, progress.overdue_tasks),
        current_stage=current,
        total_tasks=progress.total_tasks,
        completed_tasks=progress.completed_tasks,
        in_progress_tasks=progress.in_progress_tasks,
        pending_tasks=progress.pending_tasks,
        overdue_tasks=progress.overdue_tasks,
        completion_percentage=progress.completion_percentage,
        next_due_date=min(open_due) if open_due else None,
        last_activity_at=max(activity) if activity else None,
    )


def _review_key(summary: EmployeeSummaryOut) -> tuple:
    return (STATUS_REVIEW_ORDER.index(summary.status), summary.full_name.lower())


class HrAnalyticsService:
    def __init__(self, session: Session, today: date) -> None:
        self._session = session
        self._today = today

    def _employees(self, user_id: int | None = None) -> list[_Employee]:
        users_query = select(UserRecord).where(UserRecord.role == UserRole.EMPLOYEE, UserRecord.is_active.is_(True)).options(selectinload(UserRecord.profile))
        tasks_query = select(OnboardingTaskRecord).join(UserRecord, OnboardingTaskRecord.employee_id == UserRecord.id).where(UserRecord.role == UserRole.EMPLOYEE)
        if user_id is not None:
            users_query = users_query.where(UserRecord.id == user_id)
            tasks_query = tasks_query.where(OnboardingTaskRecord.employee_id == user_id)
        tasks_by_employee: dict[int, list[OnboardingTask]] = defaultdict(list)
        for record in self._session.scalars(tasks_query):  # one query for all checklists
            tasks_by_employee[record.employee_id].append(to_task_schema(record))
        result = []
        for user in self._session.scalars(users_query):
            tasks = sort_tasks(tasks_by_employee.get(user.id, []))
            result.append(_Employee(user, tasks, _summarize(user, tasks, self._today)))
        return result

    def summary(self) -> HrSummaryOut:
        employees = [e.summary for e in self._employees()]
        counts = StatusCounts(**{status.value: sum(e.status == status for e in employees) for status in EmployeeOnboardingStatus})
        total = sum(e.total_tasks for e in employees)
        completed = sum(e.completed_tasks for e in employees)
        return HrSummaryOut(
            total_employees=len(employees),
            status_counts=counts,
            total_tasks=total,
            completed_tasks=completed,
            open_tasks=total - completed,
            in_progress_tasks=sum(e.in_progress_tasks for e in employees),
            overdue_tasks=sum(e.overdue_tasks for e in employees),
            average_completion=round(sum(e.completion_percentage for e in employees) / len(employees)) if employees else 0,
            departments=sorted({e.department for e in employees}),
            reference_date=self._today,
        )

    def list_employees(
        self, search: str | None = None, department: str | None = None, status: EmployeeOnboardingStatus | None = None
    ) -> EmployeeListOut:
        everyone = [e.summary for e in self._employees()]
        term = (search or "").strip().lower()
        scoped = [
            e
            for e in everyone
            if (not department or e.department == department)
            and (not term or term in e.full_name.lower() or term in e.email.lower() or term in e.job_title.lower())
        ]
        counts = StatusCounts(**{s.value: sum(e.status == s for e in scoped) for s in EmployeeOnboardingStatus})
        matching = [e for e in scoped if status is None or e.status == status]
        return EmployeeListOut(
            employees=sorted(matching, key=_review_key),
            status_counts=counts,
            total_matching=len(matching),
            total_employees=len(everyone),
        )

    def employee_detail(self, user_id: int) -> EmployeeDetailOut:
        employees = self._employees(user_id)
        if not employees:
            raise EmployeeNotFoundError(user_id)
        employee = employees[0]
        return EmployeeDetailOut(
            employee=employee.summary,
            buddy_name=employee.user.profile.buddy_name if employee.user.profile else None,
            progress=calculate_progress(employee.tasks, self._today),
            tasks=employee.tasks,
        )
