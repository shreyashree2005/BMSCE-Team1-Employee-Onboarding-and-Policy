"""Business rules for onboarding progress, kept free of HTTP concerns so they are easy to test."""

from collections.abc import Iterable
from datetime import date, timedelta

from app.schemas.onboarding import (
    CalendarDay,
    CategoryProgress,
    OnboardingCalendar,
    OnboardingProgress,
    OnboardingStage,
    OnboardingTask,
    StageProgress,
    StageStatus,
    TaskCategory,
    TaskStatus,
)
from app.services.work_calendar import DayType, WorkCalendar


def is_overdue(task: OnboardingTask, today: date) -> bool:
    return task.status != TaskStatus.COMPLETED and task.due_date < today


def sort_tasks(tasks: Iterable[OnboardingTask]) -> list[OnboardingTask]:
    """Stable order for API responses: journey stage, then due date."""
    stage_order = {stage: index for index, stage in enumerate(OnboardingStage)}
    return sorted(tasks, key=lambda task: (stage_order[task.stage], task.due_date, task.id))


def stage_progress(tasks: list[OnboardingTask]) -> list[StageProgress]:
    """The first stage with open tasks is "current"; later incomplete stages are "upcoming"."""
    result: list[StageProgress] = []
    current_assigned = False
    for stage in OnboardingStage:
        stage_tasks = [task for task in tasks if task.stage == stage]
        completed = sum(task.status == TaskStatus.COMPLETED for task in stage_tasks)
        status = StageStatus.COMPLETED
        if completed < len(stage_tasks):
            status = StageStatus.UPCOMING if current_assigned else StageStatus.CURRENT
            current_assigned = True
        result.append(StageProgress(name=stage, completed_tasks=completed, total_tasks=len(stage_tasks), status=status))
    return result


def category_progress(tasks: list[OnboardingTask]) -> list[CategoryProgress]:
    result: list[CategoryProgress] = []
    for category in TaskCategory:
        category_tasks = [task for task in tasks if task.category == category]
        if category_tasks:
            completed = sum(task.status == TaskStatus.COMPLETED for task in category_tasks)
            result.append(CategoryProgress(category=category, completed_tasks=completed, total_tasks=len(category_tasks)))
    return result


def calculate_progress(tasks: list[OnboardingTask], today: date) -> OnboardingProgress:
    total = len(tasks)
    completed = sum(task.status == TaskStatus.COMPLETED for task in tasks)
    in_progress = sum(task.status == TaskStatus.IN_PROGRESS for task in tasks)
    return OnboardingProgress(
        total_tasks=total,
        completed_tasks=completed,
        in_progress_tasks=in_progress,
        pending_tasks=total - completed - in_progress,
        overdue_tasks=sum(is_overdue(task, today) for task in tasks),
        completion_percentage=round(completed / total * 100) if total else 0,
        reference_date=today,
        stages=stage_progress(tasks),
        categories=category_progress(tasks),
    )


def _long_date(day: date) -> str:
    return f"{day:%A}, {day:%B} {day.day}"


def describe_day(day: date, today: date, tasks: list[OnboardingTask], calendar: WorkCalendar) -> CalendarDay:
    """
    One calendar day: its type (working day, weekly day off, company or festival holiday), the tasks due, a short
    title, and, when nothing is left to do, a plain-language explanation with where onboarding continues.
    Holidays and days off come only from the configured calendar; an empty working day is never given an
    invented reason, only "No onboarding tasks are scheduled for this date".
    """
    due = [t for t in tasks if t.due_date == day]
    open_due = [t for t in due if t.status != TaskStatus.COMPLETED]
    day_type = calendar.day_type(day)
    holiday = calendar.holiday(day)
    is_today = day == today
    upcoming = sorted({t.due_date for t in tasks if t.status != TaskStatus.COMPLETED and t.due_date > day})
    next_activity = upcoming[0] if upcoming else None
    next_working = calendar.next_working_day(day)

    def continuation() -> str:
        """Where onboarding continues after this day."""
        if next_activity is not None:
            if day_type != DayType.WORKING and next_activity == next_working:
                return f" Your next onboarding activity is scheduled for the next working day, {_long_date(next_activity)}."
            return f" Your next assigned activity is on {_long_date(next_activity)}."
        if day_type != DayType.WORKING:
            return f" The next working day is {_long_date(next_working)}."
        return " You have no more onboarding tasks scheduled after this date."

    reason: str | None = None
    note: str | None = None
    if open_due:
        title = f"{len(open_due)} task{'s' if len(open_due) != 1 else ''} scheduled"
    elif due:
        title = "All tasks completed"
        reason = "You've completed all the onboarding tasks scheduled for this date." + continuation()
    elif day_type == DayType.WEEKLY_OFF:
        title = f"{day:%A} — Weekly Holiday"
        reason = f"No onboarding activities are scheduled {'today' if is_today else 'on this date'} because {day:%A} is a weekly holiday." + continuation()
    elif day_type in (DayType.COMPANY_HOLIDAY, DayType.FESTIVAL_HOLIDAY):
        kind = "company" if day_type == DayType.COMPANY_HOLIDAY else "festival"
        title = f"{kind.capitalize()} Holiday — {holiday.name}"
        reason = f"{'Today is' if is_today else 'This date is'} a {kind} holiday: {holiday.name}." + continuation()
    else:
        title = "No tasks scheduled"
        reason = "No onboarding tasks are scheduled for this date." + continuation()
        if next_activity is not None:
            note = "Onboarding tasks are spread across your working days, so some days have nothing due."
    return CalendarDay(
        date=day,
        day_type=day_type.value,
        holiday_name=holiday.name if holiday else None,
        task_ids=[t.id for t in due],
        title=title,
        reason=reason,
        note=note,
        next_working_day=next_working,
        next_activity_date=next_activity,
    )


def build_calendar(tasks: list[OnboardingTask], calendar: WorkCalendar, today: date, days: int = 15) -> OnboardingCalendar:
    return OnboardingCalendar(
        today=today,
        weekly_off_days=calendar.weekly_off_names,
        days=[describe_day(today + timedelta(days=offset), today, tasks, calendar) for offset in range(days)],
    )
