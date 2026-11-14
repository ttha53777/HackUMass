"""HTTP routes (ticket T5). Evidence endpoints arrive with T15 and T17."""

from __future__ import annotations

import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.schemas import AnswerIn, ErrorCode, HealthOut, SessionSnapshot
from app.api.views import build_snapshot
from app.graph.answers import AnswerError, validate_answer
from app.graph.questions import get_spec
from app.graph.state import IntakeState
from app.services.session_store import SessionManager, SessionMeta

router = APIRouter(prefix="/api")


class ApiError(Exception):
    def __init__(self, status: int, code: ErrorCode, message: str) -> None:
        self.status, self.code, self.message = status, code, message


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def _manager(request: Request) -> SessionManager:
    return request.app.state.sessions


def _session(request: Request, session_id: str) -> SessionMeta:
    meta = _manager(request).get(session_id)
    if meta is None:
        raise ApiError(
            404,
            "session_not_found",
            "This session has expired. Start again to continue.",
        )
    return meta


def _snapshot(request: Request, session_id: str, meta: SessionMeta) -> SessionSnapshot:
    return build_snapshot(
        session_id,
        _manager(request).values(session_id),
        meta,
        fixture_data=request.app.state.programs.is_fixture,
        region_for=request.app.state.programs.region,
    )


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    llm_mode = "live" if os.environ.get("LLM_MODE", "off").lower() == "live" else "off"
    return HealthOut(
        llm_mode=llm_mode,
        nessie_configured=bool(os.environ.get("NESSIE_API_KEY")),
    )


@router.post("/sessions", response_model=SessionSnapshot, status_code=201)
def create_session(request: Request) -> SessionSnapshot:
    """Start a session. The response already contains the first question."""
    session_id = _manager(request).create()
    return _snapshot(request, session_id, _session(request, session_id))


@router.get("/sessions/{session_id}", response_model=SessionSnapshot)
def read_session(request: Request, session_id: str) -> SessionSnapshot:
    return _snapshot(request, session_id, _session(request, session_id))


@router.post(
    "/sessions/{session_id}/answers",
    response_model=SessionSnapshot,
    responses={202: {"model": SessionSnapshot, "description": "Still working; poll the session."}},
)
async def submit_answer(request: Request, session_id: str, answer: AnswerIn) -> JSONResponse:
    """Answer the pending question, or change or skip an earlier one.

    200: the run finished and the snapshot is current.
    202: the run is still going (`busy: true`); poll GET /sessions/{id}.
    """
    manager = _manager(request)
    meta = _session(request, session_id)
    if meta.busy:
        raise ApiError(409, "session_busy", "Still working on your last answer. Try again in a moment.")

    spec = get_spec(answer.question_id)
    if spec is None:
        raise ApiError(422, "validation_error", "Unknown question.")

    values = manager.values(session_id)
    intake: IntakeState = values.get("intake") or IntakeState()
    if answer.question_id not in intake.asked_question_ids:
        # Only the pending question or one already asked can be answered.
        raise ApiError(409, "stale_question", "That question is no longer open. Refresh to continue.")

    try:
        validate_answer(spec, answer)
    except AnswerError as exc:
        raise ApiError(422, "validation_error", str(exc)) from exc

    finished = await manager.submit(session_id, {"user_answer": answer})
    snapshot = _snapshot(request, session_id, meta)
    return JSONResponse(
        status_code=200 if finished else 202, content=snapshot.model_dump(mode="json")
    )
