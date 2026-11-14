"""In-memory session lifecycle and graph execution.

Sessions live only in this process. `get_checkpointer()` is the single place
to swap in durable storage later; nothing else knows how state is kept.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from pydantic import BaseModel

from app.graph import state as state_module
from app.graph.build import run_config
from app.services.log_safety import describe_exception

logger = logging.getLogger(__name__)

# An answer's graph run usually finishes instantly. The API waits this long so
# the response can carry the next question; slower runs continue in the
# background while the client polls.
FAST_PATH_SECONDS = 0.8
RUN_TIMEOUT_SECONDS = 45
IDLE_EXPIRY_SECONDS = 2 * 60 * 60

RUN_FAILED_MESSAGE = "Something went wrong while updating your results. Please try again."
RUN_TIMEOUT_MESSAGE = "Updating your results took too long. Please try again."


def _state_model_allowlist() -> list[tuple[str, str]]:
    """Every Pydantic model in the state module, so checkpoints only ever
    deserialize into our own state types."""
    return [
        (state_module.__name__, name)
        for name, obj in vars(state_module).items()
        if isinstance(obj, type)
        and issubclass(obj, BaseModel)
        and obj.__module__ == state_module.__name__
    ]


def get_checkpointer() -> InMemorySaver:
    return InMemorySaver(
        serde=JsonPlusSerializer(allowed_msgpack_modules=_state_model_allowlist())
    )


def status_changes(before: dict[str, str], after: dict[str, str]) -> dict[str, list[str]]:
    """Which programs changed status during a run. Programs new to the list are ignored.

    Only a move to likely_eligible counts as a new fit. A program the person now says
    they already get (already_receiving) is not a new match, so it is reported as updated.
    """
    change: dict[str, list[str]] = {
        "moved_to_fit": [], "opens_later": [], "no_longer_fit": [], "updated": [],
    }
    for program_id, status in after.items():
        previous = before.get(program_id)
        if previous is None or previous == status:
            continue
        if status == "likely_eligible":
            change["moved_to_fit"].append(program_id)
        elif status == "opens_later":
            change["opens_later"].append(program_id)
        elif status == "likely_ineligible":
            change["no_longer_fit"].append(program_id)
        else:
            change["updated"].append(program_id)
    return change


def _statuses(values: dict[str, Any]) -> dict[str, str]:
    return {pid: a.status for pid, a in (values.get("eligibility_assessments") or {}).items()}


@dataclass
class SessionMeta:
    busy: bool = False
    last_seen: float = field(default_factory=time.monotonic)
    # (code, message) pairs from the most recent run, safe to show.
    run_notices: list[tuple[str, str]] = field(default_factory=list)
    # What the latest input changed (program ids by kind of change), set when its
    # run finishes and cleared by the next input. Statuses only, never answers.
    last_change: dict[str, list[str]] | None = None
    # Typed chat messages read so far (POST .../interpret), capped per session.
    interpret_count: int = 0
    # Web-search backup results, "<need>:<zip>" -> results. Lives and dies with the session.
    web_cache: dict[str, Any] = field(default_factory=dict)


class SessionManager:
    def __init__(self, graph: Any, checkpointer: Any) -> None:
        self._graph = graph
        self._checkpointer = checkpointer
        self._sessions: dict[str, SessionMeta] = {}
        self._tasks: set[asyncio.Task] = set()

    def create(self) -> str:
        """Start a session and run the graph once so the first question exists."""
        self._expire_idle()
        session_id = str(uuid.uuid4())
        self._sessions[session_id] = SessionMeta()
        self._graph.invoke({"session_id": session_id, "run_counts": {}}, run_config(session_id))
        return session_id

    def get(self, session_id: str) -> SessionMeta | None:
        meta = self._sessions.get(session_id)
        if meta is not None:
            meta.last_seen = time.monotonic()
        return meta

    def values(self, session_id: str) -> dict[str, Any]:
        """Latest checkpointed state. Safe to read while a run is in progress."""
        return self._graph.get_state(run_config(session_id)).values

    async def disconnect_bank(self, session_id: str) -> bool:
        """Forget the connected (simulated) bank: its summary, and any income figure read
        from it that the person never confirmed. A confirmed figure is their own answer
        now and stays. Then one run so questions and results catch up."""
        values = self.values(session_id)
        update: dict[str, Any] = {"financial_summary": None}
        profile = values.get("profile")
        if profile is not None:
            kept = {
                name: fact
                for name, fact in profile.facts.items()
                if not (fact.provenance == "nessie_sandbox" and not fact.confirmed)
            }
            update["profile"] = profile.model_copy(update={"facts": kept})
            update["changed_fields"] = sorted(set(profile.facts) - set(kept))
        self._graph.update_state(run_config(session_id), update, as_node="user_intelligence")
        return await self.submit(session_id, {"run_counts": {}})

    async def submit(self, session_id: str, graph_input: dict[str, Any]) -> bool:
        """Run the graph with new input. Returns True if it finished on the fast path.

        The caller must have checked that the session exists and is not busy.
        """
        meta = self._sessions[session_id]
        meta.busy = True
        meta.run_notices = []
        meta.last_change = None
        before = _statuses(self.values(session_id))
        task = asyncio.create_task(self._run(session_id, meta, graph_input, before))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        await asyncio.wait({task}, timeout=FAST_PATH_SECONDS)
        return task.done()

    async def _run(
        self,
        session_id: str,
        meta: SessionMeta,
        graph_input: dict[str, Any],
        before: dict[str, str],
    ) -> None:
        # Each run starts with fresh per-run budgets and a clean error list.
        payload = {**graph_input, "run_counts": {}, "errors": []}
        try:
            await asyncio.wait_for(
                asyncio.to_thread(self._graph.invoke, payload, run_config(session_id)),
                timeout=RUN_TIMEOUT_SECONDS,
            )
            meta.last_change = status_changes(before, _statuses(self.values(session_id)))
        except TimeoutError:
            logger.error("graph run timed out (session %s)", session_id)
            meta.run_notices.append(("run_timeout", RUN_TIMEOUT_MESSAGE))
        except Exception as exc:
            logger.error("graph run failed (session %s): %s", session_id, describe_exception(exc))
            meta.run_notices.append(("run_failed", RUN_FAILED_MESSAGE))
        finally:
            meta.busy = False

    def _expire_idle(self) -> None:
        cutoff = time.monotonic() - IDLE_EXPIRY_SECONDS
        for session_id, meta in list(self._sessions.items()):
            if not meta.busy and meta.last_seen < cutoff:
                del self._sessions[session_id]
                self._checkpointer.delete_thread(session_id)
