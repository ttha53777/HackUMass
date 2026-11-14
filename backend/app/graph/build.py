"""Graph wiring (ticket T3).

CONTRACT FILE: only workstream A edits this file.

    START -> administrator -> one specialist -> administrator -> ... -> END

Specialists are passed in so each can be replaced or tested on its own. A
specialist is a plain function `(SessionState) -> dict` returning only the
state keys it owns.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from langgraph.graph import END, START, StateGraph

from app.graph.administrator import (
    DISCOVERY,
    DOCUMENT_ANALYSIS,
    ELIGIBILITY,
    PLANNING,
    SPECIALISTS,
    USER_INTELLIGENCE,
    administrator,
)
from app.graph.state import AgentStatus, SafeError, SessionState
from app.services.log_safety import describe_exception

logger = logging.getLogger(__name__)

Specialist = Callable[[SessionState], dict[str, Any]]

# Upper bound on node executions per run; the Administrator's own budget
# (two runs per specialist) keeps real runs far below this.
RECURSION_LIMIT = 25


def _document_analysis_not_wired(state: SessionState) -> dict[str, Any]:
    """Placeholder until the Document Agent lands (Phase 3). Never routed to yet."""
    return {}


def _guarded(name: str, specialist: Specialist) -> Specialist:
    """Record status, and turn any exception into a safe error instead of a crash."""

    def node(state: SessionState) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        try:
            update = dict(specialist(state) or {})
            status = "completed"
        except Exception as exc:
            # Node, session and code location only: answers and profile values stay out of logs.
            logger.error(
                "specialist %s failed (session %s): %s",
                name, state.get("session_id"), describe_exception(exc),
            )
            update = {
                "errors": list(state.get("errors") or [])
                + [
                    SafeError(
                        code="specialist_failed",
                        message="Part of your results could not be updated. Please try again.",
                        agent=name,  # type: ignore[arg-type]
                        at=now,
                    )
                ]
            }
            status = "failed"
            if name == USER_INTELLIGENCE:
                # Consume the input even on failure so the run cannot loop on it.
                update.update(user_answer=None, pending_evidence=None, changed_fields=[])
            elif name == DOCUMENT_ANALYSIS:
                update.update(pending_evidence=None)
        update["agent_statuses"] = {name: AgentStatus(status=status, updated_at=now)}
        return update

    return node


def build_graph(
    *,
    checkpointer: Any,
    user_intelligence: Specialist,
    discovery: Specialist,
    eligibility: Specialist,
    action_planning: Specialist,
    document_analysis: Specialist = _document_analysis_not_wired,
):
    builder = StateGraph(SessionState)
    builder.add_node("administrator", administrator, destinations=(*SPECIALISTS, DOCUMENT_ANALYSIS, END))
    builder.add_node(USER_INTELLIGENCE, _guarded(USER_INTELLIGENCE, user_intelligence))
    builder.add_node(DISCOVERY, _guarded(DISCOVERY, discovery))
    builder.add_node(ELIGIBILITY, _guarded(ELIGIBILITY, eligibility))
    builder.add_node(PLANNING, _guarded(PLANNING, action_planning))
    builder.add_node(DOCUMENT_ANALYSIS, _guarded(DOCUMENT_ANALYSIS, document_analysis))

    builder.add_edge(START, "administrator")
    for name in (*SPECIALISTS, DOCUMENT_ANALYSIS):
        builder.add_edge(name, "administrator")
    return builder.compile(checkpointer=checkpointer)


def run_config(session_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": session_id}, "recursion_limit": RECURSION_LIMIT}
