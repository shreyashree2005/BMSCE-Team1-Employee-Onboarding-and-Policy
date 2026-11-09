"""Profile photos: JPG/PNG only, checked by content and by actually decoding the image.

Accepted photos are re-encoded (max 512 px, metadata such as GPS location removed) and stored under a
server-generated name in PROFILE_PHOTOS_DIR/<user id>/. Only the owner's own photo is served by the API.
"""

import io
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.db.models import UserRecord
from app.services.uploads import IMAGE_TYPES, STORAGE_NAME, detect_type

MAX_DIMENSION = 512
MAX_PIXELS = 40_000_000  # refuse decompression bombs before decoding


class ProfilePhotoError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def process_photo(content: bytes, max_bytes: int) -> tuple[bytes, str, str]:
    """Validates and re-encodes an uploaded photo. Returns (bytes, content type, extension)."""
    if not content:
        raise ProfilePhotoError(422, "The file is empty.")
    if len(content) > max_bytes:
        raise ProfilePhotoError(413, f"Photos can be at most {max_bytes / (1024 * 1024):g} MB.")
    detected = detect_type(content, IMAGE_TYPES)
    if detected is None:
        raise ProfilePhotoError(415, "Upload a JPG or PNG image.")
    content_type, extension = detected
    try:
        with Image.open(io.BytesIO(content)) as probe:
            if probe.width * probe.height > MAX_PIXELS:
                raise ProfilePhotoError(422, "That image is too large. Use a photo under 40 megapixels.")
            probe.verify()  # structural check; the image must be reopened afterwards
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))
            output = io.BytesIO()
            if content_type == "image/jpeg":
                image.convert("RGB").save(output, format="JPEG", quality=88, optimize=True)
            else:
                image.save(output, format="PNG", optimize=True)
    except ProfilePhotoError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as error:
        raise ProfilePhotoError(422, "That file isn't a valid image. Try another photo.") from error
    return output.getvalue(), content_type, extension


class ProfilePhotoService:
    def __init__(self, photos_dir: Path, max_bytes: int) -> None:
        self._dir = photos_dir
        self._max_bytes = max_bytes

    def save(self, user: UserRecord, content: bytes) -> None:
        data, content_type, extension = process_photo(content, self._max_bytes)
        storage_name = f"{uuid.uuid4().hex}{extension}"
        path = self.path(user.id, storage_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        self.remove_file(user)  # replacing: drop the previous file
        user.photo_storage_name = storage_name
        user.photo_content_type = content_type
        user.photo_updated_at = datetime.now(timezone.utc)

    def remove(self, user: UserRecord) -> None:
        self.remove_file(user)
        user.photo_storage_name = None
        user.photo_content_type = None
        user.photo_updated_at = datetime.now(timezone.utc)

    def remove_file(self, user: UserRecord) -> None:
        if user.photo_storage_name:
            self.path(user.id, user.photo_storage_name).unlink(missing_ok=True)

    def path(self, user_id: int, storage_name: str) -> Path:
        if not STORAGE_NAME.fullmatch(storage_name):
            raise ValueError("invalid storage name")
        return self._dir / str(user_id) / storage_name
