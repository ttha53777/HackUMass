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


def make_fillable_pdf() -> bytes:
    """A blank one-page fillable form (AcroForm): five text fields with tooltips, a certify
    checkbox and a signature field. Field names are deliberately unhelpful, as on real forms."""
    text_fields = [("f1_applicant[0]", "First name"), ("f2_applicant[0]", "Last name"),
                   ("f3_dob[0]", "Date of birth"), ("f4_tel[0]", "Phone number"), ("f5_zip[0]", "ZIP code")]
    objs: dict[int, bytes] = {}
    field_ids = []
    n = 6
    for i, (name, tip) in enumerate(text_fields):
        y = 700 - i * 40
        objs[n] = (f"<< /Type /Annot /Subtype /Widget /FT /Tx /T ({name}) /TU ({tip}) /Rect [200 {y} 500 {y + 20}] "
                   f"/P 4 0 R /F 4 /DA (/Helv 10 Tf 0 g) >>").encode()
        field_ids.append(n)
        n += 1
    on, off = n, n + 1
    objs[on] = b"<< /Type /XObject /Subtype /Form /BBox [0 0 12 12] /Length 0 >>\nstream\n\nendstream"
    objs[off] = b"<< /Type /XObject /Subtype /Form /BBox [0 0 12 12] /Length 0 >>\nstream\n\nendstream"
    n += 2
    objs[n] = (f"<< /Type /Annot /Subtype /Widget /FT /Btn /T (c1_certify[0]) /TU (I certify the information is true) "
               f"/Rect [72 460 84 472] /P 4 0 R /F 4 /V /Off /AS /Off /AP << /N << /Yes {on} 0 R /Off {off} 0 R >> >> >>").encode()
    field_ids.append(n)
    n += 1
    objs[n] = (b"<< /Type /Annot /Subtype /Widget /FT /Sig /T (s1_sig[0]) /TU (Applicant signature) "
               b"/Rect [200 400 500 430] /P 4 0 R /F 4 >>")
    field_ids.append(n)
    refs = " ".join(f"{i} 0 R" for i in field_ids)
    content = b"BT /F1 14 Tf 72 750 Td (Practice fillable form. The person is fictional.) Tj ET"
    objs[1] = (f"<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [{refs}] /NeedAppearances true "
               f"/DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv 3 0 R >> >> >> >>").encode()
    objs[2] = b"<< /Type /Pages /Kids [4 0 R] /Count 1 >>"
    objs[3] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    objs[4] = (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> "
               f"/Contents 5 0 R /Annots [{refs}] >>").encode()
    objs[5] = b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream"
    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for i in sorted(objs):
        offsets[i] = len(out)
        out += f"{i} 0 obj\n".encode() + objs[i] + b"\nendobj\n"
    size = max(objs) + 1
    xref = len(out)
    out += f"xref\n0 {size}\n0000000000 65535 f \n".encode()
    for i in range(1, size):
        out += f"{offsets[i]:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)
