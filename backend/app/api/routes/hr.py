"""HR-only onboarding analytics. Every route requires the HR role (403 for employees, 401 when signed out)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.auth import require_roles
from app.api.dependencies import get_app_settings
from app.core.config import Settings
from app.db.session import get_db_session
from app.schemas.auth import UserRole
from app.schemas.hr import EmployeeDetailOut, EmployeeListOut, EmployeeOnboardingStatus, HrSummaryOut
from app.services.hr_service import EmployeeNotFoundError, HrAnalyticsService

router = APIRouter(prefix="/api/v1/hr", tags=["hr"], dependencies=[Depends(require_roles(UserRole.HR))])


def get_hr_service(
    session: Annotated[Session, Depends(get_db_session)], settings: Annotated[Settings, Depends(get_app_settings)]
) -> HrAnalyticsService:
    return HrAnalyticsService(session, settings.today())


Service = Annotated[HrAnalyticsService, Depends(get_hr_service)]


@router.get("/summary", response_model=HrSummaryOut)
def get_summary(service: Service) -> HrSummaryOut:
    """Organisation-wide onboarding totals."""
    return service.summary()


@router.get("/employees", response_model=EmployeeListOut)
def list_employees(
    service: Service,
    search: Annotated[str | None, Query(max_length=100, description="Matches name, email or job title")] = None,
    department: Annotated[str | None, Query(max_length=150)] = None,
    employee_status: Annotated[EmployeeOnboardingStatus | None, Query(alias="status")] = None,
) -> EmployeeListOut:
    """Employees with their checklist progress, those needing attention first."""
    return service.list_employees(search=search, department=department, status=employee_status)


@router.get("/employees/{employee_id}", response_model=EmployeeDetailOut)
def get_employee(employee_id: int, service: Service) -> EmployeeDetailOut:
    """One employee's profile, progress and task statuses."""
    try:
        return service.employee_detail(employee_id)
    except EmployeeNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.") from error
