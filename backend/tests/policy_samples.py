"""Builders for test policy documents (fictional content), including minimal real PDF and DOCX files."""

import io

from docx import Document

LEAVE_POLICY = """Leave and Attendance Policy

Full-time employees receive eighteen days of paid annual leave each calendar year. Annual leave accrues monthly and can be requested in the HR portal.

Employees are entitled to eight days of paid sick leave per year. Sick leave can be recorded on the day of absence and a medical certificate is required after three consecutive days.

Up to ten unused annual leave days may be carried forward into the next calendar year. Carried forward days expire on March 31.
"""

SECURITY_POLICY = """Information Security Policy

Report suspected phishing emails to the IT security team immediately using the report button in your mail client. Never click links in unexpected messages.

Passwords must be at least fourteen characters long and must not be reused across systems. Multi-factor authentication is mandatory for all company accounts.
"""

PAYROLL_POLICY = """Payroll Policy

Salaries are paid on the last working day of each month. Payslips are published in the HR portal two working days before payment.

New joiners who start after the twentieth day of a month receive their first salary in the following payroll cycle.
"""


def _escape_pdf_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(pages: list[str]) -> bytes:
    """Builds a small but valid PDF with one text page per entry (an empty string gives a blank page)."""
    page_ids = [4 + 2 * i for i in range(len(pages))]
    objects: dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: f"<< /Type /Pages /Kids [{' '.join(f'{p} 0 R' for p in page_ids)}] /Count {len(pages)} >>".encode(),
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    }
    for page_id, text in zip(page_ids, pages):
        operations = ["BT", "/F1 11 Tf", "72 720 Td", "14 TL"]
        operations += [f"({_escape_pdf_text(line)}) Tj T*" for line in text.splitlines()]
        operations.append("ET")
        stream = "\n".join(operations).encode("latin-1")
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {page_id + 1} 0 R >>"
        ).encode()
        objects[page_id + 1] = b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"

    output = bytearray(b"%PDF-1.4\n")
    offsets: dict[int, int] = {}
    for object_id in sorted(objects):
        offsets[object_id] = len(output)
        output += f"{object_id} 0 obj\n".encode() + objects[object_id] + b"\nendobj\n"
    xref_offset = len(output)
    size = max(objects) + 1
    output += f"xref\n0 {size}\n0000000000 65535 f \n".encode()
    output += b"".join(f"{offsets[i]:010d} 00000 n \n".encode() for i in range(1, size))
    output += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
    return bytes(output)


def make_docx(sections: list[tuple[str, list[str]]]) -> bytes:
    """Builds a DOCX with a heading and paragraphs per section."""
    document = Document()
    for heading, paragraphs in sections:
        document.add_heading(heading, level=1)
        for paragraph in paragraphs:
            document.add_paragraph(paragraph)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
