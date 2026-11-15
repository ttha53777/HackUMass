"""Filler phase 1 dev routes: start a spike run and watch it live.

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

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse

from app.api.routes import error_response
from app.filler.runs import SpikeBusy, SpikeRuns

router = APIRouter(prefix="/api/filler/dev")

LOCAL_CLIENTS = {"127.0.0.1", "::1", "localhost", "testclient"}
VIEWER_HTML = (Path(__file__).resolve().parents[1] / "filler" / "viewer.html").read_text()


def _local(host: str | None) -> bool:
    return (host or "") in LOCAL_CLIENTS


def _runs(request: Request) -> SpikeRuns:
    return request.app.state.filler


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
    run = websocket.app.state.filler.get(run_id)
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
