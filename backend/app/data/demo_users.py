"""Fictional demo accounts and how far along each employee's checklist is.

All names and details are invented for demonstration. Each employee has a job role, and their checklist is
generated from that role's task templates (see task_catalog), with due dates relative to their start date.
"""

from dataclasses import dataclass
from datetime import date

from app.data.job_roles import JobRole
from app.data.task_catalog import GeneratedTask, build_role_checklist, prerequisites_for
from app.services.work_calendar import WorkCalendar
from app.schemas.onboarding import TaskStatus

DEMO_EMAIL_DOMAIN = "onboardiq-demo.example"  # reserved .example domain: never deliverable


@dataclass(frozen=True)
class DemoHrUser:
    email: str
    full_name: str


@dataclass(frozen=True)
class DemoEmployee:
    first_name: str
    last_name: str
    job_title: str
    department: str
    location: str
    start_date: date
    manager_name: str
    buddy_name: str | None
    job_role: JobRole
    # Demo progress: the first N tasks (by due date) are completed and the next one is in progress.
    completed_tasks: int

    @property
    def email(self) -> str:
        return f"{self.first_name}.{self.last_name}@{DEMO_EMAIL_DOMAIN}".lower()

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


DEMO_HR_USERS = [DemoHrUser(email=f"kavya.rao@{DEMO_EMAIL_DOMAIN}", full_name="Kavya Rao")]

PRIMARY_DEMO_EMPLOYEE = DemoEmployee(
    "Shreya", "Nambiar", "Associate Software Engineer", "Product Engineering", "Bengaluru, India", date(2026, 11, 2), "Priya Nair", "Rohan Das",
    JobRole.SOFTWARE_DEVELOPER, 7,
)  # fmt: skip

DEMO_EMPLOYEES = [
    PRIMARY_DEMO_EMPLOYEE,
    DemoEmployee("Daniel", "Okafor", "Sales Associate", "Sales", "Bengaluru, India", date(2026, 11, 2), "Nisha Menon", "Arun Pillai", JobRole.SALES, 4),
    DemoEmployee("Karthik", "Raman", "DevOps Engineer", "Platform Engineering", "Chennai, India", date(2026, 11, 2), "Priya Nair", "Rohan Das", JobRole.SOFTWARE_DEVELOPER, 6),
    DemoEmployee("Lucas", "Fernandes", "Product Designer", "Design", "Mumbai, India", date(2026, 10, 26), "Ritika Shah", None, JobRole.OTHER, 6),
    DemoEmployee("Rahul", "Verma", "Sales Development Rep", "Sales", "New Delhi, India", date(2026, 10, 12), "Vikram Joshi", "Neha Gupta", JobRole.SALES, 7),
    DemoEmployee("Sneha", "Kulkarni", "Data Analyst", "Analytics", "Pune, India", date(2026, 10, 19), "Arjun Iyer", None, JobRole.DATA_ANALYST, 9),
    DemoEmployee("Fatima", "Sheikh", "Finance Associate", "Finance", "Mumbai, India", date(2026, 9, 28), "Sanjay Kapoor", None, JobRole.FINANCE, 8),
    DemoEmployee("Meera", "Pillai", "HR Generalist", "People Operations", "Bengaluru, India", date(2026, 8, 3), "Kavya Rao", None, JobRole.HR, 10),
    DemoEmployee("Ananya", "Bose", "Machine Learning Engineer", "AI & Data Science", "Hyderabad, India", date(2026, 11, 16), "Priya Nair", None, JobRole.AI_ML_ENGINEER, 0),
]


def build_employee_tasks(employee: DemoEmployee, calendar: WorkCalendar | None = None) -> list[GeneratedTask]:
    """
    The employee's role checklist with demo progress applied (pre-boarding tasks keep their real due dates).
    The first N tasks are completed in due-date order, skipping any whose prerequisites aren't done yet, so demo
    progress never breaks a task dependency.
    """
    generated = build_role_checklist(employee.job_role, employee.start_date, clamp_to_start=False, calendar=calendar)
    order = {g.task.id: index for index, g in enumerate(generated)}
    by_action = {g.action_key: g.task.id for g in generated}
    remaining = sorted(generated, key=lambda g: (g.task.due_date, order[g.task.id]))
    completed: set[str] = set()
    target = min(employee.completed_tasks, len(generated))
    while len(completed) < target:
        ready = next(
            g for g in remaining
            if g.task.id not in completed and all(by_action.get(p) in completed or p not in by_action for p in prerequisites_for(g.action_key))
        )  # fmt: skip
        completed.add(ready.task.id)
    statuses = {task_id: TaskStatus.COMPLETED for task_id in completed}
    if 0 < target < len(generated):
        nxt = next(
            g for g in remaining
            if g.task.id not in completed and all(by_action.get(p) in completed or p not in by_action for p in prerequisites_for(g.action_key))
        )  # fmt: skip
        statuses[nxt.task.id] = TaskStatus.IN_PROGRESS
    return [GeneratedTask(g.task.model_copy(update={"status": statuses.get(g.task.id, TaskStatus.PENDING)}), g.action_key) for g in generated]
