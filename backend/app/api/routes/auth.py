"""Sign-in, employee self-registration, sign-out and the current session."""

import logging
import math
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.auth import CurrentUser, has_csrf_header
from app.api.dependencies import get_app_settings
from app.core.config import Settings
from app.core.rate_limit import LoginAttemptLimiter
from app.core.security import create_access_token, verify_dummy_password, verify_password
from app.db.models import UserRecord
from app.db.session import get_db_session
from app.data.job_roles import job_role_label
from app.schemas.auth import (
    PreferencesUpdate,
    EmployeeProfileOut,
    ForgotPasswordRequest,
    LoginRequest,
    MessageOut,
    RegisterRequest,
    ResetPasswordRequest,
    ResetTokenRequest,
    ResetTokenStatus,
    SessionOut,
    UserOut,
)
from app.services.password_reset import InvalidResetTokenError, WeakPasswordError, check_reset_token, request_password_reset, reset_password
from app.services.profile_photo import ProfilePhotoError, ProfilePhotoService
from app.services.registration import EmailAlreadyRegisteredError, register_employee

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

INVALID_CREDENTIALS = "Incorrect email or password."


def to_user_out(user: UserRecord) -> UserOut:
    profile = None
    if user.profile is not None:
        profile = EmployeeProfileOut.model_validate(user.profile, from_attributes=True)
        profile.job_role_label = job_role_label(user.profile.job_role)
    photo_url = None
    if user.photo_storage_name:
        version = int(user.photo_updated_at.timestamp()) if user.photo_updated_at else 0
        photo_url = f"/api/v1/auth/me/photo?v={version}"
    return UserOut(
        id=user.id, email=user.email, full_name=user.full_name, role=user.role, profile=profile, photo_url=photo_url,
        tour_completed=user.tour_completed_at is not None, company_intro_seen=user.company_intro_seen_at is not None,
    )  # fmt: skip


def _require_csrf(request: Request) -> None:
    if not has_csrf_header(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing request verification header.")


RESET_REQUESTED = "If an account exists for that email, we've sent a link to reset your password. The link expires in {minutes} minutes."
INVALID_RESET_LINK = "This reset link is invalid or has expired. Request a new one."


@router.post("/forgot-password", response_model=MessageOut, status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> MessageOut:
    """Emails a single-use reset link if the account exists. The response is the same either way."""
    _require_csrf(request)
    limiter: LoginAttemptLimiter = request.app.state.password_reset_limiter
    key = _limiter_key(request, payload.email)
    retry_after = limiter.retry_after(key)
    if retry_after > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many reset requests. Please try again later.",
            headers={"Retry-After": str(math.ceil(retry_after))},
        )
    limiter.record_failure(key)  # every request counts toward the hourly limit
    request_password_reset(session, payload.email, settings, request.app.state.mailer)
    return MessageOut(message=RESET_REQUESTED.format(minutes=settings.password_reset_minutes))


@router.post("/reset-password/verify", response_model=ResetTokenStatus)
def verify_reset_token(payload: ResetTokenRequest, request: Request, session: Annotated[Session, Depends(get_db_session)]) -> ResetTokenStatus:
    """Checks a reset link before showing the new-password form (the token is sent in the body, never the URL)."""
    _require_csrf(request)
    try:
        return ResetTokenStatus(valid=True, email_hint=check_reset_token(session, payload.token))
    except InvalidResetTokenError:
        return ResetTokenStatus(valid=False)


@router.post("/reset-password", response_model=MessageOut)
def complete_password_reset(payload: ResetPasswordRequest, request: Request, session: Annotated[Session, Depends(get_db_session)]) -> MessageOut:
    """Sets a new password with a valid reset token. All existing sessions are signed out."""
    _require_csrf(request)
    try:
        reset_password(session, payload.token, payload.password)
    except InvalidResetTokenError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_RESET_LINK) from error
    except WeakPasswordError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    return MessageOut(message="Your password has been reset. Sign in with your new password.")


def _limiter_key(request: Request, email: str) -> str:
    client = request.client.host if request.client else "unknown"
    return f"{email}|{client}"


@router.post("/login", response_model=SessionOut)
def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> SessionOut:
    """Verifies email and password and starts a session (httpOnly cookie)."""
    if not has_csrf_header(request):
        # Prevents another site from silently signing a visitor into an account (login CSRF).
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing request verification header.")

    limiter: LoginAttemptLimiter = request.app.state.login_limiter
    key = _limiter_key(request, credentials.email)
    retry_after = limiter.retry_after(key)
    if retry_after > 0:
        minutes = max(1, math.ceil(retry_after / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed sign-in attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
            headers={"Retry-After": str(math.ceil(retry_after))},
        )

    user = session.scalars(
        select(UserRecord).where(UserRecord.email == credentials.email).options(selectinload(UserRecord.profile))
    ).first()
    if user is None:
        verify_dummy_password(credentials.password)  # same work as a real check, so timing doesn't reveal which emails exist
        valid = False
    else:
        valid = verify_password(credentials.password, user.password_hash) and user.is_active
    if not valid:
        limiter.record_failure(key)
        logger.info("Failed sign-in attempt")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)

    limiter.reset(key)
    return _start_session(user, request, response, session, settings)


def _start_session(user: UserRecord, request: Request, response: Response, session: Session, settings: Settings) -> SessionOut:
    """Records the sign-in and sets the httpOnly session cookie (shared by login and registration)."""
    user.last_login_at = datetime.now(timezone.utc)
    session.commit()
    token, expires_at = create_access_token(
        user_id=user.id,
        role=user.role.value,
        secret=request.app.state.jwt_secret,
        expires_minutes=settings.access_token_expire_minutes,
        session_version=user.session_version or 0,
    )
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return SessionOut(user=to_user_out(user), expires_at=expires_at)


@router.post("/register", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def register(
    registration: RegisterRequest,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> SessionOut:
    """
    Creates an **Employee** account with its profile and onboarding checklist, then signs the new user in.
    The role can't be chosen: requests with extra fields (such as `role`) are rejected with 422.
    """
    if not has_csrf_header(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing request verification header.")
    if not settings.allow_self_registration:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Self-registration is turned off. Please ask HR to create your account.")

    limiter: LoginAttemptLimiter = request.app.state.registration_limiter
    key = request.client.host if request.client else "unknown"
    retry_after = limiter.retry_after(key)
    if retry_after > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many sign-up attempts from this network. Please try again later.",
            headers={"Retry-After": str(math.ceil(retry_after))},
        )
    limiter.record_failure(key)  # every attempt counts toward the hourly limit

    try:
        user = register_employee(session, registration, start_date=settings.today(), calendar=request.app.state.work_calendar)
    except EmailAlreadyRegisteredError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists. Sign in instead, or use a different email."
        ) from error
    logger.info("New employee account registered (user id %s)", user.id)
    return _start_session(user, request, response, session, settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, settings: Annotated[Settings, Depends(get_app_settings)]) -> Response:
    """Ends the browser session by clearing the cookie. Works even if the session already expired."""
    if not has_csrf_header(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing request verification header.")
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(key=settings.session_cookie_name, path="/", httponly=True, secure=settings.cookie_secure, samesite="lax")
    return response


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, response: Response) -> UserOut:
    """The signed-in user (used by the web app to restore a session after a page refresh)."""
    response.headers["Cache-Control"] = "no-store"
    return to_user_out(user)


# ---- Profile photo and first-visit guidance ----


def _photo_service(request: Request) -> ProfilePhotoService:
    settings = request.app.state.settings
    return ProfilePhotoService(settings.profile_photos_dir, settings.profile_photo_max_bytes)


@router.patch("/me/preferences", response_model=UserOut)
def update_preferences(payload: PreferencesUpdate, user: CurrentUser, session: Annotated[Session, Depends(get_db_session)]) -> UserOut:
    """Remembers that the website tour / company introduction was finished or dismissed (false shows it again)."""
    now = datetime.now(timezone.utc)
    if payload.tour_completed is not None:
        user.tour_completed_at = now if payload.tour_completed else None
    if payload.company_intro_seen is not None:
        user.company_intro_seen_at = now if payload.company_intro_seen else None
    session.commit()
    session.refresh(user)
    return to_user_out(user)


@router.post("/me/photo", response_model=UserOut)
async def upload_photo(
    request: Request,
    user: CurrentUser,
    session: Annotated[Session, Depends(get_db_session)],
    file: Annotated[UploadFile, File(description="JPG or PNG, up to PROFILE_PHOTO_MAX_MB")],
) -> UserOut:
    """Uploads or replaces your profile photo. The image is validated, resized and stripped of metadata."""
    service = _photo_service(request)
    content = await file.read(request.app.state.settings.profile_photo_max_bytes + 1)
    try:
        service.save(user, content)
    except ProfilePhotoError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error
    session.commit()
    session.refresh(user)
    return to_user_out(user)


@router.delete("/me/photo", response_model=UserOut)
def delete_photo(request: Request, user: CurrentUser, session: Annotated[Session, Depends(get_db_session)]) -> UserOut:
    """Removes your profile photo (the default avatar is shown instead)."""
    _photo_service(request).remove(user)
    session.commit()
    session.refresh(user)
    return to_user_out(user)


@router.get("/me/photo")
def get_photo(request: Request, user: CurrentUser) -> FileResponse:
    """Your own profile photo."""
    if not user.photo_storage_name:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No profile photo.")
    path = _photo_service(request).path(user.id, user.photo_storage_name)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No profile photo.")
    return FileResponse(path, media_type=user.photo_content_type or "image/jpeg", headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400"})
