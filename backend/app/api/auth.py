"""Authentication and role-based access control dependencies.

A request is authenticated by a signed JWT, read from the httpOnly session cookie (browsers) or an
``Authorization: Bearer`` header (API clients). The token only identifies the user: the account is reloaded
from the database on every request, so deactivating a user or changing their role takes effect immediately
and a token can never grant more than the stored role.

Cookie-authenticated requests that change state must also carry ``X-Requested-With: OnboardIQ``. Browsers
won't send custom headers cross-site without a CORS preflight that our allow-list rejects, so this blocks
cross-site request forgery on top of the SameSite cookie.
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.api.dependencies import get_app_settings
from app.core.security import InvalidTokenError, decode_access_token
from app.db.models import UserRecord
from app.db.session import get_db_session
from app.schemas.auth import UserRole
from app.services.onboarding_repository import SqlAlchemyTaskRepository, TaskRepository

CSRF_HEADER = "X-Requested-With"
CSRF_HEADER_VALUE = "OnboardIQ"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

NOT_AUTHENTICATED = "Not authenticated. Please sign in."


def _unauthorized(detail: str = NOT_AUTHENTICATED) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def _read_token(request: Request, settings: Settings) -> tuple[str | None, bool]:
    """Returns ``(token, from_cookie)``. An explicit Bearer header wins over the cookie."""
    header = request.headers.get("Authorization")
    if header:
        scheme, _, value = header.partition(" ")
        if scheme.lower() != "bearer" or not value.strip():
            raise _unauthorized("Invalid authorization header.")
        return value.strip(), False
    cookie = request.cookies.get(settings.session_cookie_name)
    return (cookie, True) if cookie else (None, False)


def has_csrf_header(request: Request) -> bool:
    return request.headers.get(CSRF_HEADER) == CSRF_HEADER_VALUE


def get_current_user(
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> UserRecord:
    token, from_cookie = _read_token(request, settings)
    if token is None:
        raise _unauthorized()
    try:
        claims = decode_access_token(token, request.app.state.jwt_secret)
    except InvalidTokenError as error:
        raise _unauthorized("Your session has expired or is invalid. Please sign in again.") from error

    if from_cookie and request.method not in SAFE_METHODS and not has_csrf_header(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing request verification header.")

    user = session.get(UserRecord, claims.user_id, options=[selectinload(UserRecord.profile)])
    if user is None or not user.is_active:
        raise _unauthorized("Your account is unavailable. Please sign in again.")
    if user.role != claims.role:
        # Role changed since the token was issued: make the user sign in again rather than trusting stale claims.
        raise _unauthorized("Your permissions changed. Please sign in again.")
    if (user.session_version or 0) != claims.session_version:
        # The password was changed (e.g. reset) after this session started.
        raise _unauthorized("Your password was changed. Please sign in again.")
    return user


CurrentUser = Annotated[UserRecord, Depends(get_current_user)]


def require_roles(*roles: UserRole) -> Callable[[UserRecord], UserRecord]:
    allowed = frozenset(roles)

    def dependency(user: CurrentUser) -> UserRecord:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have permission to perform this action.")
        return user

    return dependency


EmployeeUser = Annotated[UserRecord, Depends(require_roles(UserRole.EMPLOYEE))]
HrUser = Annotated[UserRecord, Depends(require_roles(UserRole.HR))]


def get_task_repository(user: EmployeeUser, session: Annotated[Session, Depends(get_db_session)]) -> TaskRepository:
    """The signed-in employee's own checklist; there is no parameter that could select another employee."""
    return SqlAlchemyTaskRepository(session, user.id)
