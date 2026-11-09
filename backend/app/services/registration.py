"""Employee self-registration: account, profile and role-based onboarding checklist, created in one transaction."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.data.job_roles import JOB_ROLE_DEPARTMENTS, JOB_ROLE_LABELS
from app.data.task_catalog import build_role_checklist
from app.services.onboarding_repository import TASK_RECORD_FIELDS
from app.services.work_calendar import WorkCalendar
from app.db.models import EmployeeProfileRecord, OnboardingTaskRecord, UserRecord
from app.schemas.auth import RegisterRequest, UserRole


class EmailAlreadyRegisteredError(Exception):
    pass


def register_employee(session: Session, request: RegisterRequest, *, start_date: date, calendar: WorkCalendar | None = None) -> UserRecord:
    """
    Creates an Employee account. The access role is fixed here, never taken from the request, so public
    registration can't create HR accounts. The *job role* chosen at sign-up only decides the checklist and the
    default job title and department. Raises EmailAlreadyRegisteredError for an existing email.
    """
    if session.scalar(select(UserRecord.id).where(UserRecord.email == request.email)) is not None:
        raise EmailAlreadyRegisteredError(request.email)

    # Set by RegisterRequest from the separate name fields (or split from fullName for older clients).
    assert request.full_name and request.first_name and request.last_name
    first_name, last_name = request.first_name, request.last_name
    user = UserRecord(
        email=request.email,
        full_name=request.full_name,
        password_hash=hash_password(request.password),
        role=UserRole.EMPLOYEE,
        is_active=True,
    )
    user.profile = EmployeeProfileRecord(
        first_name=first_name,
        last_name=last_name,
        job_title=JOB_ROLE_LABELS[request.job_role],
        department=JOB_ROLE_DEPARTMENTS[request.job_role],
        location="",
        start_date=start_date,
        manager_name=None,
        buddy_name=None,
        job_role=request.job_role.value,
    )
    session.add(user)
    try:
        session.flush()  # assigns user.id (and enforces the unique email under concurrent sign-ups)
        session.add_all(
            OnboardingTaskRecord(
                employee_id=user.id,
                task_key=generated.task.id,
                action_key=generated.action_key,
                **generated.task.model_dump(include=TASK_RECORD_FIELDS),
            )
            for generated in build_role_checklist(request.job_role, start_date, calendar=calendar)
        )
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise EmailAlreadyRegisteredError(request.email) from error
    session.refresh(user)
    return user
