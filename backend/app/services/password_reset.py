"""Password reset by emailed, single-use link.

- Tokens are 256-bit random values; only their SHA-256 hash is stored, so a database leak doesn't expose usable links.
- A token expires after PASSWORD_RESET_MINUTES and works once; requesting a new link invalidates older ones.
- Requests never reveal whether an account exists (same response, same work).
- A successful reset bumps the user's session version, which signs out every existing session.
"""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.password_policy import password_problems
from app.core.security import hash_password
from app.db.models import PasswordResetTokenRecord, UserRecord
from app.services.mail import Mailer, OutgoingEmail

logger = logging.getLogger(__name__)


class InvalidResetTokenError(Exception):
    pass


class WeakPasswordError(ValueError):
    pass


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)  # SQLite returns naive UTC


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:1]}{'*' * max(len(local) - 1, 2)}@{domain}"


def request_password_reset(session: Session, email: str, settings: Settings, mailer: Mailer, now: datetime | None = None) -> None:
    """Emails a reset link if an active account has this email. Silent otherwise (no account enumeration)."""
    now = now or datetime.now(timezone.utc)
    user = session.scalars(select(UserRecord).where(UserRecord.email == email)).first()
    if user is None or not user.is_active:
        logger.info("Password reset requested for an unknown or inactive email")
        return

    session.execute(delete(PasswordResetTokenRecord).where(PasswordResetTokenRecord.user_id == user.id, PasswordResetTokenRecord.used_at.is_(None)))
    token = secrets.token_urlsafe(32)
    session.add(PasswordResetTokenRecord(user_id=user.id, token_hash=_hash(token), expires_at=now + timedelta(minutes=settings.password_reset_minutes)))
    session.commit()

    link = f"{settings.frontend_base_url.rstrip('/')}/reset-password?token={token}"
    text = (
        f"Hi {user.full_name},\n\n"
        "We received a request to reset the password for your OnboardIQ account.\n\n"
        f"Reset your password: {link}\n\n"
        f"This link works once and expires in {settings.password_reset_minutes} minutes. "
        "If you didn't ask for this, you can ignore this email; your password won't change.\n\n"
        "OnboardIQ (fictional demo workspace)"
    )
    try:
        mailer.send(OutgoingEmail(to=user.email, subject="Reset your OnboardIQ password", text=text))
    except Exception:  # noqa: BLE001 - delivery problems must not reveal whether the account exists
        logger.exception("Password reset email could not be sent")


def _valid_token(session: Session, token: str, now: datetime) -> PasswordResetTokenRecord:
    record = session.scalars(select(PasswordResetTokenRecord).where(PasswordResetTokenRecord.token_hash == _hash(token))).first()
    if record is None or record.used_at is not None or _aware(record.expires_at) <= now:
        raise InvalidResetTokenError
    user = session.get(UserRecord, record.user_id)
    if user is None or not user.is_active:
        raise InvalidResetTokenError
    return record


def check_reset_token(session: Session, token: str, now: datetime | None = None) -> str:
    """Returns the masked email for a usable token; raises InvalidResetTokenError otherwise."""
    record = _valid_token(session, token, now or datetime.now(timezone.utc))
    return mask_email(session.get(UserRecord, record.user_id).email)


def reset_password(session: Session, token: str, new_password: str, now: datetime | None = None) -> UserRecord:
    now = now or datetime.now(timezone.utc)
    record = _valid_token(session, token, now)
    user = session.get(UserRecord, record.user_id)
    problems = password_problems(new_password, email=user.email, full_name=user.full_name)
    if problems:
        raise WeakPasswordError("Password is too weak: " + " ".join(problems))
    user.password_hash = hash_password(new_password)
    user.session_version = (user.session_version or 0) + 1  # signs out every existing session
    record.used_at = now
    session.execute(delete(PasswordResetTokenRecord).where(PasswordResetTokenRecord.user_id == user.id, PasswordResetTokenRecord.id != record.id))
    session.commit()
    logger.info("Password reset completed for user id %s", user.id)
    return user
