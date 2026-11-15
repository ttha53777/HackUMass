"""Serves our own practice application forms: the generic one at /practice/ and
one per program at /practice/<form_id>/ (app/execution/forms/<form_id>.html).

It looks generic, says "Practice copy, not sent to any agency" on every step,
makes no network requests, and keeps nothing: it exists so a full run, including
the person's own final submit, can be shown without sending a fictional person's
details to a real agency (docs/browser-agent-plan.md, section 7).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from app.execution.config import FORM_PAGES_DIR, form_manifest

router = APIRouter()

PAGE = Path(__file__).resolve().parents[1] / "execution" / "practice.html"

HEADERS = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    # Inline only, and no network access from the page.
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
    "img-src data:; form-action 'none'; base-uri 'none'",
    "Referrer-Policy": "no-referrer",
}


@router.get("/practice/", response_class=HTMLResponse, include_in_schema=False)
def practice_form() -> HTMLResponse:
    return HTMLResponse(PAGE.read_text(encoding="utf-8"), headers=HEADERS)


@router.get("/practice/{form_id}/", response_class=HTMLResponse, include_in_schema=False)
def practice_form_by_id(form_id: str) -> HTMLResponse:
    try:
        form_manifest(form_id)  # only forms with a curated field map, by a checked id
    except ValueError:
        raise HTTPException(status_code=404) from None
    return HTMLResponse((FORM_PAGES_DIR / f"{form_id}.html").read_text(encoding="utf-8"), headers=HEADERS)
