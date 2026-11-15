"""FastAPI entry point: `uvicorn app.main:app --port 8000 --env-file .env`."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError

from app.agents.action_planning import action_planning
from app.agents.discovery import make_discovery
from app.agents.eligibility import eligibility
from app.agents.document_analysis import make_document_analysis
from app.agents.user_intelligence import make_user_intelligence
from app.api.routes import ApiError, error_response, router
from app.graph.build import build_graph
from app.services.documents import DocumentInbox
from app.services.nessie import NessieService
from app.services.programs_repo import ProgramsRepository, repository_from_env
from app.services import dev_sessions
from app.services.session_store import SessionManager, get_checkpointer

if TYPE_CHECKING:
    from app.execution.manager import ExecutionManager

logger = logging.getLogger(__name__)


def _mount_browser_agent(app: FastAPI, execution: ExecutionManager | None) -> None:
    """Mount the browser execution agent when BROWSER_PROVIDER is set (or a test passes one).

    With the provider off, nothing from the execution package beyond its config
    is imported and the routes don't exist.
    """
    from app.execution.config import AgentSettings, automation_records

    settings = AgentSettings.from_env()
    app.state.agent_settings = settings
    app.state.automation = {}
    app.state.automation_modes = {}
    app.state.execution = None
    if execution is None and settings.provider != "off" and not settings.gemini_api_key:
        logger.warning("BROWSER_PROVIDER is set but GEMINI_API_KEY is not; the browser agent is off")
    elif execution is None and settings.provider != "off":
        from app.execution.manager import ExecutionManager
        from app.execution.provider import ProviderError, make_provider

        try:
            provider = make_provider(settings)
        except ProviderError:
            logger.warning("BROWSER_PROVIDER=%s is not configured; the browser agent is off", settings.provider)
            provider = None
        if provider is not None:
            execution = ExecutionManager(provider, settings)
    if execution is None:
        return

    from app.api.execution_routes import router as execution_router
    from app.api.practice_routes import router as practice_router
    from app.execution.manager import ExecutionError
    from app.execution.results import make_recorder

    if not execution.has_result_callback:
        execution.set_result_callback(make_recorder(app.state.sessions))

    records = automation_records()
    app.state.automation = records
    app.state.automation_modes = {pid: record.mode for pid, record in records.items()}
    app.state.execution = execution
    app.include_router(execution_router)
    app.include_router(practice_router)

    @app.exception_handler(ExecutionError)
    async def _execution_error(_: Request, exc: ExecutionError):
        return error_response(exc.status, exc.code, exc.message)


def _mount_filler(app: FastAPI, filler: Any) -> None:
    """Mount the Filler (v2) routes when FILLER_ENABLED=1 (or a test passes a `Filler`).

    Separate from the v1 browser agent above; with the flag off nothing from
    `app.filler` beyond its config is imported.
    """
    from app.filler.config import FillerSettings

    app.state.filler = None
    if filler is None:
        settings = FillerSettings.from_env()
        if not settings.enabled:
            return
        if not settings.gemini_api_key:
            logger.warning("FILLER_ENABLED is set but GEMINI_API_KEY is not; the Filler is off")
            return
        from app.filler.consent import FillerSessions
        from app.filler.dom_map import GeminiFieldMapper
        from app.filler.targets import all_targets
        from app.filler.extract import GeminiReader
        from app.filler.jobs import PaperJobs
        from app.filler.loop import GeminiModel
        from app.filler.runs import FillRuns, SpikeRuns
        from app.filler.sandbox import SandboxError, make_browser
        from app.filler.service import Filler

        try:
            browser = make_browser(settings)
        except SandboxError:
            logger.warning("FILLER_PROVIDER=%s is not configured; the Filler is off", settings.provider)
            return
        sessions = FillerSessions()
        make_model = lambda instruction: GeminiModel(settings.gemini_api_key, settings.model, instruction)  # noqa: E731
        filler = Filler(
            sessions=sessions,
            jobs=PaperJobs(GeminiReader(settings.gemini_api_key, settings.read_model)),
            spike=SpikeRuns(browser, make_model),
            runs=FillRuns(browser, make_model, sessions, targets=all_targets(),
                          mapper=GeminiFieldMapper(settings.gemini_api_key, settings.read_model)),
        )

    from app.api.filler_routes import router as filler_router
    from app.api.filler_routes import session_router as filler_session_router

    app.state.filler = filler
    app.include_router(filler_router)
    app.include_router(filler_session_router)
    if filler.runs is not None:
        from app.filler.results import make_recorder

        filler.runs.set_on_finish(make_recorder(app.state.sessions))
        # Programs the Filler can fill join the snapshot's existing list, so the plan's
        # "Fill my form" buttons appear for them (the Filler wins over v1 for a program).
        enabled = {pid: t.mode for pid, t in filler.runs.targets.items() if t.enabled}
        app.state.automation_modes = {**(getattr(app.state, "automation_modes", None) or {}), **enabled}


@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield
    # Release every cloud browser on shutdown.
    if getattr(app.state, "execution", None) is not None:
        await app.state.execution.shutdown()
    if getattr(app.state, "filler", None) is not None:
        await app.state.filler.shutdown()


def create_app(
    repository: ProgramsRepository | None = None,
    nessie: NessieService | None = None,
    execution: Any = None,
    filler: Any = None,
) -> FastAPI:
    """`execution` (an ExecutionManager) and `filler` (a Filler) are for tests; normally the env decides."""
    app = FastAPI(title="Community Resource Navigator API", version="0.1.0", lifespan=_lifespan)

    programs = repository or repository_from_env(os.environ.get("PROGRAM_SOURCE"))
    nessie = nessie or NessieService.from_env()
    inbox = DocumentInbox()
    checkpointer = get_checkpointer()
    graph = build_graph(
        checkpointer=checkpointer,
        user_intelligence=make_user_intelligence(nessie),
        document_analysis=make_document_analysis(inbox),
        discovery=make_discovery(programs),
        eligibility=eligibility,
        action_planning=action_planning,
    )
    app.state.programs = programs
    app.state.nessie = nessie
    app.state.documents = inbox
    app.state.sessions = SessionManager(graph, checkpointer, session_file=dev_sessions.session_file())

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _bad_request(_: Request, exc: RequestValidationError):
        # Do not echo the submitted values back.
        return error_response(422, "validation_error", "That answer isn't in a format we can read.")

    app.include_router(router)
    _mount_browser_agent(app, execution)
    _mount_filler(app, filler)
    return app


app = create_app()
