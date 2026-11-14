"""Serves our own practice application form at /practice/.

It looks generic, says "Practice copy, not sent to any agency" on every step,
makes no network requests, and keeps nothing: it exists so a full run, including
the person's own final submit, can be shown without sending a fictional person's
details to a real agency (docs/browser-agent-plan.md, section 7).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

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
