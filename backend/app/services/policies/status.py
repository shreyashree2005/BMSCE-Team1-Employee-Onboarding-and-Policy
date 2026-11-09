"""Policy Assistant readiness: AI provider, retrieval system and knowledge base, summarised in one state."""

import threading
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from sqlalchemy.orm import Session

from app.schemas.policies import AssistantState, AssistantStatus, KnowledgeStatus, ProviderStatus
from app.services.llm.provider import ProviderCheck
from app.services.policies.repository import PolicyRepository

# A live provider check makes one outbound request; reuse the result briefly so the status endpoint can't be
# used to flood the provider, while a fixed configuration is still picked up within a minute.
CHECK_CACHE_SECONDS = 60
_check_lock = threading.Lock()


def _cached_provider_check(app: FastAPI, force: bool) -> ProviderCheck | None:
    llm = app.state.llm
    check = getattr(llm, "check_connection", None)
    if check is None:
        return None
    with _check_lock:
        cached: ProviderCheck | None = app.state.provider_check
        fresh = cached is not None and datetime.now(timezone.utc) - cached.checked_at < timedelta(seconds=CHECK_CACHE_SECONDS)
        if fresh and not force:
            return cached
        result = check()
        app.state.provider_check = result
        return result


def build_assistant_status(app: FastAPI, session: Session, *, check_provider: bool, force_check: bool = False) -> AssistantStatus:
    llm = app.state.llm
    documents = PolicyRepository(session).list_documents()
    ready = [d for d in documents if d.status == "ready"]
    processing = sum(d.status == "processing" for d in documents)
    failed = sum(d.status == "failed" for d in documents)
    expected = sum(d.chunk_count for d in ready)
    indexed = app.state.vector_store.size

    retrieval_error: str | None = app.state.retrieval_error
    if retrieval_error:
        knowledge_message = retrieval_error
    elif indexed != expected:
        # Happens when another API process (sharing this database) changed documents: each process keeps its own
        # in-memory index. Restarting this API (one instance only) rebuilds it from the database.
        knowledge_message = (
            f"The search index on this server has {indexed} passages but the database has {expected}. "
            "Restart the API (run only one instance) to rebuild the index."
        )
    else:
        knowledge_message = None
    retrieval_available = knowledge_message is None

    provider = ProviderStatus(configured=llm.is_configured, model=llm.model_name, host=getattr(llm, "host", None))
    if not llm.is_configured:
        provider.connection = "not_configured"
        provider.message = "No AI provider key is configured (LLM_API_KEY in backend/.env)."
    elif check_provider:
        result = _cached_provider_check(app, force_check)
        if result is not None:
            provider.connection = result.state
            provider.message = result.message
            provider.checked_at = result.checked_at

    state: AssistantState
    if not retrieval_available:
        state = "retrieval_unavailable"
    elif not llm.is_configured:
        state = "not_configured"
    elif provider.connection not in ("not_checked", "connected"):
        state = "provider_unreachable"
    elif processing:
        state = "indexing"
    elif not ready:
        state = "no_documents"
    else:
        state = "ready"

    return AssistantStatus(
        llm_configured=llm.is_configured,
        llm_model=llm.model_name,
        embedding_model=app.state.embedder.model_name,
        ready_documents=len(ready),
        state=state,
        provider=provider,
        knowledge=KnowledgeStatus(
            total_documents=len(documents),
            ready_documents=len(ready),
            processing_documents=processing,
            failed_documents=failed,
            indexed_passages=indexed,
            expected_passages=expected,
            retrieval_available=retrieval_available,
            message=knowledge_message,
        ),
    )
