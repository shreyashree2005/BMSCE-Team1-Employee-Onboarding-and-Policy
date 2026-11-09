"""Database access for policy documents and chunks."""

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.db.models import PolicyChunkRecord, PolicyDocumentRecord
from app.schemas.policies import DocumentStatus


class PolicyRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_documents(self) -> list[PolicyDocumentRecord]:
        query = select(PolicyDocumentRecord).order_by(PolicyDocumentRecord.uploaded_at.desc(), PolicyDocumentRecord.filename)
        return list(self._session.scalars(query))

    def get_document(self, document_id: str, *, with_chunks: bool = False) -> PolicyDocumentRecord | None:
        options = [selectinload(PolicyDocumentRecord.chunks)] if with_chunks else []
        return self._session.get(PolicyDocumentRecord, document_id, options=options)

    def find_by_hash(self, content_sha256: str) -> PolicyDocumentRecord | None:
        return self._session.scalars(select(PolicyDocumentRecord).where(PolicyDocumentRecord.content_sha256 == content_sha256)).first()

    def ready_chunks_by_ids(self, chunk_ids: list[int], document_id: str | None = None) -> dict[int, PolicyChunkRecord]:
        """Chunks (with their document loaded) for the given vector IDs, limited to documents that are ready."""
        if not chunk_ids:
            return {}
        query = (
            select(PolicyChunkRecord)
            .join(PolicyChunkRecord.document)
            .where(PolicyChunkRecord.id.in_(chunk_ids), PolicyDocumentRecord.status == DocumentStatus.READY)
            .options(selectinload(PolicyChunkRecord.document))
        )
        if document_id is not None:
            query = query.where(PolicyChunkRecord.document_id == document_id)
        return {chunk.id: chunk for chunk in self._session.scalars(query)}

    def all_ready_chunks(self) -> list[PolicyChunkRecord]:
        query = (
            select(PolicyChunkRecord)
            .join(PolicyChunkRecord.document)
            .where(PolicyDocumentRecord.status == DocumentStatus.READY)
            .order_by(PolicyChunkRecord.id)
        )
        return list(self._session.scalars(query))

    def fail_interrupted_documents(self) -> int:
        """Marks documents left in 'processing' (e.g. by a crash) as failed. Returns how many were updated."""
        result = self._session.execute(
            update(PolicyDocumentRecord)
            .where(PolicyDocumentRecord.status == DocumentStatus.PROCESSING)
            .values(status=DocumentStatus.FAILED, error_message="Processing was interrupted. Delete the document and upload it again.")
        )
        self._session.commit()
        return int(result.rowcount or 0)  # type: ignore[attr-defined]
