"""Sample papers for Filler tests and the phase 2 live check: an obviously fictional person.

`make_pdf` writes a small text PDF by hand (no extra dependency); pypdf reads its text
back, so these exercise the text path, including SSN masking. `TINY_PNG` exercises the
photo path.
"""

from __future__ import annotations

import base64


def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(pages: list[list[str]]) -> bytes:
    objects: list[bytes] = []
    page_ids = [4 + 2 * i for i in range(len(pages))]
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for i, lines in enumerate(pages):
        body = "BT /F1 12 Tf 14 TL 72 740 Td " + " ".join(f"({_esc(line)}) Tj T*" for line in lines) + " ET"
        stream = body.encode("latin-1")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> "
            f"/Contents {page_ids[i] + 1} 0 R >>".encode()
        )
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


PAY_STUB = make_pdf([[
    "PAY STUB - Pioneer Valley Bakery",
    "Employee: Maya Rivera",
    "Address: 12 Elm Street, Amherst, MA 01002",
    "SSN: 123-45-6789",
    "Pay period: biweekly   Gross pay this period: $1,200.00",
    "Gross pay per month (estimated): $2,600.00",
    "This is a practice document. The person is fictional.",
]])

STATE_ID = make_pdf([[
    "COMMONWEALTH OF MASSACHUSETTS - IDENTIFICATION CARD (PRACTICE)",
    "Name: RIVERA, MAYA",
    "Date of birth: 04/07/1961",
    "Address: 12 Elm Street, Amherst, MA 01002",
    "ID number: S12345678",
    "This is a practice document. The person is fictional.",
]])

LEASE = make_pdf([
    ["RESIDENTIAL LEASE (PRACTICE)",
     "Tenant: Maya Rivera",
     "Premises: 12 Elm Street, Amherst, MA 01002",
     "Landlord: Hilltop Property Management",
     "This is a practice document. The person is fictional."],
    ["Monthly rent: $1,150.00 due on the first of each month",
     "Occupants: 2 people will live in the premises",
     "This is a practice document. The person is fictional."],
])

# A 1x1 PNG: the photo path (sent as a file, not text).
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
