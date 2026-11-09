"""Sample onboarding checklist for the demo employee.

The tasks are fictional examples for demonstration only. They are loaded into
the in-memory repository at startup and will move to PostgreSQL in a later phase.
"""

from datetime import date

from app.schemas.onboarding import OnboardingStage as Stage
from app.schemas.onboarding import OnboardingTask
from app.schemas.onboarding import TaskCategory as Category
from app.schemas.onboarding import TaskPriority as Priority
from app.schemas.onboarding import TaskStatus as Status

# The template's due dates assume this start date; each employee's checklist is shifted to their own start date.
TEMPLATE_START_DATE = date(2026, 11, 2)


def _task(task_id: str, stage: Stage, title: str, description: str, category: Category, due: date, priority: Priority, status: Status) -> OnboardingTask:
    return OnboardingTask(id=task_id, stage=stage, title=title, description=description, category=category, due_date=due, priority=priority, status=status)


def build_seed_tasks() -> list[OnboardingTask]:
    """Returns a fresh copy of the sample checklist (new objects on every call)."""
    return [
        # Welcome
        _task("t1", Stage.WELCOME, "Complete HR orientation", "Join the half-day HR orientation covering company values, structure, policies and how teams work together.", Category.ORIENTATION, date(2026, 11, 3), Priority.HIGH, Status.COMPLETED),
        _task("t2", Stage.WELCOME, "Complete IT setup", "Collect your laptop and access badge from the IT help desk and sign in to your company accounts.", Category.IT_SETUP, date(2026, 11, 2), Priority.HIGH, Status.COMPLETED),
        _task("t3", Stage.WELCOME, "Configure VPN and multi-factor authentication", "Install the VPN client and enrol your phone for multi-factor authentication.", Category.IT_SETUP, date(2026, 11, 3), Priority.HIGH, Status.COMPLETED),
        _task("t4", Stage.WELCOME, "Meet your onboarding buddy", "Have an informal introduction with your assigned onboarding buddy, Rohan Das.", Category.TEAM, date(2026, 11, 4), Priority.LOW, Status.COMPLETED),
        # Documentation
        _task("t5", Stage.DOCUMENTATION, "Sign offer letter and NDA", "Review and e-sign your offer letter and non-disclosure agreement in the HR portal.", Category.DOCUMENTS, date(2026, 10, 28), Priority.HIGH, Status.COMPLETED),
        _task("t6", Stage.DOCUMENTATION, "Complete personal information", "Fill in your legal name, address, date of birth and contact details in your employee profile.", Category.HR_FORMS, date(2026, 10, 30), Priority.HIGH, Status.COMPLETED),
        _task("t7", Stage.DOCUMENTATION, "Upload identity documents", "Upload a government-issued photo ID and proof of address for identity verification.", Category.DOCUMENTS, date(2026, 10, 30), Priority.MEDIUM, Status.COMPLETED),
        _task("t8", Stage.DOCUMENTATION, "Review company policies", "Read the Code of Conduct and Employee Handbook, then confirm you understand them.", Category.COMPLIANCE, date(2026, 11, 5), Priority.MEDIUM, Status.COMPLETED),
        _task("t9", Stage.DOCUMENTATION, "Submit emergency contact details", "Add at least one emergency contact to your employee profile.", Category.HR_FORMS, date(2026, 11, 5), Priority.MEDIUM, Status.PENDING),
        # Payroll & Benefits
        _task("t10", Stage.PAYROLL_BENEFITS, "Set up payroll information", "Add your salary bank account details so your first salary can be paid on time.", Category.PAYROLL, date(2026, 11, 1), Priority.HIGH, Status.COMPLETED),
        _task("t11", Stage.PAYROLL_BENEFITS, "Submit tax declaration form", "Choose your tax regime and declare planned investments so payroll can calculate deductions correctly.", Category.PAYROLL, date(2026, 10, 30), Priority.HIGH, Status.COMPLETED),
        _task("t12", Stage.PAYROLL_BENEFITS, "Enroll in health insurance plan", "Choose a health plan and add dependents before the enrollment window closes.", Category.BENEFITS, date(2026, 11, 10), Priority.HIGH, Status.PENDING),
        # Training
        _task("t13", Stage.TRAINING, "Complete Information Security training", "Finish the 45-minute security awareness course and pass the final quiz (80% required).", Category.LEARNING, date(2026, 11, 9), Priority.HIGH, Status.IN_PROGRESS),
        _task("t14", Stage.TRAINING, "Acknowledge Leave & Attendance Policy", "Read the Leave & Attendance Policy and record your acknowledgement.", Category.COMPLIANCE, date(2026, 11, 11), Priority.MEDIUM, Status.PENDING),
        _task("t15", Stage.TRAINING, "Complete POSH awareness module", "Complete the mandatory Prevention of Sexual Harassment (POSH) awareness module.", Category.LEARNING, date(2026, 11, 14), Priority.MEDIUM, Status.PENDING),
        # Ready to Go
        _task("t16", Stage.READY_TO_GO, "Set 30-day goals with your manager", "Agree on three to five goals for your first month in a 1:1 with your manager.", Category.TEAM, date(2026, 11, 20), Priority.LOW, Status.PENDING),
        _task("t17", Stage.READY_TO_GO, "Complete your first code review cycle", "Submit a pull request and complete a full review cycle with your team.", Category.TEAM, date(2026, 12, 15), Priority.MEDIUM, Status.PENDING),
        _task("t18", Stage.READY_TO_GO, "Submit probation self-assessment", "Reflect on your first 90 days and submit the self-assessment form ahead of your review.", Category.HR_FORMS, date(2027, 1, 29), Priority.MEDIUM, Status.PENDING),
    ]
