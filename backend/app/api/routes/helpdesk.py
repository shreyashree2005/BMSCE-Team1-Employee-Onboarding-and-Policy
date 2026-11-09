"""Help Desk endpoints.

Employees raise tickets and see only their own (another person's ticket ID returns 404). HR sees every ticket
and moves it through Open -> In Progress -> Resolved -> Closed. Nothing replies automatically.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.auth import EmployeeUser, HrUser
from app.db.models import UserRecord
from app.db.session import get_db_session
from app.schemas.helpdesk import TicketOut, TicketStatus, TicketStatusUpdate, TicketSummary
from app.services.helpdesk import HelpDeskService, TicketFile, to_ticket_out

router = APIRouter(prefix="/api/v1/helpdesk", tags=["helpdesk"])

DbSession = Annotated[Session, Depends(get_db_session)]


def _service(request: Request, user: UserRecord, session: Session) -> HelpDeskService:
    settings = request.app.state.settings
    return HelpDeskService(session, user, settings.helpdesk_attachments_dir, settings.helpdesk_attachment_max_bytes)



def _file_response(stored: TicketFile) -> FileResponse:
    return FileResponse(
        stored.path, media_type=stored.content_type, filename=stored.filename, content_disposition_type="inline",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )  # fmt: skip


@router.get("/tickets", response_model=list[TicketOut])
def list_my_tickets(request: Request, user: EmployeeUser, session: DbSession) -> list[TicketOut]:
    """Your own tickets, newest first."""
    return _service(request, user, session).list_own()


@router.post("/tickets", response_model=TicketOut, status_code=201)
async def create_ticket(
    request: Request,
    user: EmployeeUser,
    session: DbSession,
    category: Annotated[str, Form(max_length=32)],
    subject: Annotated[str, Form(max_length=300)],
    description: Annotated[str, Form(max_length=8000)],
    attachment: Annotated[UploadFile | None, File(description="Optional screenshot (PNG/JPG) or PDF")] = None,
) -> TicketOut:
    """Raises a ticket (multipart form). The optional attachment is checked by content: PNG, JPG or PDF."""
    service = _service(request, user, session)
    content = None
    if attachment is not None and attachment.filename:
        content = await attachment.read(request.app.state.settings.helpdesk_attachment_max_bytes + 1)
    return service.create(category, subject, description, attachment.filename if attachment else None, content)


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
def get_my_ticket(ticket_id: int, request: Request, user: EmployeeUser, session: DbSession) -> TicketOut:
    return to_ticket_out(_service(request, user, session).get_own(ticket_id))


@router.get("/tickets/{ticket_id}/attachment")
def download_my_attachment(ticket_id: int, request: Request, user: EmployeeUser, session: DbSession) -> FileResponse:
    service = _service(request, user, session)
    return _file_response(service.attachment(service.get_own(ticket_id)))


# ---- HR ----


@router.get("/admin/tickets", response_model=list[TicketOut])
def list_all_tickets(
    request: Request, user: HrUser, session: DbSession, ticket_status: Annotated[TicketStatus | None, Query(alias="status")] = None
) -> list[TicketOut]:
    """Every ticket with who raised it, newest first; optional status filter."""
    return _service(request, user, session).list_all(ticket_status)


@router.get("/admin/summary", response_model=TicketSummary)
def ticket_summary(request: Request, user: HrUser, session: DbSession) -> TicketSummary:
    return _service(request, user, session).summary()


@router.patch("/admin/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket_status(ticket_id: int, update: TicketStatusUpdate, request: Request, user: HrUser, session: DbSession) -> TicketOut:
    return _service(request, user, session).update_status(ticket_id, update.status)


@router.get("/admin/tickets/{ticket_id}/attachment")
def download_any_attachment(ticket_id: int, request: Request, user: HrUser, session: DbSession) -> FileResponse:
    service = _service(request, user, session)
    return _file_response(service.attachment(service.get_any(ticket_id)))
