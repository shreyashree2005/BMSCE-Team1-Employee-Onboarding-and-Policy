"""Password hashing, session tokens, login rate limiting and production configuration checks."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import DEFAULT_DEMO_PASSWORD, Settings
from app.core.rate_limit import LoginAttemptLimiter
from app.core.security import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    is_usable_password_hash,
    resolve_jwt_secret,
    verify_password,
)

SECRET = "a-test-signing-secret-that-is-long-enough-0123456789"


def test_password_hashes_are_salted_and_verifiable() -> None:
    first, second = hash_password("correct horse battery"), hash_password("correct horse battery")
    assert first != second  # unique salt per hash
    assert "correct horse battery" not in first
    assert first.startswith("scrypt$")
    assert verify_password("correct horse battery", first)
    assert not verify_password("Correct horse battery", first)


@pytest.mark.parametrize("stored", ["", "!unusable", "plaintext-password", "scrypt$1$2", "scrypt$x$8$1$abc$def", "md5$abc"])
def test_malformed_or_unusable_hashes_never_verify(stored: str) -> None:
    assert not verify_password("plaintext-password", stored)
    assert not is_usable_password_hash(stored) or stored.startswith("scrypt$")


def test_tokens_round_trip_and_carry_expiry() -> None:
    token, expires = create_access_token(user_id=7, role="hr", secret=SECRET, expires_minutes=10)
    claims = decode_access_token(token, SECRET)
    assert (claims.user_id, claims.role) == (7, "hr")
    assert abs((claims.expires_at - expires).total_seconds()) < 1


def test_expired_and_foreign_tokens_are_rejected() -> None:
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    expired, _ = create_access_token(user_id=1, role="employee", secret=SECRET, expires_minutes=5, now=past)
    with pytest.raises(InvalidTokenError):
        decode_access_token(expired, SECRET)
    token, _ = create_access_token(user_id=1, role="employee", secret=SECRET, expires_minutes=5)
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, SECRET + "-other")


def test_development_secret_is_generated_once_and_reused(tmp_path: Path) -> None:
    first = resolve_jwt_secret(None, tmp_path, production=False)
    assert len(first) >= 32
    assert resolve_jwt_secret(None, tmp_path, production=False) == first
    assert resolve_jwt_secret("configured-secret", tmp_path, production=False) == "configured-secret"


def test_login_limiter_locks_after_max_failures_and_resets() -> None:
    limiter = LoginAttemptLimiter(max_failures=2, window_seconds=60)
    assert limiter.retry_after("k") == 0
    limiter.record_failure("k")
    assert limiter.retry_after("k") == 0
    limiter.record_failure("k")
    assert 0 < limiter.retry_after("k") <= 60
    assert limiter.retry_after("other") == 0
    limiter.reset("k")
    assert limiter.retry_after("k") == 0


def _production(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "production",
        "database_url": "sqlite://",
        "jwt_secret_key": SecretStr("p" * 40),
        "cookie_secure": True,
        "seed_demo_data": False,
        "data_encryption_key": SecretStr("Zm9yLXRlc3RzLW9ubHktMzItYnl0ZXMta2V5LTEyMzQ="),
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type,call-arg]


def test_safe_production_configuration_is_accepted() -> None:
    assert _production().is_production


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"jwt_secret_key": None}, "JWT_SECRET_KEY"),
        ({"jwt_secret_key": SecretStr("short")}, "JWT_SECRET_KEY"),
        ({"cookie_secure": False}, "COOKIE_SECURE"),
        ({"data_encryption_key": None}, "DATA_ENCRYPTION_KEY"),
        ({"seed_demo_data": True, "demo_user_password": SecretStr(DEFAULT_DEMO_PASSWORD)}, "demo"),
    ],
)
def test_unsafe_production_configuration_is_refused(overrides: dict, message: str) -> None:
    with pytest.raises(ValidationError) as error:
        _production(**overrides)
    assert message.lower() in str(error.value).lower()
