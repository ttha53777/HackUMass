"""FastAPI entry point: `uvicorn app.main:app --port 8000 --env-file .env`."""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError

from app.agents.action_planning import action_planning
from app.agents.discovery import make_discovery
from app.agents.eligibility import eligibility
from app.agents.user_intelligence import make_user_intelligence
from app.api.routes import ApiError, error_response, router
from app.graph.build import build_graph
from app.services.nessie import NessieService
from app.services.programs_repo import ProgramsRepository, repository_from_env
from app.services.session_store import SessionManager, get_checkpointer


def create_app(
    repository: ProgramsRepository | None = None, nessie: NessieService | None = None
) -> FastAPI:
    app = FastAPI(title="Community Resource Navigator API", version="0.1.0")

    programs = repository or repository_from_env(os.environ.get("PROGRAM_SOURCE"))
    nessie = nessie or NessieService.from_env()
    checkpointer = get_checkpointer()
    graph = build_graph(
        checkpointer=checkpointer,
        user_intelligence=make_user_intelligence(nessie),
        discovery=make_discovery(programs),
        eligibility=eligibility,
        action_planning=action_planning,
    )
    app.state.programs = programs
    app.state.nessie = nessie
    app.state.sessions = SessionManager(graph, checkpointer)

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _bad_request(_: Request, exc: RequestValidationError):
        # Do not echo the submitted values back.
        return error_response(422, "validation_error", "That answer isn't in a format we can read.")

    app.include_router(router)
    return app


app = create_app()
