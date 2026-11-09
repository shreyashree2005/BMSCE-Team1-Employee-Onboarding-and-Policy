"""Embedding providers behind a small interface, so the model can be swapped without touching ingestion or search.

All providers return L2-normalised float32 vectors, so inner product equals cosine similarity.
"""

import hashlib
import logging
import re
import threading
from typing import Protocol

import numpy as np

from app.services.policies.errors import EmbeddingUnavailableError

logger = logging.getLogger(__name__)


class Embedder(Protocol):
    @property
    def model_name(self) -> str: ...

    @property
    def dimension(self) -> int: ...

    def embed(self, texts: list[str]) -> np.ndarray:
        """Returns an (n, dimension) float32 array of L2-normalised embeddings."""
        ...


def _normalize(vectors: np.ndarray) -> np.ndarray:
    vectors = np.asarray(vectors, dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.where(norms == 0, 1, norms)


class SentenceTransformerEmbedder:
    """Semantic embeddings from a sentence-transformers model, loaded lazily on first use."""

    def __init__(self, model_name: str, batch_size: int = 32) -> None:
        self._model_name = model_name
        self._batch_size = batch_size
        self._model = None
        self._lock = threading.Lock()

    @property
    def model_name(self) -> str:
        return self._model_name

    def _load(self):  # noqa: ANN202 - returns a SentenceTransformer, imported lazily
        with self._lock:
            if self._model is None:
                try:
                    # Imported here so the API starts quickly and tests that don't need the model never load PyTorch.
                    from sentence_transformers import SentenceTransformer

                    logger.info("Loading embedding model %s", self._model_name)
                    self._model = SentenceTransformer(self._model_name, device="cpu")
                except Exception as error:
                    logger.exception("Could not load embedding model %s", self._model_name)
                    raise EmbeddingUnavailableError(
                        "The embedding model could not be loaded. Check the server's internet connection for the first download, "
                        "or the EMBEDDING_MODEL setting."
                    ) from error
            return self._model

    @property
    def dimension(self) -> int:
        model = self._load()
        dimension = model.get_sentence_embedding_dimension()
        if dimension is None:  # pragma: no cover - all supported models report a dimension
            raise EmbeddingUnavailableError("The embedding model did not report its vector dimension.")
        return int(dimension)

    def embed(self, texts: list[str]) -> np.ndarray:
        model = self._load()
        vectors = model.encode(texts, batch_size=self._batch_size, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
        return _normalize(vectors)


class HashingEmbedder:
    """
    Deterministic lexical embeddings (hashed word unigrams and bigrams). No model download.

    Intended for tests and offline development: it matches shared words, not meaning,
    so use the sentence-transformers provider for real semantic search.
    """

    _TOKEN = re.compile(r"[a-z0-9]+")

    def __init__(self, dimension: int = 384) -> None:
        self._dimension = dimension

    @property
    def model_name(self) -> str:
        return f"hashing-{self._dimension}"

    @property
    def dimension(self) -> int:
        return self._dimension

    def _bucket(self, feature: str) -> int:
        return int.from_bytes(hashlib.blake2b(feature.encode(), digest_size=8).digest(), "little") % self._dimension

    def embed(self, texts: list[str]) -> np.ndarray:
        vectors = np.zeros((len(texts), self._dimension), dtype=np.float32)
        for row, text in enumerate(texts):
            tokens = self._TOKEN.findall(text.lower())
            for feature in tokens + [f"{a} {b}" for a, b in zip(tokens, tokens[1:])]:
                vectors[row, self._bucket(feature)] += 1.0
        return _normalize(vectors)


def create_embedder(provider: str, model_name: str) -> Embedder:
    if provider == "hashing":
        return HashingEmbedder()
    return SentenceTransformerEmbedder(model_name)
