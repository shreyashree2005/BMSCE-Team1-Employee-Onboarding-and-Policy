"""Phase 3.4: users, employee profiles and per-employee onboarding tasks.

The old ``onboarding_tasks`` table (one global checklist, task ID as primary key) is rebuilt with an
integer key, an ``employee_id`` and the old ID kept as ``task_key``. Existing rows (the single demo
employee's progress) are preserved and assigned to that employee's new account, which is created
with an unusable password; startup seeding gives it the demo password when demo data is enabled.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-07
"""

from datetime import date, datetime

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

STAGES = ["Welcome", "Documentation", "Payroll & Benefits", "Training", "Ready to Go"]
CATEGORIES = ["Documents", "Payroll", "IT Setup", "Orientation", "Team", "Compliance", "Benefits", "HR Forms", "Learning"]
PRIORITIES = ["high", "medium", "low"]
STATUSES = ["pending", "in_progress", "completed"]
TASK_COLUMNS = ["stage", "title", "description", "category", "due_date", "priority", "status", "created_at", "updated_at"]

# The employee whose checklist existed before accounts were introduced (matches app/data/demo_users.py).
LEGACY_EMPLOYEE = {
    "email": "shreya.nambiar@onboardiq-demo.example",
    "full_name": "Shreya Nambiar",
    "first_name": "Shreya",
    "last_name": "Nambiar",
    "job_title": "Associate Software Engineer",
    "department": "Product Engineering",
    "location": "Bengaluru, India",
    "start_date": date(2026, 11, 2),
    "manager_name": "Priya Nair",
    "buddy_name": "Rohan Das",
}
UNUSABLE_PASSWORD = "!unusable"


def _as_date(value: object) -> object:
    # SQLite returns DATE/DATETIME columns as text from raw SELECTs; typed inserts need Python objects.
    return date.fromisoformat(value[:10]) if isinstance(value, str) else value


def _as_datetime(value: object) -> object:
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def _typed(row: dict) -> dict:
    return {**row, "due_date": _as_date(row["due_date"]), "created_at": _as_datetime(row["created_at"]), "updated_at": _as_datetime(row["updated_at"])}


def _enum(values: list[str], name: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=32)


def _users_table() -> sa.Table:
    return sa.table(
        "users", sa.column("id", sa.Integer), sa.column("email", sa.String), sa.column("full_name", sa.String),
        sa.column("password_hash", sa.String), sa.column("role", sa.String), sa.column("is_active", sa.Boolean),
    )


def _profiles_table() -> sa.Table:
    return sa.table(
        "employee_profiles", sa.column("id", sa.Integer), sa.column("user_id", sa.Integer), sa.column("first_name", sa.String),
        sa.column("last_name", sa.String), sa.column("job_title", sa.String), sa.column("department", sa.String),
        sa.column("location", sa.String), sa.column("start_date", sa.Date), sa.column("manager_name", sa.String), sa.column("buddy_name", sa.String),
    )


def _task_columns() -> list[sa.Column]:
    return [
        sa.Column("stage", _enum(STAGES, "onboarding_stage"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", _enum(CATEGORIES, "task_category"), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("priority", _enum(PRIORITIES, "task_priority"), nullable=False),
        sa.Column("status", _enum(STATUSES, "task_status"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing = set(inspector.get_table_names())
    # Tolerate partially created schemas (e.g. a dev server that ran create_all with the new models before migrating).
    users = _users_table() if "users" in existing else op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", _enum(["employee", "hr"], "user_role"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    if "users" not in existing:
        op.create_index("ix_users_role", "users", ["role"])

    profiles = _profiles_table() if "employee_profiles" in existing else op.create_table(
        "employee_profiles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("job_title", sa.String(150), nullable=False),
        sa.Column("department", sa.String(150), nullable=False),
        sa.Column("location", sa.String(150), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("manager_name", sa.String(200), nullable=True),
        sa.Column("buddy_name", sa.String(200), nullable=True),
    )
    if "employee_profiles" not in existing:
        op.create_index("ix_employee_profiles_department", "employee_profiles", ["department"])

    if "employee_id" in {c["name"] for c in inspector.get_columns("onboarding_tasks")}:
        return  # already the per-employee shape

    legacy_rows = [dict(row) for row in connection.execute(sa.text(f"SELECT id, {', '.join(TASK_COLUMNS)} FROM onboarding_tasks")).mappings()]

    op.drop_table("onboarding_tasks")  # also drops its indexes
    tasks = op.create_table(
        "onboarding_tasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_key", sa.String(64), nullable=False),
        *_task_columns(),
        sa.UniqueConstraint("employee_id", "task_key", name="uq_onboarding_tasks_employee_task"),
    )
    for column in ("employee_id", "stage", "category", "status"):
        op.create_index(f"ix_onboarding_tasks_{column}", "onboarding_tasks", [column])

    if legacy_rows:
        employee_id = connection.execute(sa.select(users.c.id).where(users.c.email == LEGACY_EMPLOYEE["email"])).scalar()
        if employee_id is None:
            connection.execute(
                users.insert().values(
                    email=LEGACY_EMPLOYEE["email"], full_name=LEGACY_EMPLOYEE["full_name"], password_hash=UNUSABLE_PASSWORD, role="employee", is_active=True
                )
            )
            employee_id = connection.execute(sa.select(users.c.id).where(users.c.email == LEGACY_EMPLOYEE["email"])).scalar_one()
        if connection.execute(sa.select(profiles.c.id).where(profiles.c.user_id == employee_id)).scalar() is None:
            profile = {k: v for k, v in LEGACY_EMPLOYEE.items() if k not in {"email", "full_name"}}
            connection.execute(profiles.insert().values(user_id=employee_id, **profile))
        connection.execute(tasks.insert(), [{"employee_id": employee_id, "task_key": row.pop("id"), **_typed(row)} for row in legacy_rows])


def downgrade() -> None:
    connection = op.get_bind()
    first_employee = connection.execute(sa.text("SELECT MIN(employee_id) FROM onboarding_tasks")).scalar()
    rows = []
    if first_employee is not None:
        rows = [dict(r) for r in connection.execute(sa.text(f"SELECT task_key, {', '.join(TASK_COLUMNS)} FROM onboarding_tasks WHERE employee_id = :e"), {"e": first_employee}).mappings()]
    op.drop_table("onboarding_tasks")
    old = op.create_table("onboarding_tasks", sa.Column("id", sa.String(64), primary_key=True), *_task_columns())
    for column in ("stage", "category", "status"):
        op.create_index(f"ix_onboarding_tasks_{column}", "onboarding_tasks", [column])
    if rows:
        connection.execute(old.insert(), [{"id": row.pop("task_key"), **_typed(row)} for row in rows])
    op.drop_table("employee_profiles")
    op.drop_table("users")
