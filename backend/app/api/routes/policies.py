"""Policy document ingestion, semantic search and the retrieval-augmented Policy Assistant chat.

Every route requires a signed-in user. Reading documents, searching and the assistant are open to both
roles; uploading and deleting documents is HR-only (employees get 403).
"""

import asyncio
import json
import logging
import threading
import time
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user, require_roles
from app.db.models import UserRecord
from app.db.session import get_db_session
from app.schemas.policy_quiz import AnswerQuizOut, AnswerQuizRequest, AnswerQuizSubmission, PolicyQuizOut, PolicyQuizResult, PolicyQuizSubmission, PolicyQuizSummary
from app.services.policy_quiz import PolicyQuizError, PolicyQuizService
from app.services.task_actions import TaskActionService
from app.schemas.auth import UserRole
from app.schemas.policies import (
    AssistantStatus,
    PolicyChatRequest,
    PolicyChatResponse,
    PolicyDocument,
    PolicyDocumentDetail,
    PolicySearchRequest,
    PolicySearchResponse,
)
from app.services.llm.errors import LLMTimeoutError
from app.services.policies.assistant import EvidenceThresholds, PolicyAssistantService, PreparedAnswer
from app.services.policies.errors import FileTooLargeError, PolicyServiceError
from app.services.policies.service import IngestionConfig, PolicyDocumentService
from app.services.policies.status import build_assistant_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/policies", tags=["policies"], dependencies=[Depends(get_current_user)])

HR_ONLY = [Depends(require_roles(UserRole.HR))]


def get_policy_service(request: Request, session: Annotated[Session, Depends(get_db_session)]) -> PolicyDocumentService:
    state = request.app.state
    settings = state.settings
    return PolicyDocumentService(
        session=session,
        embedder=state.embedder,
        vector_store=state.vector_store,
        file_storage=state.policy_files,
        config=IngestionConfig(
            max_upload_bytes=settings.policy_max_upload_bytes,
            chunk_size=settings.policy_chunk_size,
            chunk_overlap=settings.policy_chunk_overlap,
        ),
    )


Service = Annotated[PolicyDocumentService, Depends(get_policy_service)]


@router.post("/documents", response_model=PolicyDocument, status_code=status.HTTP_201_CREATED, dependencies=HR_ONLY)
def upload_document(service: Service, request: Request, file: Annotated[UploadFile, File(description="PDF, DOCX or TXT policy document")]) -> PolicyDocument:
    """Uploads a policy document, extracts and chunks its text, and indexes it for semantic search."""
    max_bytes: int = request.app.state.settings.policy_max_upload_bytes
    # Read at most one byte past the limit so oversized uploads are rejected without loading them fully.
    content = file.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise FileTooLargeError(f"The file is larger than the {max_bytes // (1024 * 1024)} MB limit.")
    record = service.ingest(file.filename, content)
    return PolicyDocument.model_validate(record, from_attributes=True)


@router.get("/documents", response_model=list[PolicyDocument])
def list_documents(service: Service) -> list[PolicyDocument]:
    return [PolicyDocument.model_validate(record, from_attributes=True) for record in service.list_documents()]


@router.get("/documents/{document_id}", response_model=PolicyDocumentDetail)
def get_document(document_id: str, service: Service) -> PolicyDocumentDetail:
    """Document metadata plus its extracted chunks with page/section information."""
    return PolicyDocumentDetail.model_validate(service.get_document(document_id), from_attributes=True)


_FILE_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain; charset=utf-8",
}


@router.get("/documents/{document_id}/file")
def get_document_file(document_id: str, service: Service, request: Request) -> FileResponse:
    """The original policy file, for reading in the browser (e.g. policy acknowledgment tasks)."""
    document = service.get_document(document_id)
    path = request.app.state.policy_files.path_for(document.storage_name)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The policy file is no longer available.")
    file_type = getattr(document.file_type, "value", document.file_type)
    return FileResponse(
        path,
        media_type=_FILE_MEDIA_TYPES[file_type],
        filename=document.filename,
        content_disposition_type="inline",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=HR_ONLY)
def delete_document(document_id: str, service: Service) -> Response:
    """Deletes the document, its chunks, its vectors and the stored file."""
    service.delete(document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/search", response_model=PolicySearchResponse)
def search_policies(search: PolicySearchRequest, service: Service, request: Request) -> PolicySearchResponse:
    """Semantic search over ready documents. Returns the most similar chunks with source metadata and cosine scores."""
    outcome = service.search(search.query, search.top_k, search.document_id)
    return PolicySearchResponse(
        query=search.query,
        results=outcome.results,
        embedding_model=request.app.state.embedder.model_name,
        searched_chunks=outcome.searched_chunks,
    )


def get_assistant_service(request: Request, service: Service) -> PolicyAssistantService:
    settings = request.app.state.settings
    return PolicyAssistantService(
        search_service=service,
        llm=request.app.state.llm,
        thresholds=EvidenceThresholds(min_relevance=settings.rag_min_relevance, strong_relevance=settings.rag_strong_relevance),
        top_k=settings.rag_top_k,
    )


@router.post("/chat", response_model=PolicyChatResponse)
def chat(chat_request: PolicyChatRequest, request: Request, assistant: Annotated[PolicyAssistantService, Depends(get_assistant_service)]) -> PolicyChatResponse:
    """
    Answers a policy question from the uploaded documents (retrieval-augmented generation).

    The answer cites retrieved passages as [S1], [S2]...; ``citations`` lists exactly those passages.
    When the policies don't contain enough information, the fixed HR-escalation answer is returned instead.
    ``history`` is conversational context only and is never treated as policy evidence.
    """
    return assistant.answer(chat_request.question, chat_request.history, chat_request.document_id, request_ms=_request_ms(request))


def _request_ms(request: Request) -> float | None:
    """Time from the request's arrival to the handler (authentication, database session), if the middleware recorded it."""
    received_at = getattr(request.state, "received_at", None)
    return None if received_at is None else round((time.perf_counter() - received_at) * 1000, 1)


def _event(payload: dict[str, object]) -> bytes:
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


def _error_event(error: Exception) -> dict[str, object]:
    if isinstance(error, PolicyServiceError):
        return {"type": "error", "status": error.status_code, "code": error.code, "detail": error.detail}
    logger.exception("Policy chat stream failed", exc_info=error)
    return {"type": "error", "status": 500, "code": "internal_error", "detail": "Something went wrong while answering. Please try again."}


async def _answer_events(assistant: PolicyAssistantService, prepared: PreparedAnswer, request: Request, budget_seconds: float) -> AsyncIterator[bytes]:
    """
    Newline-delimited JSON events: ``status`` (retrieval done), ``token`` (draft text as the model writes it), then
    ``done`` with the validated answer, or ``error``. The model runs in a worker thread. When the browser goes away or
    the time budget runs out, the worker stops reading, which closes the connection to the model server so it stops
    generating instead of keeping the model busy for the next question.
    """
    if prepared.response is not None:
        yield _event({"type": "done", "response": prepared.response.model_dump(mode="json", by_alias=True)})
        return

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue()
    stop = threading.Event()
    deadline = time.monotonic() + budget_seconds

    def produce() -> None:
        pieces: list[str] = []
        stream = assistant.stream_answer(prepared)
        try:
            for piece in stream:
                if stop.is_set():
                    return
                if time.monotonic() > deadline:
                    raise LLMTimeoutError("The AI service took too long to respond. Please try again.")
                pieces.append(piece)
                loop.call_soon_threadsafe(queue.put_nowait, ("token", piece))
            response = assistant.finish(prepared, "".join(pieces))
            loop.call_soon_threadsafe(queue.put_nowait, ("done", response.model_dump(mode="json", by_alias=True)))
        except Exception as error:  # noqa: BLE001 - every failure becomes an error event
            loop.call_soon_threadsafe(queue.put_nowait, ("error", _error_event(error)))
        finally:
            stream.close()  # closes the HTTP stream to the model server if we stopped early

    worker = threading.Thread(target=produce, name="policy-chat-stream", daemon=True)
    yield _event({"type": "status", "stage": "generating", "passages": len(prepared.sources)})
    worker.start()
    try:
        while True:
            kind, value = await queue.get()
            if kind == "token":
                yield _event({"type": "token", "text": value})
            elif kind == "done":
                yield _event({"type": "done", "response": value})
                return
            else:
                yield _event(value)  # type: ignore[arg-type]
                return
            if await request.is_disconnected():
                logger.info("Policy chat stream: client disconnected; stopping generation")
                return
    finally:
        stop.set()


@router.post("/chat/stream")
def chat_stream(
    chat_request: PolicyChatRequest, request: Request, assistant: Annotated[PolicyAssistantService, Depends(get_assistant_service)]
) -> StreamingResponse:
    """
    The same answer as ``POST /chat``, streamed so the employee sees the reply while it is written.

    Retrieval and every database read happen before the stream starts, so errors such as "not configured" or an
    unknown document still return a normal JSON error. The stream is newline-delimited JSON: ``status``, ``token``
    events carrying the unvalidated draft, then ``done`` with the validated response (citations, evidence, escalation;
    the draft must be replaced by it, and it may be the HR fallback) or ``error``.
    """
    prepared = assistant.prepare(chat_request.question, chat_request.history, chat_request.document_id, request_ms=_request_ms(request))
    budget = float(request.app.state.settings.llm_timeout_seconds)
    return StreamingResponse(
        _answer_events(assistant, prepared, request, budget),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("/assistant/status", response_model=AssistantStatus)
def assistant_status(
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
    user: CurrentUser,
    check: Annotated[bool, Query(description="Also test the AI provider connection (result cached for 60 s)")] = False,
    refresh: Annotated[bool, Query(description="With check=true, ignore the cached result (HR only)")] = False,
) -> AssistantStatus:
    """
    Whether the assistant can answer, as one ``state`` (ready, not_configured, provider_unreachable, no_documents,
    indexing, retrieval_unavailable) plus provider and knowledge-base details. Never reveals the API key.
    """
    force = refresh and user.role == UserRole.HR
    return build_assistant_status(request.app, session, check_provider=check, force_check=force)


# ---- Policy understanding quizzes ----


def _quiz_service(request: Request, user: UserRecord, session: Session) -> PolicyQuizService:
    return PolicyQuizService(session, user, request.app.state.settings.policy_quiz_pass_percent)


def _quiz_error(error: PolicyQuizError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.message)


@router.post("/chat-quizzes", response_model=AnswerQuizOut)
def build_answer_quiz_route(body: AnswerQuizRequest, request: Request, user: CurrentUser, session: Annotated[Session, Depends(get_db_session)]) -> AnswerQuizOut:
    """
    A 5-question quiz on a Policy Assistant answer, built from the passages it cited (``chunkIds``, in citation order)
    and, if needed, neighbouring passages of the same policy. Questions and options only; answers stay on the server.
    """
    try:
        return _quiz_service(request, user, session).answer_quiz(body.chunk_ids)
    except PolicyQuizError as error:
        raise _quiz_error(error) from error


@router.post("/chat-quizzes/attempts", response_model=PolicyQuizResult)
def grade_answer_quiz_route(
    submission: AnswerQuizSubmission, request: Request, user: CurrentUser, session: Annotated[Session, Depends(get_db_session)]
) -> PolicyQuizResult:
    """
    Grades an answer quiz on the server (the quiz is rebuilt from the same passages) and saves the attempt to your
    own history. These attempts never complete onboarding tasks: those still need the policy's own quiz.
    """
    try:
        result = _quiz_service(request, user, session).grade_answer_quiz(submission.chunk_ids, submission.answers)
    except PolicyQuizError as error:
        raise _quiz_error(error) from error
    session.commit()
    return result


@router.get("/quizzes", response_model=list[PolicyQuizSummary])
def list_policy_quizzes(request: Request, user: CurrentUser, session: Annotated[Session, Depends(get_db_session)]) -> list[PolicyQuizSummary]:
    """Policies that have an understanding quiz, with your best score and whether you've passed."""
    return _quiz_service(request, user, session).list_quizzes()


@router.get("/quizzes/{policy_id}", response_model=PolicyQuizOut)
def get_policy_quiz(policy_id: str, request: Request, user: CurrentUser, session: Annotated[Session, Depends(get_db_session)]) -> PolicyQuizOut:
    """The quiz questions and options (never the answers) plus your previous attempts."""
    try:
        return _quiz_service(request, user, session).get_quiz(policy_id)
    except PolicyQuizError as error:
        raise _quiz_error(error) from error


@router.post("/quizzes/{policy_id}/attempts", response_model=PolicyQuizResult)
def submit_policy_quiz(
    policy_id: str,
    submission: PolicyQuizSubmission,
    request: Request,
    user: CurrentUser,
    session: Annotated[Session, Depends(get_db_session)],
) -> PolicyQuizResult:
    """
    Grades an attempt on the server and stores it. The result reveals the correct answers with explanations.
    For employees, passing completes any policy task whose policies are all acknowledged and understood.
    """
    try:
        result = _quiz_service(request, user, session).grade(policy_id, submission.answers)
    except PolicyQuizError as error:
        raise _quiz_error(error) from error
    if result.passed and user.role == UserRole.EMPLOYEE:
        actions = TaskActionService(session, user, request.app.state.settings, request.app.state.data_cipher)
        result.completed_task_ids = actions.complete_ready_policy_tasks()
    session.commit()
    return result
