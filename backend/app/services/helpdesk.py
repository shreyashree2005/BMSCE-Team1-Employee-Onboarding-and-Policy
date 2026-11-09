"""Help Desk tickets: employees raise and track their own requests; HR works through and updates all of them.

Responses are never generated: a ticket only changes when someone on the HR team updates its status.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import SupportTicketRecord, UserRecord
from app.schemas.helpdesk import TICKET_CATEGORY_LABELS, TicketAttachmentOut, TicketCategory, TicketOut, TicketStatus, TicketSummary
from app.services.uploads import DOCUMENT_TYPES, STORAGE_NAME, detect_type, safe_filename

SUBJECT_MIN, SUBJECT_MAX = 5, 150
DESCRIPTION_MIN, DESCRIPTION_MAX = 10, 4000


class HelpDeskError(Exception):
    def __init__(self, status_code: int, message: str, fields: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.fields = fields or {}


@dataclass(frozen=True)
class TicketFile:
    path: Path
    filename: str
    content_type: str


def validate_ticket(category: str, subject: str, description: str) -> tuple[TicketCategory, str, str]:
    """Normalises and checks the form; raises HelpDeskError (422) with per-field messages."""
    errors: dict[str, str] = {}
    try:
        parsed_category = TicketCategory(category)
    except ValueError:
        parsed_category = TicketCategory.OTHER
        errors["category"] = "Choose a category."
    subject = " ".join(subject.split())
    description = description.strip()
    if not SUBJECT_MIN <= len(subject) <= SUBJECT_MAX:
        errors["subject"] = f"Enter a subject of {SUBJECT_MIN}–{SUBJECT_MAX} characters."
    if not DESCRIPTION_MIN <= len(description) <= DESCRIPTION_MAX:
        errors["description"] = f"Describe the issue in {DESCRIPTION_MIN}–{DESCRIPTION_MAX} characters."
    if errors:
        raise HelpDeskError(422, "Please fix the highlighted fields.", errors)
    return parsed_category, subject, description


def reference_for(ticket_id: int) -> str:
    return f"HD-{ticket_id:06d}"


def _utc(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


def to_ticket_out(record: SupportTicketRecord, *, include_requester: bool = False) -> TicketOut:
    category = TicketCategory(record.category)
    attachment = None
    if record.attachment_storage_name:
        attachment = TicketAttachmentOut(filename=record.attachment_filename or "attachment", content_type=record.attachment_content_type or "", size_bytes=record.attachment_size_bytes or 0)
    return TicketOut(
        id=record.id, reference=reference_for(record.id), category=category, category_label=TICKET_CATEGORY_LABELS[category],
        subject=record.subject, description=record.description, status=TicketStatus(record.status), attachment=attachment,
        created_at=_utc(record.created_at), updated_at=_utc(record.updated_at), resolved_at=_utc(record.resolved_at),
        requester_name=record.user.full_name if include_requester else None,
        requester_email=record.user.email if include_requester else None,
    )  # fmt: skip


class HelpDeskService:
    def __init__(self, session: Session, user: UserRecord, attachments_dir: Path, max_attachment_bytes: int) -> None:
        self._session = session
        self._user = user
        self._dir = attachments_dir
        self._max_bytes = max_attachment_bytes

    # ---- Employee (own tickets only) ----

    def create(self, category: str, subject: str, description: str, filename: str | None, content: bytes | None) -> TicketOut:
        parsed_category, subject, description = validate_ticket(category, subject, description)
        record = SupportTicketRecord(user_id=self._user.id, category=parsed_category.value, subject=subject, description=description, status=TicketStatus.OPEN.value)
        if content:
            if len(content) > self._max_bytes:
                raise HelpDeskError(413, f"Attachments can be at most {self._max_bytes // (1024 * 1024)} MB.", {"attachment": "File too large."})
            detected = detect_type(content, DOCUMENT_TYPES)
            if detected is None:
                raise HelpDeskError(415, "Attach a screenshot (PNG or JPG) or a PDF.", {"attachment": "Unsupported file type."})
            content_type, extension = detected
            storage_name = f"{uuid.uuid4().hex}{extension}"
            path = self._path(self._user.id, storage_name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            record.attachment_filename = safe_filename(filename, "attachment")
            record.attachment_storage_name = storage_name
            record.attachment_content_type = content_type
            record.attachment_size_bytes = len(content)
        self._session.add(record)
        self._session.commit()
        self._session.refresh(record)
        return to_ticket_out(record)

    def list_own(self) -> list[TicketOut]:
        records = self._session.scalars(
            select(SupportTicketRecord).where(SupportTicketRecord.user_id == self._user.id).order_by(SupportTicketRecord.id.desc())
        )
        return [to_ticket_out(r) for r in records]

    def get_own(self, ticket_id: int) -> SupportTicketRecord:
        record = self._session.get(SupportTicketRecord, ticket_id)
        if record is None or record.user_id != self._user.id:
            raise HelpDeskError(404, "Ticket not found.")
        return record

    # ---- HR (all tickets) ----

    def list_all(self, status: TicketStatus | None = None) -> list[TicketOut]:
        query = select(SupportTicketRecord).options(selectinload(SupportTicketRecord.user)).order_by(SupportTicketRecord.id.desc())
        if status is not None:
            query = query.where(SupportTicketRecord.status == status.value)
        return [to_ticket_out(r, include_requester=True) for r in self._session.scalars(query)]

    def summary(self) -> TicketSummary:
        rows = self._session.execute(select(SupportTicketRecord.status, func.count()).group_by(SupportTicketRecord.status)).all()
        by_status = {s.value: 0 for s in TicketStatus} | {status: count for status, count in rows}
        return TicketSummary(total=sum(by_status.values()), by_status=by_status)

    def get_any(self, ticket_id: int) -> SupportTicketRecord:
        record = self._session.get(SupportTicketRecord, ticket_id)
        if record is None:
            raise HelpDeskError(404, "Ticket not found.")
        return record

    def update_status(self, ticket_id: int, status: TicketStatus) -> TicketOut:
        record = self.get_any(ticket_id)
        record.status = status.value
        record.resolved_at = datetime.now(timezone.utc) if status in (TicketStatus.RESOLVED, TicketStatus.CLOSED) else None
        self._session.commit()
        self._session.refresh(record)
        return to_ticket_out(record, include_requester=True)

    # ---- Files ----

    def attachment(self, record: SupportTicketRecord) -> TicketFile:
        if not record.attachment_storage_name:
            raise HelpDeskError(404, "This ticket has no attachment.")
        path = self._path(record.user_id, record.attachment_storage_name)
        if not path.is_file():
            raise HelpDeskError(404, "The attachment is no longer available.")
        return TicketFile(path, record.attachment_filename or "attachment", record.attachment_content_type or "application/octet-stream")

    def _path(self, user_id: int, storage_name: str) -> Path:
        if not STORAGE_NAME.fullmatch(storage_name):
            raise ValueError("invalid storage name")
        return self._dir / str(user_id) / storage_name
