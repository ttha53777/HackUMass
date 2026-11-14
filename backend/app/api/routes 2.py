"""API routes. Session endpoints arrive with ticket T5."""

from __future__ import annotations

import os

from fastapi import APIRouter

from app.api.schemas import HealthOut

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    llm_mode = "live" if os.environ.get("LLM_MODE", "off").lower() == "live" else "off"
    return HealthOut(
        llm_mode=llm_mode,
        nessie_configured=bool(os.environ.get("NESSIE_API_KEY")),
    )
