"""Pydantic models for the employee onboarding module.

JSON uses camelCase field names (e.g. ``dueDate``) to match the frontend's
TypeScript types; Python code uses snake_case attributes.
"""

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskCategory(str, Enum):
    DOCUMENTS = "Documents"
    PAYROLL = "Payroll"
    IT_SETUP = "IT Setup"
    ORIENTATION = "Orientation"
    TEAM = "Team"
    COMPLIANCE = "Compliance"
    BENEFITS = "Benefits"
    HR_FORMS = "HR Forms"
    LEARNING = "Learning"


class OnboardingStage(str, Enum):
    """Journey stages, in the order an employee moves through them."""

    WELCOME = "Welcome"
    DOCUMENTATION = "Documentation"
    PAYROLL_BENEFITS = "Payroll & Benefits"
    TRAINING = "Training"
    READY_TO_GO = "Ready to Go"


class StageStatus(str, Enum):
    COMPLETED = "completed"
    CURRENT = "current"
    UPCOMING = "upcoming"


class OnboardingTask(CamelModel):
    id: str = Field(min_length=1)
    stage: OnboardingStage
    title: str = Field(min_length=1, max_length=200)
    description: str
    category: TaskCategory
    due_date: date
    priority: TaskPriority
    status: TaskStatus
    # When the task last changed (added in Phase 3.4; optional so seed/template tasks without it still validate).
    updated_at: datetime | None = None
    # What completes the task (form, document_upload, checklist, policy_acknowledgment, training or quiz).
    action_type: str | None = None
    completed_at: datetime | None = None
    # IDs of tasks that must be completed before this one can be started or completed.
    depends_on: list[str] = Field(default_factory=list)
    # Recommended order within the catalog (lower first); breaks ties when choosing the next task.
    sequence: int = 0
    # Time tracking (server timestamps): when the task was first started, when the current active period began
    # (null while paused/pending/completed), and the total active time so far.
    first_started_at: datetime | None = None
    active_since: datetime | None = None
    time_spent_seconds: int | None = None


class TaskStatusUpdate(CamelModel):
    status: TaskStatus


class StageProgress(CamelModel):
    name: OnboardingStage
    completed_tasks: int
    total_tasks: int
    status: StageStatus


class CategoryProgress(CamelModel):
    category: TaskCategory
    completed_tasks: int
    total_tasks: int


class OnboardingProgress(CamelModel):
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    pending_tasks: int
    overdue_tasks: int
    completion_percentage: int = Field(ge=0, le=100)
    reference_date: date
    stages: list[StageProgress]
    categories: list[CategoryProgress]


class CalendarDay(CamelModel):
    date: date
    # "working", "weekly_off", "company_holiday" or "festival_holiday"
    day_type: str
    holiday_name: str | None = None
    # IDs of tasks due on this day (any status).
    task_ids: list[str] = Field(default_factory=list)
    # Short heading for the day, e.g. "Sunday — Weekly Holiday", "2 tasks scheduled", "All tasks completed".
    title: str = ""
    # Why there's nothing to do (null while tasks are still open), and where onboarding continues.
    reason: str | None = None
    # Extra context for an empty working day (tasks are spread across working days).
    note: str | None = None
    next_working_day: date | None = None
    next_activity_date: date | None = None


class OnboardingCalendar(CamelModel):
    today: date
    weekly_off_days: list[str]
    days: list[CalendarDay]
