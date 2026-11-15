"""Filler routes: papers, consent and details (phase 2), plus the phase 1 dev spike.

Session routes, under /api/sessions/{session_id}/filler (values only to that session):

    GET    /state                    auto-read setting, papers, details, unconfirmed count
    PUT    /auto-read                {on, scopes?, notice_version}
    POST   /papers                   multipart `file` (+ `kind` hint); read at once if auto-read is on
    DELETE /papers/{paper_id}        forget the paper and what was read from it
    PUT    /consents/{paper_id}      {scopes?, notice_version}: the paper's own switch on; read it
    DELETE /consents/{paper_id}      switch off: drop what was read from it
    POST   /details/confirm          {keys?: [...] (none = all), edits?: {key: value}}
    DELETE /details/{key}            forget one detail

Dev spike routes (phase 1):

Mounted only when FILLER_ENABLED=1, and answer only requests from this machine:
a spike run spends Gemini and cloud-browser credit and belongs to no session.
Phase 3 replaces these with the session-scoped routes in the spec
(`/api/sessions/{session_id}/filler/...`).

    POST /api/filler/dev/spike               start (409 if one is running)
    GET  /api/filler/dev/spike/{run_id}      status, frame count, peak fps, timings
    POST /api/filler/dev/spike/{run_id}/stop
    WS   /api/filler/dev/spike/{run_id}/live frames, cursor, steps, status
    GET  /api/filler/dev/viewer              a bare page that watches the latest run
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Body, File, Form, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.api.routes import ApiError, error_response
from app.filler.consent import ConsentError, FillerSession, scopes_from
from app.filler.extract import MAX_BYTES, PaperRejected, check_upload
from app.filler.jobs import PaperJobs
from app.filler.models import CATALOGUE, NOTICE_VERSION, PAPER_KINDS
from app.filler.runs import SpikeBusy, SpikeRuns

router = APIRouter(prefix="/api/filler/dev")
session_router = APIRouter(prefix="/api/sessions/{session_id}/filler")
NO_STORE = {"Cache-Control": "no-store"}


# ---------------------------------------------------------------------------
# Session routes (phase 2)
# ---------------------------------------------------------------------------


class AutoReadIn(BaseModel):
    on: bool
    scopes: list[str] | None = None
    notice_version: str = NOTICE_VERSION


class ConsentIn(BaseModel):
    scopes: list[str] | None = None
    notice_version: str = NOTICE_VERSION


class ConfirmIn(BaseModel):
    keys: list[str] | None = None
    edits: dict[str, str] = {}


def _state(request: Request, session_id: str) -> FillerSession:
    if request.app.state.sessions.get(session_id) is None:
        raise ApiError(404, "session_not_found", "This session has expired. Start again to continue.")
    state = request.app.state.filler.sessions.get(session_id)
    assert state is not None
    return state


def _jobs(request: Request) -> PaperJobs:
    return request.app.state.filler.jobs


def _out(state: FillerSession, status: int = 200) -> JSONResponse:
    return JSONResponse(state.view(), status_code=status, headers=NO_STORE)


def _paper(state: FillerSession, paper_id: str):
    paper = state.papers.get(paper_id)
    if paper is None:
        raise ApiError(404, "paper_not_found", "That paper isn't here any more.")
    return paper


@session_router.get("/state")
async def filler_state(session_id: str, request: Request):
    return _out(_state(request, session_id))


@session_router.put("/auto-read")
async def set_auto_read(session_id: str, request: Request, body: AutoReadIn = Body(...)):
    state = _state(request, session_id)
    try:
        scopes = scopes_from(body.scopes)
    except ConsentError as exc:
        raise ApiError(422, "bad_scopes", str(exc)) from exc
    for paper in state.set_auto_read(body.on, scopes, body.notice_version):
        _jobs(request).cancel(paper.id)
    return _out(state)


@session_router.post("/papers", status_code=201)
async def add_paper(session_id: str, request: Request, file: UploadFile = File(...), kind: str = Form("")):
    state = _state(request, session_id)
    data = await file.read(MAX_BYTES + 1)  # never read more than we accept
    await file.close()
    try:
        mime, pages = await run_in_threadpool(check_upload, data)
        hint = kind.strip() if kind.strip() in PAPER_KINDS else None
        paper = state.add_paper(mime, pages, data, hint)
    except PaperRejected as exc:
        raise ApiError(415, "unsupported_file", str(exc)) from exc
    except ConsentError as exc:
        raise ApiError(409, "too_many_papers", str(exc)) from exc
    finally:
        del data
    if paper.consent is not None:  # auto-read is on: read it now
        _jobs(request).schedule(state, paper)
    return JSONResponse({**state.view(), "paper_id": paper.id}, status_code=201, headers=NO_STORE)


@session_router.delete("/papers/{paper_id}")
async def remove_paper(session_id: str, paper_id: str, request: Request):
    state = _state(request, session_id)
    _paper(state, paper_id)
    _jobs(request).cancel(paper_id)
    state.remove_paper(paper_id)
    return _out(state)


@session_router.put("/consents/{paper_id}")
async def grant_consent(session_id: str, paper_id: str, request: Request, body: ConsentIn = Body(...)):
    state = _state(request, session_id)
    paper = _paper(state, paper_id)
    try:
        scopes = scopes_from(body.scopes)
    except ConsentError as exc:
        raise ApiError(422, "bad_scopes", str(exc)) from exc
    already_read = paper.status == "done" and paper.data is None and paper.consent is not None
    state.grant(paper_id, scopes, body.notice_version)
    if not already_read:  # a scope change on a read paper only narrows; nothing to read again
        _jobs(request).schedule(state, paper)
    return _out(state)


@session_router.delete("/consents/{paper_id}")
async def revoke_consent(session_id: str, paper_id: str, request: Request):
    state = _state(request, session_id)
    _paper(state, paper_id)
    _jobs(request).cancel(paper_id)
    state.revoke(paper_id)
    return _out(state)


@session_router.post("/details/confirm")
async def confirm_details(session_id: str, request: Request, body: ConfirmIn = Body(...)):
    state = _state(request, session_id)
    unknown = [k for k in [*(body.keys or []), *body.edits] if k not in CATALOGUE]
    if unknown:
        raise ApiError(422, "unknown_detail", "That detail isn't one we keep.")
    refused = state.confirm(body.keys, body.edits)
    if refused:
        names = ", ".join(CATALOGUE[k].label for k in refused)
        raise ApiError(422, "bad_value", f"That doesn't look right for: {names}.")
    return _out(state)


@session_router.delete("/details/{key}")
async def forget_detail(session_id: str, key: str, request: Request):
    state = _state(request, session_id)
    state.forget_detail(key)
    return _out(state)


# ---------------------------------------------------------------------------
# Dev spike routes (phase 1)
# ---------------------------------------------------------------------------

LOCAL_CLIENTS = {"127.0.0.1", "::1", "localhost", "testclient"}
VIEWER_HTML = (Path(__file__).resolve().parents[1] / "filler" / "viewer.html").read_text()


def _local(host: str | None) -> bool:
    return (host or "") in LOCAL_CLIENTS


def _runs(request: Request) -> SpikeRuns:
    return request.app.state.filler.spike


def _forbidden() -> JSONResponse:
    return error_response(403, "local_only", "The Filler dev routes answer only this machine.")


def _not_found() -> JSONResponse:
    return error_response(404, "run_not_found", "That run doesn't exist.")


@router.post("/spike", status_code=202)
async def start_spike(request: Request):
    if not _local(request.client.host if request.client else None):
        return _forbidden()
    try:
        run = _runs(request).start()
    except SpikeBusy:
        return error_response(409, "run_active", "A spike run is already going. Stop it first.")
    return JSONResponse(run.view(), status_code=202)


@router.get("/spike/{run_id}")
async def get_spike(run_id: str, request: Request):
    if not _local(request.client.host if request.client else None):
        return _forbidden()
    run = _runs(request).get(run_id)
    return run.view() if run else _not_found()


@router.post("/spike/{run_id}/stop")
async def stop_spike(run_id: str, request: Request):
    if not _local(request.client.host if request.client else None):
        return _forbidden()
    run = await _runs(request).stop(run_id)
    return run.view() if run else _not_found()


@router.get("/viewer", response_class=HTMLResponse)
async def viewer(request: Request):
    if not _local(request.client.host if request.client else None):
        return _forbidden()
    return HTMLResponse(VIEWER_HTML)


@router.websocket("/spike/{run_id}/live")
async def live(websocket: WebSocket, run_id: str):
    if not _local(websocket.client.host if websocket.client else None):
        await websocket.close(code=4403)
        return
    run = websocket.app.state.filler.spike.get(run_id)
    if run is None:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    queue = run.stream.subscribe()
    try:
        while True:
            event = await queue.get()
            if event is None:
                break
            await websocket.send_json(event)
        await websocket.close()
    except WebSocketDisconnect:
        pass
    finally:
        run.stream.unsubscribe(queue)
