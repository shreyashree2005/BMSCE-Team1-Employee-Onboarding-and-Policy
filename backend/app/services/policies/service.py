"""Policy document ingestion, deletion and semantic search.

Ingestion: validate -> extract -> chunk -> store file + 'processing' record ->
embed -> save chunks and vectors -> 'ready'. Validation and extraction errors
are raised before anything is stored. If embedding or indexing fails, the
document is kept as 'failed' (with a reason) and nothing is left in the index.
"""

import hashlib
import logging
import time
import uuid
from dataclasses import dataclass, field

import numpy as np

from sqlalchemy.orm import Session

from app.db.models import PolicyChunkRecord, PolicyDocumentRecord
from app.schemas.policies import DocumentStatus, PolicySearchResult
from app.services.policies.chunking import chunk_blocks
from app.services.policies.embeddings import Embedder
from app.services.policies.errors import DocumentNotFoundError, DuplicateDocumentError, InvalidDocumentError, PolicyServiceError
from app.services.policies.extraction import extract_text
from app.services.policies.file_storage import PolicyFileStorage
from app.services.policies.repository import PolicyRepository
from app.services.policies.validation import validate_upload
from app.services.policies.vector_store import FaissVectorStore

logger = logging.getLogger(__name__)

# Extra candidates fetched from FAISS to make up for vectors filtered out afterwards (other documents, deletions).
_CANDIDATE_MULTIPLIER = 4


@dataclass(frozen=True)
class IngestionConfig:
    max_upload_bytes: int
    chunk_size: int
    chunk_overlap: int


@dataclass(frozen=True)
class SearchOutcome:
    results: list[PolicySearchResult]
    searched_chunks: int
    # Milliseconds spent per step: "embed" (0 when the query vector was reused), "faiss" and "db".
    timings_ms: dict[str, float] = field(default_factory=dict)


class PolicyDocumentService:
    def __init__(
        self,
        session: Session,
        embedder: Embedder,
        vector_store: FaissVectorStore,
        file_storage: PolicyFileStorage,
        config: IngestionConfig,
    ) -> None:
        self._session = session
        self._repository = PolicyRepository(session)
        self._embedder = embedder
        self._vector_store = vector_store
        self._files = file_storage
        self._config = config
        # Query vectors embedded during this service's lifetime (one request), so a question searched twice (broad
        # questions search all documents, then the matching one) is embedded once.
        self._query_vectors: dict[str, np.ndarray] = {}

    # ---- Queries ----

    def list_documents(self) -> list[PolicyDocumentRecord]:
        return self._repository.list_documents()

    def get_document(self, document_id: str) -> PolicyDocumentRecord:
        record = self._repository.get_document(document_id, with_chunks=True)
        if record is None:
            raise DocumentNotFoundError(document_id)
        return record

    # ---- Ingestion ----

    def ingest(self, raw_filename: str | None, content: bytes) -> PolicyDocumentRecord:
        upload = validate_upload(raw_filename, content, self._config.max_upload_bytes)
        content_hash = hashlib.sha256(upload.content).hexdigest()
        self._handle_existing_copy(content_hash)

        extracted = extract_text(upload.file_type, upload.content)
        chunks = chunk_blocks(extracted.blocks, self._config.chunk_size, self._config.chunk_overlap)
        if not chunks:
            raise InvalidDocumentError("No readable text was found in the document.")

        document_id = uuid.uuid4()
        record = PolicyDocumentRecord(
            id=str(document_id),
            filename=upload.filename,
            storage_name=f"{document_id.hex}.{upload.file_type.value}",
            file_type=upload.file_type,
            size_bytes=len(upload.content),
            content_sha256=content_hash,
            status=DocumentStatus.PROCESSING,
            page_count=extracted.page_count,
            chunk_count=0,
        )
        self._files.save(record.storage_name, upload.content)
        self._session.add(record)
        self._session.commit()
        logger.info("Processing policy document %s (%s, %d chunks)", record.id, record.filename, len(chunks))

        chunk_ids: list[int] = []
        try:
            vectors = self._embedder.embed([chunk.text for chunk in chunks])
            chunk_records = [
                PolicyChunkRecord(chunk_index=c.index, page_number=c.page_number, section=c.section, text=c.text, char_count=len(c.text))
                for c in chunks
            ]
            record.chunks.extend(chunk_records)
            self._session.flush()  # assigns chunk IDs, which double as vector IDs
            chunk_ids = [chunk.id for chunk in chunk_records]
            self._vector_store.add(chunk_ids, vectors)
            record.status = DocumentStatus.READY
            record.chunk_count = len(chunk_records)
            record.error_message = None
            self._session.commit()
        except Exception as error:
            self._session.rollback()
            self._vector_store.remove(chunk_ids)
            self._mark_failed(record.id, error)
            raise

        self._persist_index()
        self._session.refresh(record)
        logger.info("Policy document %s is ready", record.id)
        return record

    def _handle_existing_copy(self, content_hash: str) -> None:
        existing = self._repository.find_by_hash(content_hash)
        if existing is None:
            return
        if existing.status is DocumentStatus.FAILED:
            # A previous attempt failed; replace it so the user can simply retry the upload.
            self._delete_record(existing)
            return
        raise DuplicateDocumentError(f"This document has already been uploaded as '{existing.filename}'.")

    def _mark_failed(self, document_id: str, error: Exception) -> None:
        record = self._repository.get_document(document_id)
        if record is None:
            return
        reason = error.detail if isinstance(error, PolicyServiceError) else "An unexpected error occurred while processing the document."
        logger.error("Processing failed for policy document %s: %s", document_id, error)
        record.status = DocumentStatus.FAILED
        record.error_message = reason[:500]
        record.chunk_count = 0
        self._session.commit()

    # ---- Deletion ----

    def delete(self, document_id: str) -> None:
        record = self._repository.get_document(document_id, with_chunks=True)
        if record is None:
            raise DocumentNotFoundError(document_id)
        self._delete_record(record)
        logger.info("Deleted policy document %s", document_id)

    def _delete_record(self, record: PolicyDocumentRecord) -> None:
        chunk_ids = [chunk.id for chunk in record.chunks]
        storage_name = record.storage_name
        self._session.delete(record)  # chunks are removed by cascade
        self._session.commit()
        # The database is the source of truth: even if the steps below fail, search never returns
        # deleted chunks (results are joined to existing rows) and startup reconciliation cleans up.
        if self._vector_store.remove(chunk_ids):
            self._persist_index()
        try:
            self._files.delete(storage_name)
        except OSError:
            logger.warning("Could not delete stored file %s", storage_name, exc_info=True)

    # ---- Search ----

    def search(self, query: str, top_k: int, document_id: str | None = None) -> SearchOutcome:
        if document_id is not None and self._repository.get_document(document_id) is None:
            raise DocumentNotFoundError(document_id)
        searched = self._vector_store.size
        if searched == 0:
            return SearchOutcome(results=[], searched_chunks=0)

        started = time.perf_counter()
        query_vector = self._query_vectors.get(query)
        if query_vector is None:
            query_vector = self._query_vectors[query] = self._embedder.embed([query])[0]
        embedded = time.perf_counter()
        candidates = self._vector_store.search(query_vector, top_k * _CANDIDATE_MULTIPLIER)
        searched_at = time.perf_counter()
        chunks = self._repository.ready_chunks_by_ids([chunk_id for chunk_id, _ in candidates], document_id)

        results: list[PolicySearchResult] = []
        for chunk_id, score in candidates:
            chunk = chunks.get(chunk_id)
            if chunk is None:
                continue
            results.append(
                PolicySearchResult(
                    chunk_id=chunk.id,
                    document_id=chunk.document_id,
                    document_name=chunk.document.filename,
                    chunk_index=chunk.chunk_index,
                    page_number=chunk.page_number,
                    section=chunk.section,
                    text=chunk.text,
                    score=round(score, 4),
                )
            )
            if len(results) == top_k:
                break
        timings = {
            "embed": round((embedded - started) * 1000, 1),
            "faiss": round((searched_at - embedded) * 1000, 1),
            "db": round((time.perf_counter() - searched_at) * 1000, 1),
        }
        return SearchOutcome(results=results, searched_chunks=searched, timings_ms=timings)

    # ---- Index maintenance ----

    def _persist_index(self) -> None:
        try:
            self._vector_store.save()
        except OSError:
            # The in-memory index is still correct; the saved copy is reconciled on next startup.
            logger.exception("Could not save the vector index to disk")

    def reconcile_index(self) -> None:
        """Startup check: fail interrupted uploads, then make the vector index match the database exactly."""
        interrupted = self._repository.fail_interrupted_documents()
        if interrupted:
            logger.warning("Marked %d interrupted policy document(s) as failed.", interrupted)

        chunks = self._repository.all_ready_chunks()
        expected_ids = {chunk.id for chunk in chunks}
        loaded = self._vector_store.load()
        if loaded and self._vector_store.ids() == expected_ids:
            return
        if loaded and not expected_ids:
            self._vector_store.remove(list(self._vector_store.ids()))
            self._persist_index()
            return
        if not expected_ids:
            return

        logger.info("Rebuilding the policy vector index from %d stored chunks.", len(chunks))
        vectors = self._embedder.embed([chunk.text for chunk in chunks])
        self._vector_store.reset(vectors.shape[1])
        self._vector_store.add([chunk.id for chunk in chunks], vectors)
        self._persist_index()
