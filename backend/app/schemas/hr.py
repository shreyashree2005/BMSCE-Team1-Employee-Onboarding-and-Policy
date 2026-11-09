"""HR dashboard schemas (camelCase JSON).

Only what HR needs to support onboarding is exposed: work profile and checklist progress. Passwords,
login history and other account internals are never included.
"""

from datetime import date, datetime
from enum import Enum

from pydantic import Field

from app.schemas.onboarding import CamelModel, OnboardingProgress, OnboardingStage, OnboardingTask


class EmployeeOnboardingStatus(str, Enum):
    AT_RISK = "at_risk"  # has overdue tasks
    NOT_STARTED = "not_started"  # no tasks completed yet
    ON_TRACK = "on_track"
    COMPLETED = "completed"  # every task completed


# Order HR reviews employees in: those needing attention first.
STATUS_REVIEW_ORDER = [
    EmployeeOnboardingStatus.AT_RISK,
    EmployeeOnboardingStatus.NOT_STARTED,
    EmployeeOnboardingStatus.ON_TRACK,
    EmployeeOnboardingStatus.COMPLETED,
]


class EmployeeSummaryOut(CamelModel):
    id: int
    first_name: str
    last_name: str
    full_name: str
    email: str
    job_title: str
    # Job function chosen at sign-up (drives the checklist); None for accounts created before job roles existed.
    job_role: str | None = None
    job_role_label: str | None = None
    department: str
    location: str
    start_date: date
    manager_name: str | None
    status: EmployeeOnboardingStatus
    # Name of the first stage with open tasks, or None once everything is complete.
    current_stage: OnboardingStage | None
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    pending_tasks: int
    overdue_tasks: int
    completion_percentage: int = Field(ge=0, le=100)
    next_due_date: date | None
    last_activity_at: datetime | None


class StatusCounts(CamelModel):
    at_risk: int = 0
    not_started: int = 0
    on_track: int = 0
    completed: int = 0


class EmployeeListOut(CamelModel):
    employees: list[EmployeeSummaryOut]
    # Employees matching the search/department filters (before the status filter), per status: drives the filter tabs.
    status_counts: StatusCounts
    total_matching: int
    total_employees: int


class HrSummaryOut(CamelModel):
    total_employees: int
    status_counts: StatusCounts
    total_tasks: int
    completed_tasks: int
    open_tasks: int
    in_progress_tasks: int
    overdue_tasks: int
    average_completion: int = Field(ge=0, le=100)
    departments: list[str]
    reference_date: date


class EmployeeDetailOut(CamelModel):
    employee: EmployeeSummaryOut
    buddy_name: str | None
    progress: OnboardingProgress
    tasks: list[OnboardingTask]
