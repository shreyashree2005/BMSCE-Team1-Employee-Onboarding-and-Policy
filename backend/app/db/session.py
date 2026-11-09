"""Engine and session management.

The engine and session factory are created per application instance (see
``app.main.create_app``) and stored on ``app.state``, so tests can run isolated
apps against their own databases.
"""

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


def create_db_engine(database_url: str) -> Engine:
    """Creates an engine with sensible defaults for SQLite (local/dev) and PostgreSQL (primary)."""
    url = make_url(database_url)
    if url.get_backend_name() == "sqlite":
        # FastAPI runs sync endpoints in a thread pool, so SQLite connections must be shareable across threads.
        options: dict = {"connect_args": {"check_same_thread": False}}
        if url.database in (None, "", ":memory:"):
            # One shared connection, otherwise every new connection would see an empty in-memory database.
            options["poolclass"] = StaticPool
        engine = create_engine(url, **options)
        event.listen(engine, "connect", _enable_sqlite_foreign_keys)
        return engine
    return create_engine(url, pool_pre_ping=True)


def _enable_sqlite_foreign_keys(dbapi_connection, _record) -> None:  # noqa: ANN001 (DB-API connection)
    """SQLite ignores ON DELETE CASCADE unless foreign keys are switched on per connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    # expire_on_commit=False lets repositories return data after committing without extra queries.
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db_session(request: Request) -> Iterator[Session]:
    """FastAPI dependency: one session per request, rolled back on error and always closed."""
    session_factory: sessionmaker[Session] = request.app.state.session_factory
    session = session_factory()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
