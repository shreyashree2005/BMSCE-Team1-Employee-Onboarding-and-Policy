"""Password strength rules for new accounts (mirrored in frontend/src/utils/validation.ts).

Rules: 10-128 characters, at least one lowercase letter, one uppercase letter and one number, and not
built from the person's name, their email address or a well-known weak password.
"""

import re

from app.core.security import MAX_PASSWORD_LENGTH

MIN_NEW_PASSWORD_LENGTH = 10

# Lowercased fragments that make a password trivially guessable.
_WEAK_FRAGMENTS = ("password", "passw0rd", "qwerty", "123456", "letmein", "welcome", "onboardiq", "iloveyou", "abc123")


def password_problems(password: str, *, email: str = "", full_name: str = "") -> list[str]:
    """User-facing reasons the password is too weak (empty when it's acceptable)."""
    problems: list[str] = []
    if len(password) < MIN_NEW_PASSWORD_LENGTH:
        problems.append(f"Use at least {MIN_NEW_PASSWORD_LENGTH} characters.")
    if len(password) > MAX_PASSWORD_LENGTH:
        problems.append(f"Use at most {MAX_PASSWORD_LENGTH} characters.")
    if not re.search(r"[a-z]", password):
        problems.append("Include a lowercase letter.")
    if not re.search(r"[A-Z]", password):
        problems.append("Include an uppercase letter.")
    if not re.search(r"\d", password):
        problems.append("Include a number.")

    lowered = password.lower()
    personal = [part for part in re.split(r"[\s@._+-]+", f"{full_name} {email.split('@')[0]}".lower()) if len(part) >= 3]
    if any(part in lowered for part in personal):
        problems.append("Don't include your name or email address.")
    elif any(fragment in lowered for fragment in _WEAK_FRAGMENTS):
        problems.append("Avoid common passwords and words like “password”.")
    return problems
