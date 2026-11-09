"""ORM models. Domain enums are reused from the API schemas so the two can't drift apart."""

from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.schemas.auth import UserRole
from app.schemas.onboarding import OnboardingStage, TaskCategory, TaskPriority, TaskStatus
from app.schemas.policies import DocumentFileType, DocumentStatus


def _enum_column(enum_cls: type[PyEnum], name: str) -> Enum:
    """Stores the enum's *value* (e.g. "in_progress") as VARCHAR with a CHECK constraint, portable across databases."""
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        length=32,
        values_callable=lambda members: [member.value for member in members],
    )


class UserRecord(Base):
    """A person who can sign in. Employees also have an EmployeeProfile; HR users don't need one."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)  # stored lower-case
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(_enum_column(UserRole, "user_role"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Incremented when the password changes; session tokens carry it, so a reset signs out every existing session.
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # First-visit guidance: set when the user finishes or dismisses the website tour / company introduction.
    tour_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    company_intro_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Profile photo, stored under a server-generated name in PROFILE_PHOTOS_DIR/<user id>/.
    photo_storage_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    photo_content_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    photo_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    profile: Mapped["EmployeeProfileRecord | None"] = relationship(back_populates="user", cascade="all, delete-orphan", uselist=False)


class EmployeeProfileRecord(Base):
    __tablename__ = "employee_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    job_title: Mapped[str] = mapped_column(String(150))
    department: Mapped[str] = mapped_column(String(150), index=True)
    location: Mapped[str] = mapped_column(String(150))
    start_date: Mapped[date] = mapped_column(Date)
    manager_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    buddy_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Job function chosen at sign-up (e.g. "software_developer"); drives the onboarding checklist. Not an access role.
    job_role: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # Personal details saved by the "Complete employee profile" task.
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    personal_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)

    user: Mapped[UserRecord] = relationship(back_populates="profile")


class OnboardingTaskRecord(Base):
    """One checklist item for one employee. ``task_key`` (e.g. "t9") is the ID the API exposes, scoped per employee."""

    __tablename__ = "onboarding_tasks"
    __table_args__ = (UniqueConstraint("employee_id", "task_key", name="uq_onboarding_tasks_employee_task"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    task_key: Mapped[str] = mapped_column(String(64))
    stage: Mapped[OnboardingStage] = mapped_column(_enum_column(OnboardingStage, "onboarding_stage"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[TaskCategory] = mapped_column(_enum_column(TaskCategory, "task_category"), index=True)
    due_date: Mapped[date] = mapped_column(Date)
    priority: Mapped[TaskPriority] = mapped_column(_enum_column(TaskPriority, "task_priority"))
    status: Mapped[TaskStatus] = mapped_column(_enum_column(TaskStatus, "task_status"), index=True)
    # Which action completes the task (see app/data/task_catalog.py), e.g. "documents" or "security_training".
    action_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Time tracking: first start, start of the current active period (null when not in progress), total active time.
    first_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TaskProgressRecord(Base):
    """Saved progress and the completion record of one task's action (form values, checked items, quiz results...)."""

    __tablename__ = "task_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("onboarding_tasks.id", ondelete="CASCADE"), unique=True)
    data: Mapped[str] = mapped_column(Text, default="{}")  # JSON; never contains bank account numbers
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TaskDocumentRecord(Base):
    """A file an employee uploaded for a document task. Stored under a server-generated name, per employee."""

    __tablename__ = "task_documents"
    __table_args__ = (Index("ix_task_documents_task", "task_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("onboarding_tasks.id", ondelete="CASCADE"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[str] = mapped_column(String(64))
    filename: Mapped[str] = mapped_column(String(255))  # sanitised original name, display only
    storage_name: Mapped[str] = mapped_column(String(80), unique=True)
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EmergencyContactRecord(Base):
    __tablename__ = "emergency_contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    relationship: Mapped[str] = mapped_column(String(50))
    phone: Mapped[str] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class BankDetailsRecord(Base):
    """Salary account. The account number is encrypted at rest; only its last four digits are stored in clear."""

    __tablename__ = "bank_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    account_holder: Mapped[str] = mapped_column(String(200))
    bank_name: Mapped[str] = mapped_column(String(150))
    ifsc: Mapped[str] = mapped_column(String(11))
    account_number_encrypted: Mapped[str] = mapped_column(Text)
    account_last4: Mapped[str] = mapped_column(String(4))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PasswordResetTokenRecord(Base):
    """A single-use password reset token. Only its SHA-256 hash is stored."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SupportTicketRecord(Base):
    """A Help Desk request raised by a user. Employees see only their own; HR sees and updates all of them."""

    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    subject: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), index=True, default="open", server_default="open")
    attachment_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attachment_storage_name: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)
    attachment_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    attachment_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[UserRecord] = relationship()


class PolicyQuizAttemptRecord(Base):
    """One graded attempt at a policy understanding quiz (answers are kept for the user's own review)."""

    __tablename__ = "policy_quiz_attempts"
    __table_args__ = (Index("ix_policy_quiz_attempts_user_policy", "user_id", "policy_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    policy_id: Mapped[str] = mapped_column(String(32))
    score: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean)
    answers: Mapped[str] = mapped_column(Text)  # JSON {question_id: chosen option index}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PolicyDocumentRecord(Base):
    """An uploaded policy document. The original file is stored on disk under ``storage_name``."""

    __tablename__ = "policy_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID4
    filename: Mapped[str] = mapped_column(String(255))  # sanitised original name, for display only
    storage_name: Mapped[str] = mapped_column(String(64), unique=True)  # "<uuid>.<ext>" on disk; never user-controlled
    file_type: Mapped[DocumentFileType] = mapped_column(_enum_column(DocumentFileType, "policy_file_type"))
    size_bytes: Mapped[int] = mapped_column(Integer)
    content_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[DocumentStatus] = mapped_column(_enum_column(DocumentStatus, "policy_document_status"), index=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    chunks: Mapped[list["PolicyChunkRecord"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", passive_deletes=True, order_by="PolicyChunkRecord.chunk_index"
    )


class PolicyChunkRecord(Base):
    """A retrievable passage of a policy document. Its ``id`` is also its vector ID in the FAISS index."""

    __tablename__ = "policy_chunks"
    __table_args__ = (Index("ix_policy_chunks_document_order", "document_id", "chunk_index", unique=True),)

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("policy_documents.id", ondelete="CASCADE"))
    chunk_index: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section: Mapped[str | None] = mapped_column(String(200), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column(Integer)

    document: Mapped[PolicyDocumentRecord] = relationship(back_populates="chunks")
