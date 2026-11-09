"""Task actions, job roles, employee records and password reset.

Adds:
- users.session_version (password resets sign out existing sessions);
- employee_profiles.job_role plus personal details saved by the profile task;
- onboarding_tasks.action_key and completed_at (what completes a task, and when it was completed);
- task_progress, task_documents, emergency_contacts, bank_details and password_reset_tokens tables.

Purely additive and idempotent: existing rows are kept; existing tasks get their action assigned at startup.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-08
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _add_column(table: str, column: sa.Column) -> None:
    if column.name not in _columns(table):
        op.add_column(table, column)


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    _add_column("users", sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"))

    _add_column("employee_profiles", sa.Column("job_role", sa.String(32), nullable=True))
    _add_column("employee_profiles", sa.Column("phone", sa.String(32), nullable=True))
    _add_column("employee_profiles", sa.Column("personal_email", sa.String(254), nullable=True))
    _add_column("employee_profiles", sa.Column("address", sa.Text(), nullable=True))
    _add_column("employee_profiles", sa.Column("date_of_birth", sa.Date(), nullable=True))
    if "ix_employee_profiles_job_role" not in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("employee_profiles")}:
        op.create_index("ix_employee_profiles_job_role", "employee_profiles", ["job_role"])

    _add_column("onboarding_tasks", sa.Column("action_key", sa.String(64), nullable=True))
    _add_column("onboarding_tasks", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))

    if "task_progress" not in existing:
        op.create_table(
            "task_progress",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("task_id", sa.Integer(), sa.ForeignKey("onboarding_tasks.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("data", sa.Text(), nullable=False),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    if "task_documents" not in existing:
        op.create_table(
            "task_documents",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("task_id", sa.Integer(), sa.ForeignKey("onboarding_tasks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("document_type", sa.String(64), nullable=False),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column("storage_name", sa.String(80), nullable=False, unique=True),
            sa.Column("content_type", sa.String(100), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("sha256", sa.String(64), nullable=False),
            sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_task_documents_task", "task_documents", ["task_id"])
        op.create_index("ix_task_documents_employee_id", "task_documents", ["employee_id"])
    if "emergency_contacts" not in existing:
        op.create_table(
            "emergency_contacts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("relationship", sa.String(50), nullable=False),
            sa.Column("phone", sa.String(32), nullable=False),
            sa.Column("email", sa.String(254), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    if "bank_details" not in existing:
        op.create_table(
            "bank_details",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("employee_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("account_holder", sa.String(200), nullable=False),
            sa.Column("bank_name", sa.String(150), nullable=False),
            sa.Column("ifsc", sa.String(11), nullable=False),
            sa.Column("account_number_encrypted", sa.Text(), nullable=False),
            sa.Column("account_last4", sa.String(4), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    if "password_reset_tokens" not in existing:
        op.create_table(
            "password_reset_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])


def downgrade() -> None:
    for table in ("password_reset_tokens", "bank_details", "emergency_contacts", "task_documents", "task_progress"):
        op.drop_table(table)
    # Plain DROP COLUMN (SQLite >= 3.35 and PostgreSQL). Batch mode would rebuild "users" on SQLite, and dropping the
    # old table would cascade-delete every employee's tasks and profile.
    op.drop_column("onboarding_tasks", "completed_at")
    op.drop_column("onboarding_tasks", "action_key")
    op.drop_index("ix_employee_profiles_job_role", table_name="employee_profiles")
    for column in ("date_of_birth", "address", "personal_email", "phone", "job_role"):
        op.drop_column("employee_profiles", column)
    op.drop_column("users", "session_version")
