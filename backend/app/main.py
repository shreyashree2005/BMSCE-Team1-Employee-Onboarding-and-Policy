import logging
import threading
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.rate_limit import LoginAttemptLimiter
from app.core.encryption import DataCipher, resolve_data_key
from app.core.security import resolve_jwt_secret
from app.services.mail import create_mailer
from app.services.work_calendar import calendar_from_settings
from app.services.helpdesk import HelpDeskError
from app.services.task_actions import TaskActionError
from app.db.init_db import initialize_database
from app.db.session import create_db_engine, create_session_factory
from app.services.llm.provider import LLMProvider, create_llm_provider
from app.services.policies.assistant import SYSTEM_PROMPT
from app.services.policies.embeddings import Embedder, create_embedder
from app.services.policies.errors import PolicyServiceError
from app.services.policies.file_storage import PolicyFileStorage
from app.services.policies.service import IngestionConfig, PolicyDocumentService
from app.services.policies.vector_store import FaissVectorStore

logger = logging.getLogger(__name__)


def _configure_logging(level: str) -> None:
    """
    Uvicorn configures only its own loggers, so the API's INFO lines (startup, Policy Assistant timings) were never
    shown. Adds one console handler to the ``app`` logger unless the host application already configured logging.
    """
    app_logger = logging.getLogger("app")
    app_logger.setLevel(level)
    if app_logger.handlers or logging.getLogger().handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    app_logger.addHandler(handler)


def _warm_up_models(embedder: Embedder, llm: LLMProvider) -> None:
    """
    Runs in a background thread at startup: loads the embedding model (about 15 s on first use) and, for a local LLM
    server, loads the model and processes the fixed system prompt, so neither cost falls on the first question.
    A question asked meanwhile simply waits for the embedding model's load lock.
    """
    started = time.perf_counter()
    try:
        embedder.embed(["warm-up"])
        logger.info("Embedding model %s ready in %.1fs", embedder.model_name, time.perf_counter() - started)
    except Exception:  # noqa: BLE001 - reported again, with a user-facing message, when a search needs the model
        logger.warning("Embedding model warm-up failed; it will be loaded on first use.", exc_info=True)
    warm_up = getattr(llm, "warm_up", None)
    if callable(warm_up):
        llm_started = time.perf_counter()
        if warm_up(SYSTEM_PROMPT):
            logger.info("LLM %s loaded and system prompt cached in %.1fs", llm.model_name, time.perf_counter() - llm_started)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    _configure_logging(settings.log_level)
    # Creating the engine doesn't connect yet; connections open on first use.
    engine = create_db_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    # Shared across requests: the embedding model is loaded lazily, the FAISS index is loaded at startup.
    embedder = create_embedder(settings.embedding_provider, settings.embedding_model)
    vector_store = FaissVectorStore(settings.policy_storage_dir / "index", embedder.model_name)
    policy_files = PolicyFileStorage(settings.policy_storage_dir / "files")
    jwt_secret = resolve_jwt_secret(
        settings.jwt_secret_key.get_secret_value() if settings.jwt_secret_key else None,
        settings.policy_storage_dir.parent,
        production=settings.is_production,
    )
    login_limiter = LoginAttemptLimiter(settings.login_max_failed_attempts, settings.login_lockout_minutes * 60)
    registration_limiter = LoginAttemptLimiter(settings.registration_max_per_hour, 60 * 60)
    password_reset_limiter = LoginAttemptLimiter(settings.password_reset_max_per_hour, 60 * 60)
    data_cipher = DataCipher(
        resolve_data_key(
            settings.data_encryption_key.get_secret_value() if settings.data_encryption_key else None,
            settings.policy_storage_dir.parent,
            production=settings.is_production,
        )
    )
    llm = create_llm_provider(
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        base_url=settings.llm_base_url,
        timeout_seconds=settings.llm_timeout_seconds,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        keep_alive=settings.llm_keep_alive,
    )

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        with session_factory() as session:
            initialize_database(
                engine, session, seed_demo_data_enabled=settings.seed_demo_data, demo_password=settings.demo_user_password.get_secret_value(),
                calendar=application.state.work_calendar,
            )
        with session_factory() as session:
            ingestion = IngestionConfig(settings.policy_max_upload_bytes, settings.policy_chunk_size, settings.policy_chunk_overlap)
            try:
                PolicyDocumentService(session, embedder, vector_store, policy_files, ingestion).reconcile_index()
                application.state.retrieval_error = None
            except PolicyServiceError as error:
                # e.g. the embedding model can't be downloaded: keep serving onboarding; search reports 503 until fixed.
                logger.error("Policy vector index could not be prepared: %s", error.detail)
                application.state.retrieval_error = error.detail
        if llm.is_configured:
            logger.info("Policy Assistant LLM: %s via %s", llm.model_name, getattr(llm, "host", "configured provider"))
        else:
            logger.warning("LLM_API_KEY is not set: the Policy Assistant chat will report that it isn't configured.")
        if settings.warm_up_models:
            threading.Thread(target=_warm_up_models, args=(embedder, llm), name="model-warm-up", daemon=True).start()
        yield
        close = getattr(llm, "close", None)
        if callable(close):
            close()
        engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Backend for OnboardIQ, an AI-powered employee onboarding and policy knowledge assistant.",
        lifespan=lifespan,
        docs_url="/docs" if settings.enable_api_docs else None,
        redoc_url="/redoc" if settings.enable_api_docs else None,
        openapi_url="/openapi.json" if settings.enable_api_docs else None,
    )
    app.state.settings = settings
    app.state.session_factory = session_factory
    app.state.embedder = embedder
    app.state.vector_store = vector_store
    app.state.policy_files = policy_files
    app.state.llm = llm
    app.state.jwt_secret = jwt_secret
    app.state.login_limiter = login_limiter
    app.state.retrieval_error = None
    app.state.provider_check = None  # cached live connectivity check (see policies/status.py)
    app.state.registration_limiter = registration_limiter
    app.state.password_reset_limiter = password_reset_limiter
    app.state.mailer = create_mailer(settings)
    app.state.data_cipher = data_cipher
    app.state.work_calendar = calendar_from_settings(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    )

    @app.middleware("http")
    async def record_arrival(request: Request, call_next):  # noqa: ANN001, ANN202
        # Lets slow endpoints (the Policy Assistant) log how long authentication and setup took before the handler.
        request.state.received_at = time.perf_counter()
        return await call_next(request)

    @app.exception_handler(SQLAlchemyError)
    async def database_error_handler(_: Request, error: SQLAlchemyError) -> JSONResponse:
        # Log the details server-side; never leak SQL or connection strings to clients.
        logger.exception("Database error", exc_info=error)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "The database is temporarily unavailable. Please try again shortly."},
        )

    @app.exception_handler(TaskActionError)
    async def task_action_error_handler(_: Request, error: TaskActionError) -> JSONResponse:
        return JSONResponse(status_code=error.status_code, content={"detail": error.message, "code": error.code, "fields": error.fields})

    @app.exception_handler(HelpDeskError)
    async def helpdesk_error_handler(_: Request, error: HelpDeskError) -> JSONResponse:
        return JSONResponse(status_code=error.status_code, content={"detail": error.message, "fields": error.fields})

    @app.exception_handler(PolicyServiceError)
    async def policy_error_handler(_: Request, error: PolicyServiceError) -> JSONResponse:
        return JSONResponse(status_code=error.status_code, content={"detail": error.detail, "code": error.code})

    app.include_router(api_router)
    return app


app = create_app()
