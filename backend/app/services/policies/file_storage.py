"""Storage for original uploaded files.

Files are written under server-generated names (``<uuid>.<ext>``) inside a fixed
directory, so user-supplied names can never cause path traversal or overwrite
another upload.
"""

import os
import re
from pathlib import Path

_STORAGE_NAME = re.compile(r"^[0-9a-f]{32}\.(pdf|docx|txt)$")


class PolicyFileStorage:
    def __init__(self, directory: Path) -> None:
        self._directory = directory

    def _path(self, storage_name: str) -> Path:
        if not _STORAGE_NAME.fullmatch(storage_name):
            raise ValueError(f"Invalid storage name: {storage_name!r}")
        return self._directory / storage_name

    def save(self, storage_name: str, content: bytes) -> Path:
        self._directory.mkdir(parents=True, exist_ok=True)
        path = self._path(storage_name)
        # "x" mode fails if the file exists, so an upload can never replace another one.
        with open(path, "xb") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        return path

    def delete(self, storage_name: str) -> None:
        self._path(storage_name).unlink(missing_ok=True)

    def exists(self, storage_name: str) -> bool:
        return self._path(storage_name).exists()

    def path_for(self, storage_name: str) -> Path:
        """Path of a stored file (the name is validated, so it can't escape the storage folder)."""
        return self._path(storage_name)
