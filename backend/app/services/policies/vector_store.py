"""FAISS vector index persisted to disk.

Vectors are stored with explicit 64-bit IDs equal to ``policy_chunks.id``, so all
metadata (text, page, document) lives in the database and stays associated with
each vector. The index is saved atomically together with a small manifest
recording which embedding model produced it.
"""

import json
import logging
import os
import threading
from pathlib import Path

import faiss
import numpy as np

logger = logging.getLogger(__name__)

INDEX_FILENAME = "policy_chunks.faiss"
MANIFEST_FILENAME = "policy_chunks.manifest.json"


class FaissVectorStore:
    def __init__(self, directory: Path, model_name: str) -> None:
        self._directory = directory
        self._model_name = model_name
        self._index: faiss.IndexIDMap2 | None = None
        self._lock = threading.RLock()

    @property
    def index_path(self) -> Path:
        return self._directory / INDEX_FILENAME

    @property
    def manifest_path(self) -> Path:
        return self._directory / MANIFEST_FILENAME

    @property
    def size(self) -> int:
        with self._lock:
            return 0 if self._index is None else int(self._index.ntotal)

    def ids(self) -> set[int]:
        with self._lock:
            if self._index is None or self._index.ntotal == 0:
                return set()
            return {int(i) for i in faiss.vector_to_array(self._index.id_map)}

    def load(self) -> bool:
        """Loads the saved index. Returns False if it is missing, unreadable or built with a different model."""
        with self._lock:
            if not self.index_path.exists() or not self.manifest_path.exists():
                return False
            try:
                manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
                if manifest.get("model") != self._model_name:
                    logger.info("Vector index was built with %s; current model is %s.", manifest.get("model"), self._model_name)
                    return False
                index = faiss.read_index(str(self.index_path))
                self._index = faiss.IndexIDMap2(index) if not isinstance(index, faiss.IndexIDMap2) else index
                logger.info("Loaded vector index with %d vectors.", self._index.ntotal)
                return True
            except (OSError, ValueError, RuntimeError) as error:
                logger.warning("Could not load vector index (%s); it will be rebuilt.", error)
                return False

    def reset(self, dimension: int) -> None:
        with self._lock:
            self._index = faiss.IndexIDMap2(faiss.IndexFlatIP(dimension))

    def add(self, ids: list[int], vectors: np.ndarray) -> None:
        if not ids:
            return
        vectors = np.ascontiguousarray(vectors, dtype=np.float32)
        with self._lock:
            if self._index is None:
                self.reset(vectors.shape[1])
            assert self._index is not None
            if vectors.shape[1] != self._index.d:
                raise ValueError(f"Vector dimension {vectors.shape[1]} does not match index dimension {self._index.d}")
            self._index.add_with_ids(vectors, np.asarray(ids, dtype=np.int64))

    def remove(self, ids: list[int]) -> int:
        with self._lock:
            if self._index is None or not ids:
                return 0
            return int(self._index.remove_ids(np.asarray(ids, dtype=np.int64)))

    def search(self, query_vector: np.ndarray, k: int) -> list[tuple[int, float]]:
        with self._lock:
            if self._index is None or self._index.ntotal == 0:
                return []
            k = min(k, int(self._index.ntotal))
            scores, ids = self._index.search(np.ascontiguousarray(query_vector.reshape(1, -1), dtype=np.float32), k)
        return [(int(i), float(s)) for i, s in zip(ids[0], scores[0]) if i != -1]

    def save(self) -> None:
        """Writes the index and manifest via temp files + atomic rename, so a crash never leaves a half-written index."""
        with self._lock:
            if self._index is None:
                return
            self._directory.mkdir(parents=True, exist_ok=True)
            tmp_index = self.index_path.with_suffix(".faiss.tmp")
            tmp_manifest = self.manifest_path.with_suffix(".json.tmp")
            faiss.write_index(self._index, str(tmp_index))
            tmp_manifest.write_text(
                json.dumps({"model": self._model_name, "dimension": int(self._index.d), "vectors": int(self._index.ntotal)}),
                encoding="utf-8",
            )
            os.replace(tmp_index, self.index_path)
            os.replace(tmp_manifest, self.manifest_path)
