"""Encryption at rest for sensitive personal data (bank account numbers), using Fernet (AES-128-CBC + HMAC-SHA256)."""

import logging
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


class DataCipher:
    def __init__(self, key: str) -> None:
        self._fernet = Fernet(key.encode() if isinstance(key, str) else key)

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, token: str) -> str:
        try:
            return self._fernet.decrypt(token.encode()).decode()
        except InvalidToken as error:
            raise ValueError("Encrypted value could not be decrypted with the configured key") from error


def resolve_data_key(configured: str | None, storage_dir: Path, *, production: bool) -> str:
    """
    Returns the Fernet key. Production must configure DATA_ENCRYPTION_KEY (enforced by Settings). In development a
    key is generated once and kept in the (gitignored) storage folder so encrypted values survive restarts.
    """
    if configured:
        Fernet(configured.encode())  # validates the key format early
        return configured
    if production:  # pragma: no cover - Settings validation prevents this
        raise RuntimeError("DATA_ENCRYPTION_KEY is required in production")
    key_file = storage_dir / "dev-data-key"
    if key_file.exists():
        stored = key_file.read_text(encoding="utf-8").strip()
        if stored:
            return stored
    storage_dir.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key().decode()
    key_file.write_text(key, encoding="utf-8")
    logger.warning("DATA_ENCRYPTION_KEY is not set: generated a development encryption key at %s", key_file)
    return key
