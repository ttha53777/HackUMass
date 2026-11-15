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
    injected = execution is not None  # a test's manager brings its own model
    if execution is None and settings.provider != "off":
        if not settings.gemini_api_key:
            # The manifest engine needs no model: only forms with a field map are offered.
            logger.warning("GEMINI_API_KEY is not set; the browser agent fills only practice forms with a field map")
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
    if not settings.gemini_api_key and not injected:
        records = {pid: r for pid, r in records.items() if r.form_id}
    app.state.automation = records
    app.state.automation_modes = {pid: record.mode for pid, record in records.items()}
    app.state.execution = execution
    app.include_router(execution_router)
    app.include_router(practice_router)

    @app.exception_handler(ExecutionError)
    async def _execution_error(_: Request, exc: ExecutionError):
        return error_response(exc.status, exc.code, exc.message)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield
    # Release every cloud browser on shutdown.
    if getattr(app.state, "execution", None) is not None:
        await app.state.execution.shutdown()


def create_app(
    repository: ProgramsRepository | None = None,
    nessie: NessieService | None = None,
    execution: Any = None,
) -> FastAPI:
    """`execution` (an ExecutionManager) is for tests; normally BROWSER_PROVIDER decides."""
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
    return app


app = create_app()
