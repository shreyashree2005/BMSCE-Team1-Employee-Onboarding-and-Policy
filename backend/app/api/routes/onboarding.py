"""Employee onboarding endpoints.

Employee-only: every route acts on the signed-in employee's own checklist (HR users get 403, signed-out
requests 401). The repository is bound to the authenticated user, so no parameter can reach another
employee's tasks; another employee's task ID simply isn't found.

Tasks are completed through their action (``/tasks/{id}/action``), never by setting the status directly.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.auth import EmployeeUser, get_task_repository
from app.api.dependencies import get_app_settings
from app.core.config import Settings
from app.db.session import get_db_session
from app.schemas.onboarding import (
    OnboardingCalendar,
    OnboardingProgress,
    OnboardingStage,
    OnboardingTask,
    TaskCategory,
    TaskStatus,
    TaskStatusUpdate,
)
from app.schemas.task_actions import TaskActionState, TaskActionSubmission
from app.services.onboarding_repository import TaskNotFoundError, TaskRepository, prerequisite_message
from app.services.onboarding_service import build_calendar, calculate_progress, sort_tasks
from app.services.task_actions import TaskActionService

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])

Repository = Annotated[TaskRepository, Depends(get_task_repository)]


def _not_found(error: TaskNotFoundError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))


def get_task_action_service(
    request: Request,
    user: EmployeeUser,
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> TaskActionService:
    return TaskActionService(session, user, settings, request.app.state.data_cipher)


Actions = Annotated[TaskActionService, Depends(get_task_action_service)]


@router.get("/tasks", response_model=list[OnboardingTask])
def list_tasks(
    repository: Repository,
    task_status: Annotated[TaskStatus | None, Query(alias="status")] = None,
    category: TaskCategory | None = None,
    stage: OnboardingStage | None = None,
) -> list[OnboardingTask]:
    """Lists checklist tasks, optionally filtered by status, category and/or journey stage."""
    return sort_tasks(repository.list_tasks(status=task_status, category=category, stage=stage))


@router.get("/tasks/{task_id}", response_model=OnboardingTask)
def get_task(task_id: str, repository: Repository) -> OnboardingTask:
    try:
        return repository.get_task(task_id)
    except TaskNotFoundError as error:
        raise _not_found(error) from error


@router.patch("/tasks/{task_id}", response_model=OnboardingTask)
def update_task_status(task_id: str, update: TaskStatusUpdate, repository: Repository) -> OnboardingTask:
    """
    Starts a task (``in_progress``), pauses or reopens it (``pending``). Tasks with an action can only be completed
    by finishing that action (409 otherwise), so a task is never marked complete without the work being done.
    A task can't be started before its prerequisite tasks are complete (409). Time spent is tracked server-side.
    """
    try:
        task = repository.get_task(task_id)
        if update.status == TaskStatus.COMPLETED and task.status != TaskStatus.COMPLETED and task.action_type is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Open the task and finish its steps to complete it.",
            )
        if update.status != TaskStatus.PENDING and task.status != TaskStatus.COMPLETED:
            blocking = repository.blocking_prerequisites(task_id)
            if blocking:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=prerequisite_message(blocking))
        return repository.update_status(task_id, update.status)
    except TaskNotFoundError as error:
        raise _not_found(error) from error


@router.get("/progress", response_model=OnboardingProgress)
def get_progress(repository: Repository, settings: Annotated[Settings, Depends(get_app_settings)]) -> OnboardingProgress:
    """Overall, per-stage and per-category completion for the checklist."""
    return calculate_progress(repository.list_tasks(), settings.today())


@router.get("/calendar", response_model=OnboardingCalendar)
def get_calendar(
    request: Request,
    repository: Repository,
    settings: Annotated[Settings, Depends(get_app_settings)],
    days: Annotated[int, Query(ge=1, le=60)] = 15,
) -> OnboardingCalendar:
    """The next ``days`` days from today: tasks due each day, and why a day has none (weekend, holiday, nothing due)."""
    return build_calendar(repository.list_tasks(), request.app.state.work_calendar, settings.today(), days)


# ---- Task actions ----


@router.get("/tasks/{task_id}/action", response_model=TaskActionState)
def get_task_action(task_id: str, actions: Actions) -> TaskActionState:
    """What the task asks you to do (form fields, documents, checklist, policies, training or quiz) and your progress."""
    try:
        return actions.state(task_id)
    except TaskNotFoundError as error:
        raise _not_found(error) from error


@router.post("/tasks/{task_id}/action", response_model=TaskActionState)
def submit_task_action(task_id: str, submission: TaskActionSubmission, actions: Actions) -> TaskActionState:
    """Saves progress or completes the task. The server validates everything; invalid input returns 422 with field errors."""
    try:
        return actions.submit(task_id, submission)
    except TaskNotFoundError as error:
        raise _not_found(error) from error


@router.post("/tasks/{task_id}/documents", response_model=TaskActionState, status_code=status.HTTP_201_CREATED)
async def upload_task_document(
    task_id: str,
    actions: Actions,
    settings: Annotated[Settings, Depends(get_app_settings)],
    document_type: Annotated[str, Form(alias="documentType", max_length=64)],
    file: Annotated[UploadFile, File(description="PDF, JPG or PNG")],
) -> TaskActionState:
    """Uploads (or replaces) one required document for a document task."""
    content = await file.read(settings.employee_document_max_bytes + 1)
    try:
        return actions.upload_document(task_id, document_type, file.filename or "document", content)
    except TaskNotFoundError as error:
        raise _not_found(error) from error


@router.delete("/tasks/{task_id}/documents/{document_id}", response_model=TaskActionState)
def delete_task_document(task_id: str, document_id: int, actions: Actions) -> TaskActionState:
    try:
        return actions.delete_document(task_id, document_id)
    except TaskNotFoundError as error:
        raise _not_found(error) from error


@router.get("/tasks/{task_id}/documents/{document_id}/file")
def download_task_document(task_id: str, document_id: int, actions: Actions) -> FileResponse:
    """Your own uploaded file (other employees' files are never reachable: lookups are scoped to you)."""
    try:
        stored = actions.document_file(task_id, document_id)
    except TaskNotFoundError as error:
        raise _not_found(error) from error
    return FileResponse(
        stored.path,
        media_type=stored.content_type,
        filename=stored.filename,
        content_disposition_type="inline",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )

