"""Fillable PDF forms (phase 5): read the form's fields, fill them live as a web page, write them back.

A fillable PDF (an AcroForm) lists its fields: name, type and often a tooltip that says
what the field is. `inspect` reads them; `render_html` turns them into a plain web form
served inside the cloud browser, so the Filler fills it exactly like a web form (the
fast path, the gate, the person's hand-offs) while the person watches; `fill` writes the
final values back into the original PDF for the person to download.

Checkboxes and choices are marked required in the page, so they always go to the person.
A signature field is a digital signature: it is never typed here; the page says to sign
the downloaded PDF in a PDF app. Flat (non-fillable) PDFs are refused: nothing to fill.
"""

from __future__ import annotations

import html
import io
import re
from dataclasses import dataclass, field
from typing import Literal

from app.filler.extract import MAX_BYTES, PaperRejected, sniff

PdfKind = Literal["text", "check", "choice", "signature"]
MAX_FIELDS = 120
SUBMIT_LABEL = "Submit and make my PDF"


@dataclass
class PdfForm:
    """A blank fillable PDF the person added, held for this session only."""

    id: str
    data: bytes = field(repr=False)
    fields: list[PdfField]
    title: str


@dataclass(frozen=True)
class PdfField:
    name: str
    kind: PdfKind
    label: str
    options: list[str] = field(default_factory=list)


def _label(name: str, tooltip: str | None) -> str:
    if tooltip and tooltip.strip():
        return re.sub(r"\s+", " ", tooltip).strip()[:120]
    # "applicant_first_name[0]" -> "Applicant first name"
    words = re.sub(r"\[\d+\]", "", name.split(".")[-1])
    words = re.sub(r"([a-z])([A-Z])", r"\1 \2", words).replace("_", " ").replace("-", " ").strip()
    return (words[:1].upper() + words[1:])[:120] or "A field"


def inspect(data: bytes) -> list[PdfField]:
    """The form's fields, in document order. Raises PaperRejected for anything we can't fill."""
    if len(data) > MAX_BYTES:
        raise PaperRejected("That file is over 10 MB.")
    if sniff(data) != "application/pdf":
        raise PaperRejected("That isn't a PDF.")
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        raw = reader.get_fields() or {}
    except Exception as exc:
        raise PaperRejected("We couldn't open that PDF. It may be damaged or password-protected.") from exc
    fields: list[PdfField] = []
    for name, f in raw.items():
        ft = f.get("/FT")
        if ft is None or name.endswith("."):
            continue
        tooltip = f.get("/TU")
        label = _label(name, str(tooltip) if tooltip else None)
        if ft == "/Tx":
            fields.append(PdfField(name, "text", label))
        elif ft == "/Btn":
            fields.append(PdfField(name, "check", label))
        elif ft == "/Ch":
            options = [str(o[1] if isinstance(o, list) else o) for o in (f.get("/Opt") or [])]
            fields.append(PdfField(name, "choice", label, options[:50]))
        elif ft == "/Sig":
            fields.append(PdfField(name, "signature", label))
    if not fields:
        raise PaperRejected("That PDF has no fields to fill in. Only fillable PDF forms work here.")
    return fields[:MAX_FIELDS]


def render_html(fields: list[PdfField], title: str = "Your PDF form") -> str:
    """The PDF's fields as a plain web form, one labelled control per field."""
    rows = []
    for i, f in enumerate(fields):
        fid = f"pdf{i}"
        name = html.escape(f.name, quote=True)
        label = html.escape(f.label)
        if f.kind == "text":
            rows.append(f'<div><label for="{fid}">{label}</label><input type="text" id="{fid}" name="{name}" autocomplete="off"></div>')
        elif f.kind == "check":
            rows.append(f'<div class="check"><input type="checkbox" id="{fid}" name="{name}" required>'
                        f'<label for="{fid}">{label}</label></div>')
        elif f.kind == "choice":
            options = "".join(f"<option>{html.escape(o)}</option>" for o in f.options)
            rows.append(f'<div><label for="{fid}">{label}</label><select id="{fid}" name="{name}" required>'
                        f'<option value=""></option>{options}</select></div>')
        else:  # a digital signature field: signed in the PDF itself, never typed here
            rows.append(f'<p class="sig">{label}: you sign this in your PDF app after you download it.</p>')
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>
body{{margin:0;font:16px/1.4 system-ui,sans-serif;background:#eef1f4;color:#1d1d1b}}
main{{max-width:720px;margin:32px auto;background:#fff;border:1px solid #d6dbe1;border-radius:10px;padding:28px 36px}}
h1{{font-size:22px;margin:0 0 4px}} .note{{color:#5b6570;font-size:14px;margin:0 0 18px}}
form{{display:grid;gap:14px}} label{{display:block;font-weight:600;font-size:14px;margin-bottom:4px}}
input[type=text],select{{width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border:1px solid #b8c0c8;border-radius:6px}}
.check{{display:flex;gap:10px;align-items:flex-start}} .sig{{color:#5b6570;font-style:italic;margin:0}} .check label{{font-weight:500;margin:0}}
button{{justify-self:end;font:inherit;font-weight:600;padding:10px 22px;border:0;border-radius:6px;background:#2b5486;color:#fff}}
</style></head><body><main><h1>{html.escape(title)}</h1>
<p class="note">The fields of your PDF form. What is filled here goes into your PDF when you finish.</p>
<form onsubmit="event.preventDefault()">{''.join(rows)}<button type="submit">{SUBMIT_LABEL}</button></form>
</main></body></html>"""


# Reads every control's value by its PDF field name (the person's own form, at the end).
READ_VALUES = r"""
() => Object.fromEntries(Array.from(document.querySelectorAll("form [name]")).map((el) =>
  [el.name, el.type === "checkbox" ? el.checked : el.value]))
"""


def fill(data: bytes, fields: list[PdfField], values: dict[str, str | bool]) -> bytes:
    """The original PDF with these values written into its fields."""
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import NameObject

    reader = PdfReader(io.BytesIO(data))
    writer = PdfWriter()
    writer.append(reader)
    kinds = {f.name: f.kind for f in fields}
    text: dict[str, str] = {}
    for name, value in values.items():
        kind = kinds.get(name)
        if kind in ("text", "choice") and isinstance(value, str) and value.strip():
            text[name] = value.strip()[:500]
    for page in writer.pages:
        writer.update_page_form_field_values(page, text, auto_regenerate=False)
        for annot in page.get("/Annots") or []:  # checkboxes: set the "on" state by hand
            obj = annot.get_object()
            name = obj.get("/T") or (obj.get("/Parent") or {}).get("/T")
            if name is None or kinds.get(str(name)) != "check" or not values.get(str(name)):
                continue
            states = [k for k in (obj.get("/AP") or {}).get("/N", {}).keys() if k != "/Off"] or ["/Yes"]
            obj[NameObject("/V")] = NameObject(states[0])
            obj[NameObject("/AS")] = NameObject(states[0])
    writer.set_need_appearances_writer(True)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
