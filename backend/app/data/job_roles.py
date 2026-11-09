"""Job roles employees choose at sign-up. A job role shapes the onboarding checklist; it never grants access rights
(the "hr" job role is an employee working in HR, not an HR dashboard user)."""

from enum import Enum


class JobRole(str, Enum):
    SOFTWARE_DEVELOPER = "software_developer"
    AI_ML_ENGINEER = "ai_ml_engineer"
    DATA_ANALYST = "data_analyst"
    HR = "hr"
    FINANCE = "finance"
    SALES = "sales"
    MARKETING = "marketing"
    INTERN = "intern"
    OTHER = "other"


JOB_ROLE_LABELS: dict[JobRole, str] = {
    JobRole.SOFTWARE_DEVELOPER: "Software Developer",
    JobRole.AI_ML_ENGINEER: "AI/ML Engineer",
    JobRole.DATA_ANALYST: "Data Analyst",
    JobRole.HR: "HR",
    JobRole.FINANCE: "Finance",
    JobRole.SALES: "Sales",
    JobRole.MARKETING: "Marketing",
    JobRole.INTERN: "Intern",
    JobRole.OTHER: "Other",
}

# Default department for self-registered employees (HR can change it later).
JOB_ROLE_DEPARTMENTS: dict[JobRole, str] = {
    JobRole.SOFTWARE_DEVELOPER: "Engineering",
    JobRole.AI_ML_ENGINEER: "AI & Data Science",
    JobRole.DATA_ANALYST: "Analytics",
    JobRole.HR: "People Operations",
    JobRole.FINANCE: "Finance",
    JobRole.SALES: "Sales",
    JobRole.MARKETING: "Marketing",
    JobRole.INTERN: "Internship Program",
    JobRole.OTHER: "Unassigned",
}


def job_role_label(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return JOB_ROLE_LABELS[JobRole(value)]
    except ValueError:
        return None
