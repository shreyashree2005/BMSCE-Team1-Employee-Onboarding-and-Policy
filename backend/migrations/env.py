"""Alembic environment.

Used both from the CLI (``alembic upgrade head``) and programmatically by the API at startup, which passes
an open connection in ``config.attributes["connection"]``.
"""

from alembic import context
from sqlalchemy import Connection

from app.core.config import Settings
from app.db import models  # noqa: F401  (registers models on Base.metadata)
from app.db.base import Base
from app.db.session import create_db_engine

config = context.config
target_metadata = Base.metadata


def _run(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=connection.dialect.name == "sqlite",  # SQLite needs table rebuilds for ALTERs
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    engine = create_db_engine(Settings().database_url)
    try:
        with engine.begin() as conn:
            _run(conn)
    finally:
        engine.dispose()


if context.is_offline_mode():  # pragma: no cover - offline SQL generation isn't used
    raise SystemExit("Offline migrations aren't supported; run against a database.")
run_migrations_online()
