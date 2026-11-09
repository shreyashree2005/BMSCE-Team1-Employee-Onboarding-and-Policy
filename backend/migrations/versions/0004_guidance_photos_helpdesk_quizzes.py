"""Guided onboarding: first-visit guidance, profile photos, task time tracking, Help Desk and policy quizzes.

Adds:
- users.tour_completed_at, company_intro_seen_at (first-visit tour / company introduction dismissed);
- users.photo_storage_name, photo_content_type, photo_updated_at (profile photo);
- onboarding_tasks.first_started_at, started_at, time_spent_seconds (time spent on each task);
- support_tickets (Help Desk requests) and policy_quiz_attempts (policy understanding quiz results).

Purely additive and idempotent: existing rows are kept and get empty/zero values.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-08
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _add_column(table: str, column: sa.Column) -> None:
    if column.name not in _columns(table):
        op.add_column(table, column)


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    _add_column("users", sa.Column("tour_completed_at", sa.DateTime(timezone=True), nullable=True))
    _add_column("users", sa.Column("company_intro_seen_at", sa.DateTime(timezone=True), nullable=True))
    _add_column("users", sa.Column("photo_storage_name", sa.String(80), nullable=True))
    _add_column("users", sa.Column("photo_content_type", sa.String(32), nullable=True))
    _add_column("users", sa.Column("photo_updated_at", sa.DateTime(timezone=True), nullable=True))

    _add_column("onboarding_tasks", sa.Column("first_started_at", sa.DateTime(timezone=True), nullable=True))
    _add_column("onboarding_tasks", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    _add_column("onboarding_tasks", sa.Column("time_spent_seconds", sa.Integer(), nullable=False, server_default="0"))

    if "support_tickets" not in existing:
        op.create_table(
            "support_tickets",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("category", sa.String(32), nullable=False),
            sa.Column("subject", sa.String(150), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="open"),
            sa.Column("attachment_filename", sa.String(255), nullable=True),
            sa.Column("attachment_storage_name", sa.String(80), nullable=True, unique=True),
            sa.Column("attachment_content_type", sa.String(100), nullable=True),
            sa.Column("attachment_size_bytes", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
        op.create_index("ix_support_tickets_category", "support_tickets", ["category"])
        op.create_index("ix_support_tickets_status", "support_tickets", ["status"])

    if "policy_quiz_attempts" not in existing:
        op.create_table(
            "policy_quiz_attempts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("policy_id", sa.String(32), nullable=False),
            sa.Column("score", sa.Integer(), nullable=False),
            sa.Column("total", sa.Integer(), nullable=False),
            sa.Column("passed", sa.Boolean(), nullable=False),
            sa.Column("answers", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_policy_quiz_attempts_user_policy", "policy_quiz_attempts", ["user_id", "policy_id"])


def downgrade() -> None:
    op.drop_table("policy_quiz_attempts")
    op.drop_table("support_tickets")
    for column in ("time_spent_seconds", "started_at", "first_started_at"):
        op.drop_column("onboarding_tasks", column)
    for column in ("photo_updated_at", "photo_content_type", "photo_storage_name", "company_intro_seen_at", "tour_completed_at"):
        op.drop_column("users", column)
