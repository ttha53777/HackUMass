"""HTTP routes (tickets T5, T15, T17)."""

from __future__ import annotations

import os

from fastapi import APIRouter, Body, File, Form, Request, UploadFile
from starlette.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from app.api.schemas import (
    AnswerIn,
    ErrorCode,
    HealthOut,
    NessieEvidenceIn,
    PersonaOut,
    SessionSnapshot,
)
from app.api.views import build_snapshot
from app.graph.answers import AnswerError, validate_answer
from app.graph.questions import get_spec
from app.graph.state import EvidenceRequest, IntakeState
from app.services.documents import MAX_BYTES, DocumentRejected, extract
from app.services.llm import get_llm
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
        automatable_ids=request.app.state.automatable_ids,
    )


@router.get("/health", response_model=HealthOut)
def health(request: Request) -> HealthOut:
    # "live" only when a model client is actually configured.
    return HealthOut(
        llm_mode="live" if get_llm() is not None else "off",
        nessie_configured=bool(os.environ.get("NESSIE_API_KEY")),
        browser_agent=request.app.state.execution is not None,
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
    # Already-asked questions can always be answered again (edits). A follow-up
    # that was never asked is accepted once intake is over and there are results:
    # the app lists every open follow-up and guide-tailoring question.
    results_ready = values.get("workflow_phase") not in (None, "intake") and bool(values.get("programs"))
    open_followup = spec.question.origin == "eligibility_followup" and results_ready
    if answer.question_id not in intake.asked_question_ids and not open_followup:
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


@router.get("/nessie/personas", response_model=list[PersonaOut])
def list_personas(request: Request) -> list[PersonaOut]:
    """Fictional demo bank profiles. Every label says "Simulated"."""
    return [
        PersonaOut(id=p.id, label=p.label, description=p.description)
        for p in request.app.state.nessie.personas()
    ]


@router.post(
    "/sessions/{session_id}/evidence/nessie",
    response_model=SessionSnapshot,
    status_code=202,
)
async def submit_nessie_evidence(
    request: Request, session_id: str, body: dict = Body(...)
) -> JSONResponse:
    """Use a simulated bank profile. `consent` must be literally true.

    200 when the run finished on the fast path, 202 while it is still going.
    """
    manager = _manager(request)
    meta = _session(request, session_id)
    if body.get("consent") is not True:
        raise ApiError(400, "consent_required", "Please confirm you want to use the simulated profile.")
    try:
        evidence = NessieEvidenceIn.model_validate(body)
    except ValueError as exc:
        raise ApiError(422, "validation_error", "Choose one of the simulated profiles.") from exc
    if not request.app.state.nessie.has_persona(evidence.persona_id):
        raise ApiError(422, "validation_error", "Choose one of the simulated profiles.")
    if meta.busy:
        raise ApiError(409, "session_busy", "Still working on your last answer. Try again in a moment.")

    request_in = EvidenceRequest(kind="nessie", persona_id=evidence.persona_id)
    finished = await manager.submit(session_id, {"pending_evidence": request_in})
    snapshot = _snapshot(request, session_id, meta)
    return JSONResponse(
        status_code=200 if finished else 202, content=snapshot.model_dump(mode="json")
    )


@router.post(
    "/sessions/{session_id}/evidence/document",
    response_model=SessionSnapshot,
    status_code=202,
)
async def submit_document(
    request: Request,
    session_id: str,
    file: UploadFile = File(...),
    consent: str = Form(""),
) -> JSONResponse:
    """Read household size and income from a PDF or text file (2 MB max).

    The file is parsed from a temporary copy that is deleted straight away; only
    the extracted facts are kept, and they stay unconfirmed until the person
    confirms them. 200 when finished on the fast path, 202 while still going.
    """
    manager = _manager(request)
    meta = _session(request, session_id)
    if consent.strip().lower() != "true":
        raise ApiError(400, "consent_required", "Please confirm you want us to read this document.")
    if meta.busy:
        raise ApiError(409, "session_busy", "Still working on your last answer. Try again in a moment.")

    data = await file.read(MAX_BYTES + 1)  # never read more than we would accept
    await file.close()
    try:
        extraction = await run_in_threadpool(extract, file.filename or "", data)
    except DocumentRejected as exc:
        raise ApiError(415, "unsupported_file", str(exc)) from exc
    finally:
        del data

    document_id = request.app.state.documents.put(extraction)
    request_in = EvidenceRequest(kind="document", document_ref=document_id)
    finished = await manager.submit(session_id, {"pending_evidence": request_in})
    snapshot = _snapshot(request, session_id, meta)
    return JSONResponse(
        status_code=200 if finished else 202, content=snapshot.model_dump(mode="json")
    )
