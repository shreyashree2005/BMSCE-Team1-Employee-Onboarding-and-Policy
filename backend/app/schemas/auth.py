"""Authentication schemas (camelCase JSON). Password hashes are never part of any response model."""

import re
from datetime import date, datetime
from enum import Enum

from pydantic import ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from app.core.password_policy import password_problems
from app.data.job_roles import JobRole
from app.schemas.onboarding import CamelModel


class UserRole(str, Enum):
    EMPLOYEE = "employee"
    HR = "hr"


class LoginRequest(CamelModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("Enter a valid email address")
        return value


_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
_NAME_PATTERN = re.compile(r"^[^\W\d_]+(?:[ '.-][^\W\d_]+)*\.?$")


class RegisterRequest(CamelModel):
    """Public employee self-registration. The role is never accepted from the client: unknown fields are rejected."""

    # Passwords are used exactly as typed; only the name and email are trimmed (in their validators).
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    # The name is sent either as separate parts (firstName, optional middleName, lastName: the sign-up form) or as one
    # fullName (older clients). Either way the validator below sets full_name, first_name and last_name. There's no
    # middle-name column: the middle name is kept as part of full_name ("First Middle Last").
    full_name: str | None = Field(default=None, max_length=200)
    first_name: str | None = Field(default=None, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    confirm_password: str = Field(min_length=1, max_length=128)
    # The employee's job function; it decides the onboarding checklist and never grants access rights.
    job_role: JobRole

    @field_validator("full_name", "first_name", "middle_name", "last_name")
    @classmethod
    def _tidy_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = re.sub(r"\s+", " ", value).strip()
        return value or None

    @model_validator(mode="after")
    def _combine_name(self) -> "RegisterRequest":
        parts_given = any(part is not None for part in (self.first_name, self.middle_name, self.last_name))
        if parts_given:
            if self.full_name is not None:
                raise ValueError("Send either the name parts or fullName, not both")
            if not self.first_name:
                raise ValueError("Enter your first name")
            if not self.last_name:
                raise ValueError("Enter your last name")
            for label, part in (("first name", self.first_name), ("middle name", self.middle_name), ("last name", self.last_name)):
                if part is not None and not _NAME_PATTERN.fullmatch(part):
                    raise ValueError(f"Enter your {label} using letters only")
            self.full_name = " ".join(part for part in (self.first_name, self.middle_name, self.last_name) if part)
        else:
            if not self.full_name or len(self.full_name) < 2:
                raise ValueError("Enter your full name")
            if not _NAME_PATTERN.fullmatch(self.full_name):
                raise ValueError("Enter your full name using letters only")
            if " " not in self.full_name:
                raise ValueError("Enter your first and last name")
            self.first_name, _, self.last_name = self.full_name.partition(" ")
        if len(self.full_name) > 200:
            raise ValueError("Your full name can be at most 200 characters")
        return self

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not _EMAIL_PATTERN.fullmatch(value):
            raise ValueError("Enter a valid email address")
        return value

    @model_validator(mode="after")
    def _check_passwords(self) -> "RegisterRequest":
        if self.password != self.confirm_password:
            raise ValueError("Passwords don't match")
        problems = password_problems(self.password, email=self.email, full_name=self.full_name or "")
        if problems:
            raise ValueError("Password is too weak: " + " ".join(problems))
        return self


class EmployeeProfileOut(CamelModel):
    first_name: str
    last_name: str
    job_title: str
    department: str
    location: str
    start_date: date
    manager_name: str | None
    buddy_name: str | None
    job_role: str | None = None
    job_role_label: str | None = None


class UserOut(CamelModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    profile: EmployeeProfileOut | None = None
    # Relative URL of the profile photo (versioned so browsers refresh after a change), or null for the default avatar.
    photo_url: str | None = None
    # First-visit guidance already finished or dismissed ("Don't show this again").
    tour_completed: bool = False
    company_intro_seen: bool = False


class PreferencesUpdate(CamelModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    tour_completed: bool | None = None
    company_intro_seen: bool | None = None


class SessionOut(CamelModel):
    user: UserOut
    expires_at: datetime


class ForgotPasswordRequest(CamelModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not _EMAIL_PATTERN.fullmatch(value):
            raise ValueError("Enter a valid email address")
        return value


class ResetTokenRequest(CamelModel):
    token: str = Field(min_length=20, max_length=200)


class ResetTokenStatus(CamelModel):
    valid: bool
    email_hint: str | None = None


class ResetPasswordRequest(CamelModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=1, max_length=128)
    confirm_password: str = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def _check_match(self) -> "ResetPasswordRequest":
        if self.password != self.confirm_password:
            raise ValueError("Passwords don't match")
        return self


class MessageOut(CamelModel):
    message: str
