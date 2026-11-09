"""Help Desk ticket schemas (camelCase JSON)."""

from datetime import datetime
from enum import Enum

from pydantic import Field

from app.schemas.onboarding import CamelModel


class TicketCategory(str, Enum):
    IT_SUPPORT = "it_support"
    HR_SUPPORT = "hr_support"
    PAYROLL = "payroll"
    BENEFITS = "benefits"
    DOCUMENT_UPLOAD = "document_upload"
    ONBOARDING_TASK = "onboarding_task"
    ACCOUNT_LOGIN = "account_login"
    OTHER = "other"


TICKET_CATEGORY_LABELS: dict[TicketCategory, str] = {
    TicketCategory.IT_SUPPORT: "IT Support",
    TicketCategory.HR_SUPPORT: "HR Support",
    TicketCategory.PAYROLL: "Payroll Issues",
    TicketCategory.BENEFITS: "Benefits Queries",
    TicketCategory.DOCUMENT_UPLOAD: "Document Upload Issues",
    TicketCategory.ONBOARDING_TASK: "Onboarding Task Issues",
    TicketCategory.ACCOUNT_LOGIN: "Account/Login Issues",
    TicketCategory.OTHER: "Other",
}


class TicketStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketAttachmentOut(CamelModel):
    filename: str
    content_type: str
    size_bytes: int


class TicketOut(CamelModel):
    id: int
    # Human-friendly reference shown to users, e.g. "HD-000042".
    reference: str
    category: TicketCategory
    category_label: str
    subject: str
    description: str
    status: TicketStatus
    attachment: TicketAttachmentOut | None = None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None
    # Who raised it (included for HR views; employees only ever see their own tickets).
    requester_name: str | None = None
    requester_email: str | None = None


class TicketStatusUpdate(CamelModel):
    status: TicketStatus


class TicketSummary(CamelModel):
    total: int
    by_status: dict[str, int] = Field(default_factory=dict)
