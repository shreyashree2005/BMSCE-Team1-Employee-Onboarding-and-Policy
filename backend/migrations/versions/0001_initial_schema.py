"""Initial schema (Phases 2.2-3.3): onboarding tasks and policy documents.

Idempotent: tables that already exist are left untouched, so databases created before Alembic was
introduced (via ``create_all``) are adopted without data loss.

Revision ID: 0001
Revises:
Create Date: 2026-11-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

STAGES = ["Welcome", "Documentation", "Payroll & Benefits", "Training", "Ready to Go"]
CATEGORIES = ["Documents", "Payroll", "IT Setup", "Orientation", "Team", "Compliance", "Benefits", "HR Forms", "Learning"]
PRIORITIES = ["high", "medium", "low"]
STATUSES = ["pending", "in_progress", "completed"]


def _enum(values: list[str], name: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=32)


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "onboarding_tasks" not in existing:
        op.create_table(
            "onboarding_tasks",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("stage", _enum(STAGES, "onboarding_stage"), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("category", _enum(CATEGORIES, "task_category"), nullable=False),
            sa.Column("due_date", sa.Date(), nullable=False),
            sa.Column("priority", _enum(PRIORITIES, "task_priority"), nullable=False),
            sa.Column("status", _enum(STATUSES, "task_status"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        for column in ("stage", "category", "status"):
            op.create_index(f"ix_onboarding_tasks_{column}", "onboarding_tasks", [column])

    if "policy_documents" not in existing:
        op.create_table(
            "policy_documents",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column("storage_name", sa.String(64), nullable=False, unique=True),
            sa.Column("file_type", _enum(["pdf", "docx", "txt"], "policy_file_type"), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("content_sha256", sa.String(64), nullable=False, unique=True),
            sa.Column("status", _enum(["processing", "ready", "failed"], "policy_document_status"), nullable=False),
            sa.Column("page_count", sa.Integer(), nullable=True),
            sa.Column("chunk_count", sa.Integer(), nullable=False),
            sa.Column("error_message", sa.String(500), nullable=True),
            sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_policy_documents_status", "policy_documents", ["status"])

    if "policy_chunks" not in existing:
        op.create_table(
            "policy_chunks",
            sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True, autoincrement=True),
            sa.Column("document_id", sa.String(36), sa.ForeignKey("policy_documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("chunk_index", sa.Integer(), nullable=False),
            sa.Column("page_number", sa.Integer(), nullable=True),
            sa.Column("section", sa.String(200), nullable=True),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("char_count", sa.Integer(), nullable=False),
        )
        op.create_index("ix_policy_chunks_document_order", "policy_chunks", ["document_id", "chunk_index"], unique=True)


def downgrade() -> None:
    op.drop_table("policy_chunks")
    op.drop_table("policy_documents")
    op.drop_table("onboarding_tasks")
