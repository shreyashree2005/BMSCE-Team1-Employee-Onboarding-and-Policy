"""Password hashing and session tokens.

Passwords: scrypt (memory-hard KDF from the standard library) with a random 16-byte salt per password.
The stored format records the parameters so they can be raised later without breaking old hashes:
``scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>``.

Sessions: HS256-signed JWTs carrying the user ID, role, issue/expiry times and a unique ID. The token
only identifies the user; every request re-loads the user from the database, so role changes and
deactivation take effect immediately and a role claim can never grant extra rights.
"""

import base64
import hashlib
import hmac
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt

logger = logging.getLogger(__name__)

# ---- Passwords ----

SCRYPT_N = 2**14  # CPU/memory cost (~16 MB with r=8)
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16
KEY_BYTES = 32
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128  # bounds hashing cost for very long inputs
# A placeholder hash that can never match: used for accounts that must not log in (e.g. migrated legacy data).
UNUSABLE_PASSWORD = "!unusable"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise ValueError(f"Passwords must be {MIN_PASSWORD_LENGTH}-{MAX_PASSWORD_LENGTH} characters long")
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=KEY_BYTES)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Constant-time check. Malformed or unusable hashes simply fail."""
    try:
        scheme, n, r, p, salt, expected = stored_hash.split("$")
        if scheme != "scrypt" or len(password) > MAX_PASSWORD_LENGTH:
            return False
        digest = hashlib.scrypt(password.encode("utf-8"), salt=_unb64(salt), n=int(n), r=int(r), p=int(p), dklen=len(_unb64(expected)))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, _unb64(expected))


def is_usable_password_hash(stored_hash: str) -> bool:
    return stored_hash.startswith("scrypt$")


# A real hash computed once, so failed logins for unknown emails take as long as for real accounts.
_TIMING_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def verify_dummy_password(password: str) -> None:
    verify_password(password, _TIMING_DUMMY_HASH)


# ---- Session tokens ----

TOKEN_ISSUER = "onboardiq"
TOKEN_ALGORITHM = "HS256"


class InvalidTokenError(Exception):
    """The token is missing, malformed, expired, tampered with or otherwise unacceptable."""


@dataclass(frozen=True)
class TokenClaims:
    user_id: int
    role: str
    expires_at: datetime
    session_version: int = 0


def create_access_token(
    *, user_id: int, role: str, secret: str, expires_minutes: int, session_version: int = 0, now: datetime | None = None
) -> tuple[str, datetime]:
    issued = now or datetime.now(timezone.utc)
    expires = issued + timedelta(minutes=expires_minutes)
    payload = {
        "sub": str(user_id), "role": role, "ver": session_version, "iss": TOKEN_ISSUER,
        "iat": issued, "nbf": issued, "exp": expires, "jti": uuid.uuid4().hex,
    }  # fmt: skip
    return jwt.encode(payload, secret, algorithm=TOKEN_ALGORITHM), expires


def decode_access_token(token: str, secret: str) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[TOKEN_ALGORITHM],  # pinned: rejects "none" and algorithm-confusion attacks
            issuer=TOKEN_ISSUER,
            options={"require": ["sub", "role", "exp", "iat", "iss"]},
        )
        return TokenClaims(
            user_id=int(payload["sub"]),
            role=str(payload["role"]),
            expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc),
            session_version=int(payload.get("ver", 0)),
        )
    except (jwt.PyJWTError, ValueError, TypeError) as error:
        raise InvalidTokenError(str(error)) from error


def resolve_jwt_secret(configured: str | None, storage_dir: Path, *, production: bool) -> str:
    """
    Returns the signing secret. Production must configure one (enforced by Settings). In development a random
    secret is generated once and stored (gitignored) so sessions survive restarts without a hardcoded key.
    """
    if configured:
        return configured
    if production:  # pragma: no cover - Settings validation prevents this
        raise RuntimeError("JWT_SECRET_KEY is required in production")
    secret_file = storage_dir / "dev-jwt-secret"
    try:
        if secret_file.exists():
            stored = secret_file.read_text(encoding="utf-8").strip()
            if len(stored) >= 32:
                return stored
        storage_dir.mkdir(parents=True, exist_ok=True)
        secret = secrets.token_urlsafe(48)
        secret_file.write_text(secret, encoding="utf-8")
        logger.warning("JWT_SECRET_KEY is not set: generated a development signing secret at %s", secret_file)
        return secret
    except OSError:
        logger.warning("Could not persist a development JWT secret; sessions will reset when the API restarts.")
        return secrets.token_urlsafe(48)
