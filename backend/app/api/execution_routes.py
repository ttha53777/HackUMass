"""Browser execution agent routes (docs/browser-agent-plan.md, section 3).

Mounted under /api/sessions/{session_id}/applications only when BROWSER_PROVIDER
is set. A run is looked up under its session id: another session gets 404, and
the live-view URL is returned only to the owner and never logged.

The frontend polls GET /applications/{run_id} about once a second.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse, Response

from app.api.routes import ApiError
from app.execution.config import resolve_target
from app.execution.fields import store_from_profile
from app.execution.manager import ExecutionError, ExecutionManager, Run
from app.execution.models import ControlIn, RunView, StartRunIn
from app.graph.state import AnswerIn, Profile

router = APIRouter(prefix="/api/sessions/{session_id}/applications")


def _manager(request: Request) -> ExecutionManager:
    return request.app.state.execution


def _check_session(request: Request, session_id: str) -> None:
    if request.app.state.sessions.get(session_id) is None:
        raise ApiError(404, "session_not_found", "This session has expired. Start again to continue.")


def _run(request: Request, session_id: str, run_id: str) -> Run:
    _check_session(request, session_id)
    return _manager(request).require(session_id, run_id)


def _view(run: Run, status: int = 200) -> JSONResponse:
    # Live view URLs are credentials: never cache this response.
    return JSONResponse(
        status_code=status, content=run.view().model_dump(mode="json"), headers={"Cache-Control": "no-store"}
    )


@router.post("", response_model=RunView, status_code=201)
async def start_run(request: Request, session_id: str, body: dict = Body(...)) -> JSONResponse:
    """Start filling in one program's application. `consent` must be literally true."""
    _check_session(request, session_id)
    if body.get("consent") is not True:
        raise ApiError(400, "consent_required", "Please confirm you want the assistant to fill in this form.")
    try:
        start = StartRunIn.model_validate(body)
    except ValueError as exc:
        raise ApiError(422, "validation_error", "Choose a program to apply for.") from exc

    values = request.app.state.sessions.values(session_id)
    on_list = any(p.id == start.program_id for p in values.get("programs") or [])
    record = request.app.state.automation.get(start.program_id)
    if record is None or not on_list:
        raise ApiError(422, "not_automatable", "The assistant can't fill in this application yet.")

    target = resolve_target(record, request.app.state.agent_settings)
    store = store_from_profile(values.get("profile") or Profile(), request.app.state.programs.region)
    run = _manager(request).start(session_id, target, store)
    return _view(run, 201)


@router.get("/{run_id}", response_model=RunView)
def read_run(request: Request, session_id: str, run_id: str) -> JSONResponse:
    return _view(_run(request, session_id, run_id))


@router.post("/{run_id}/answer", response_model=RunView)
def answer_run(request: Request, session_id: str, run_id: str, answer: AnswerIn) -> JSONResponse:
    run = _run(request, session_id, run_id)
    _manager(request).answer(run, answer)
    return _view(run)


@router.post("/{run_id}/control", response_model=RunView)
def control_run(request: Request, session_id: str, run_id: str, body: ControlIn) -> JSONResponse:
    run = _run(request, session_id, run_id)
    _manager(request).control(run, body.action)
    return _view(run)


@router.post("/{run_id}/stop", response_model=RunView)
async def stop_run(request: Request, session_id: str, run_id: str) -> JSONResponse:
    run = _run(request, session_id, run_id)
    await _manager(request).stop(run)
    return _view(run)


@router.get("/{run_id}/frame", responses={200: {"content": {"image/png": {}}}})
def read_frame(request: Request, session_id: str, run_id: str) -> Response:
    """The newest screenshot: the fallback when the live view can't be embedded."""
    run = _run(request, session_id, run_id)
    if not run.active or run.last_frame is None:
        raise ExecutionError(404, "run_not_found", "There's no picture of the browser right now.")
    return Response(content=run.last_frame, media_type="image/png", headers={"Cache-Control": "no-store"})
