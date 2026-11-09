"""Application settings, loaded from environment variables or a local .env file."""

from datetime import date
from functools import lru_cache
from pathlib import Path

from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[2]
# Default local database: a SQLite file in the backend folder, independent of the working directory.
_DEFAULT_SQLITE_PATH = _BACKEND_DIR / "onboardiq.db"
# Well-known demo password: only acceptable for local development (refused in production, see validation below).
DEFAULT_DEMO_PASSWORD = "OnboardIQ-Demo-2026"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "OnboardIQ API"
    app_version: str = "0.1.0"
    environment: str = "development"
    # Set as a JSON list in the environment, e.g. CORS_ORIGINS=["http://localhost:5173"]
    cors_origins: list[str] = Field(default=["http://localhost:5173", "http://127.0.0.1:5173"])
    # "Today" for due-date and overdue calculations. Leave unset to use the real date;
    # set it (e.g. REFERENCE_DATE=2026-11-07) to keep demo data looking the same on any day.
    reference_date: date | None = None
    # SQLAlchemy URL. PostgreSQL example: postgresql+psycopg://user:password@localhost:5432/onboardiq
    database_url: str = f"sqlite:///{_DEFAULT_SQLITE_PATH.as_posix()}"
    # Create demo users (1 HR, several employees) and their onboarding checklists on startup if missing.
    # Never overwrites existing users or task progress. Disable in production.
    seed_demo_data: bool = True

    # ---- Authentication ----
    # Secret used to sign session tokens (HS256). REQUIRED in production (32+ characters).
    # In development, a random secret is generated once and kept in the storage folder so sessions survive restarts.
    jwt_secret_key: SecretStr | None = None
    access_token_expire_minutes: int = Field(default=480, ge=5, le=60 * 24 * 7)
    session_cookie_name: str = "onboardiq_session"
    # Send the session cookie only over HTTPS. Must be true in production.
    cookie_secure: bool = False
    # Password for the seeded demo accounts. Change it (or disable SEED_DEMO_DATA) anywhere outside local development.
    demo_user_password: SecretStr = SecretStr(DEFAULT_DEMO_PASSWORD)
    # Failed logins allowed per email+client within the window before further attempts are refused (HTTP 429).
    login_max_failed_attempts: int = Field(default=5, ge=1, le=100)
    login_lockout_minutes: int = Field(default=15, ge=1, le=24 * 60)
    # Public employee self-registration (always creates Employee accounts, never HR). Disable to manage accounts centrally.
    allow_self_registration: bool = True
    # Registration attempts allowed per client address per hour (HTTP 429 beyond that).
    registration_max_per_hour: int = Field(default=10, ge=1, le=1000)
    # Interactive API docs at /docs. Consider disabling in production.
    enable_api_docs: bool = True

    # ---- Password reset & email ----
    # Where reset links point (the web app's address).
    frontend_base_url: str = "http://localhost:5173"
    password_reset_minutes: int = Field(default=30, ge=5, le=24 * 60)
    # Reset requests allowed per email+client per hour (HTTP 429 beyond that; the response never reveals accounts).
    password_reset_max_per_hour: int = Field(default=5, ge=1, le=100)
    # "file": write emails to MAIL_OUTBOX_DIR and log them (local development, no mail server needed).
    # "smtp": send through SMTP_HOST. Use smtp anywhere real people need to receive the emails.
    mail_backend: str = Field(default="file", pattern="^(file|smtp)$")
    mail_from: str = "OnboardIQ <no-reply@onboardiq-demo.example>"
    mail_outbox_dir: Path = _BACKEND_DIR / "storage" / "outbox"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = True

    # ---- Employee records ----
    # Documents employees upload for onboarding tasks (one folder per employee).
    employee_documents_dir: Path = _BACKEND_DIR / "storage" / "employee-documents"
    employee_document_max_mb: float = Field(default=5, gt=0, le=25)
    # Key for encrypting bank account numbers (Fernet key: 32 url-safe base64 bytes). Required in production;
    # in development one is generated once and stored in the storage folder (gitignored).
    data_encryption_key: SecretStr | None = None
    # Profile photos (JPG/PNG, checked by content) and Help Desk attachments, one folder per user.
    profile_photos_dir: Path = _BACKEND_DIR / "storage" / "profile-photos"
    profile_photo_max_mb: float = Field(default=2, gt=0, le=10)
    helpdesk_attachments_dir: Path = _BACKEND_DIR / "storage" / "helpdesk"
    helpdesk_attachment_max_mb: float = Field(default=5, gt=0, le=25)

    # ---- Work calendar ----
    # Weekly days off (the demo Leave Policy defines Monday-Friday working days), and the company holiday list
    # (JSON: [{"date": "2026-11-10", "name": "...", "type": "festival"|"company"}]). Due dates never land on them.
    weekly_off_days: list[Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]] = Field(
        default=["saturday", "sunday"]
    )
    company_holidays_file: Path = _BACKEND_DIR / "app" / "data" / "company_holidays.json"

    # ---- Policy understanding quizzes ----
    # Percentage needed to pass a policy understanding quiz (e.g. 80 = 4 of 5 correct).
    policy_quiz_pass_percent: int = Field(default=80, ge=1, le=100)

    # ---- Policy documents (ingestion & retrieval) ----
    # Uploaded files and the FAISS index are stored here.
    policy_storage_dir: Path = _BACKEND_DIR / "storage" / "policies"
    policy_max_upload_mb: float = Field(default=10, gt=0, le=100)
    # Chunk size/overlap in characters (~500 chars is about 80-100 words). Measured on the sample policies,
    # 500 gave more focused matches than 800 with all-MiniLM-L6-v2 (which reads at most 256 tokens anyway).
    policy_chunk_size: int = Field(default=500, ge=200, le=4000)
    policy_chunk_overlap: int = Field(default=100, ge=0, le=1000)
    # "sentence-transformers" (default) or "hashing" (deterministic lexical embeddings for tests/offline use).
    embedding_provider: Literal["sentence-transformers", "hashing"] = "sentence-transformers"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # ---- Policy Assistant (LLM over retrieved passages) ----
    # Any OpenAI-compatible Chat Completions API: OpenAI, Azure OpenAI gateways, Groq, OpenRouter, Ollama, LM Studio...
    llm_api_key: SecretStr | None = None
    llm_model: str = "gpt-4o-mini"
    llm_base_url: str = "https://api.openai.com/v1"
    llm_timeout_seconds: float = Field(default=45, gt=0, le=300)
    llm_temperature: float = Field(default=0.1, ge=0, le=1)
    llm_max_tokens: int = Field(default=600, ge=50, le=4000)
    # Local servers only (e.g. Ollama): how long the model stays loaded after a request. Ollama's own default is 5
    # minutes, after which the next question pays for reloading the model. Never sent to hosted APIs.
    llm_keep_alive: str | None = "30m"
    # Level of the API's own log lines (e.g. the Policy Assistant's per-stage timings at INFO).
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    # Load the embedding model and (for a local LLM server) the LLM in the background at startup, so the first
    # question doesn't wait for them.
    warm_up_models: bool = True
    # Passages sent to the LLM, and the similarity thresholds used to judge evidence quality.
    # Defaults are calibrated for all-MiniLM-L6-v2 cosine scores on the sample policies.
    rag_top_k: int = Field(default=5, ge=1, le=10)
    rag_min_relevance: float = Field(default=0.30, ge=-1, le=1)
    rag_strong_relevance: float = Field(default=0.55, ge=-1, le=1)

    @model_validator(mode="after")
    def _check_chunking(self) -> "Settings":
        if self.policy_chunk_overlap >= self.policy_chunk_size:
            raise ValueError("POLICY_CHUNK_OVERLAP must be smaller than POLICY_CHUNK_SIZE")
        if self.rag_strong_relevance <= self.rag_min_relevance:
            raise ValueError("RAG_STRONG_RELEVANCE must be greater than RAG_MIN_RELEVANCE")
        if self.is_production:
            problems = []
            if self.jwt_secret_key is None or len(self.jwt_secret_key.get_secret_value()) < 32:
                problems.append("JWT_SECRET_KEY must be set to a random value of at least 32 characters")
            if not self.cookie_secure:
                problems.append("COOKIE_SECURE must be true (session cookies over HTTPS only)")
            if self.seed_demo_data and self.demo_user_password.get_secret_value() == DEFAULT_DEMO_PASSWORD:
                problems.append("SEED_DEMO_DATA must be false, or DEMO_USER_PASSWORD changed from the default")
            if self.data_encryption_key is None:
                problems.append("DATA_ENCRYPTION_KEY must be set (encrypts bank account numbers)")
            if problems:
                raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        if self.mail_backend == "smtp" and not self.smtp_host:
            raise ValueError("MAIL_BACKEND=smtp requires SMTP_HOST")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    @property
    def policy_max_upload_bytes(self) -> int:
        return int(self.policy_max_upload_mb * 1024 * 1024)

    @property
    def employee_document_max_bytes(self) -> int:
        return int(self.employee_document_max_mb * 1024 * 1024)

    @property
    def profile_photo_max_bytes(self) -> int:
        return int(self.profile_photo_max_mb * 1024 * 1024)

    @property
    def helpdesk_attachment_max_bytes(self) -> int:
        return int(self.helpdesk_attachment_max_mb * 1024 * 1024)

    def today(self) -> date:
        return self.reference_date or date.today()


@lru_cache
def get_settings() -> Settings:
    return Settings()
