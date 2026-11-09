"""Outgoing email. ``FileOutboxMailer`` (development) writes each message to a .eml file and logs where it is;
``SmtpMailer`` sends through a real SMTP server. Choose with MAIL_BACKEND."""

import logging
import smtplib
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Protocol

from app.core.config import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    text: str


class Mailer(Protocol):
    def send(self, email: OutgoingEmail) -> None: ...


def _build(email: OutgoingEmail, sender: str) -> EmailMessage:
    message = EmailMessage()
    message["From"] = sender
    message["To"] = email.to
    message["Subject"] = email.subject
    message["Date"] = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    # 8bit keeps links intact and readable (quoted-printable would turn "token=..." into "token=3D..." and wrap lines).
    message.set_content(email.text, cte="8bit")
    return message


class FileOutboxMailer:
    """Local development: messages land in MAIL_OUTBOX_DIR (gitignored). Nothing is sent over the network."""

    def __init__(self, outbox_dir: Path, sender: str) -> None:
        self._outbox = outbox_dir
        self._sender = sender

    def send(self, email: OutgoingEmail) -> None:
        self._outbox.mkdir(parents=True, exist_ok=True)
        # Microseconds keep files in send order when sorted by name (several emails can go out within a second).
        path = self._outbox / f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S-%f}-{uuid.uuid4().hex[:6]}.eml"
        path.write_bytes(bytes(_build(email, self._sender)))
        logger.warning("Email written to the development outbox (MAIL_BACKEND=file): %s", path)


class SmtpMailer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def send(self, email: OutgoingEmail) -> None:
        s = self._settings
        with smtplib.SMTP(s.smtp_host or "", s.smtp_port, timeout=20) as client:
            if s.smtp_starttls:
                client.starttls()
            if s.smtp_username and s.smtp_password:
                client.login(s.smtp_username, s.smtp_password.get_secret_value())
            client.send_message(_build(email, s.mail_from))


def create_mailer(settings: Settings) -> Mailer:
    if settings.mail_backend == "smtp":
        return SmtpMailer(settings)
    return FileOutboxMailer(settings.mail_outbox_dir, settings.mail_from)
