"""A finished run's outcome, into the person's plan (the main graph's `application_result`).

The same input v1 uses, so the Administrator stores it and Action Planning updates the
next step. Only the status and the page's own reference are recorded, never a value.
The main graph runs one input at a time, so this waits for the session to be idle and
gives up quietly if the session is gone.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Awaitable, Callable

from app.graph.state import ApplicationRecord

if TYPE_CHECKING:
    from app.filler.runs import FillRun
    from app.services.session_store import SessionManager

logger = logging.getLogger(__name__)

WAIT_FOR_IDLE_SECONDS = 60
POLL_SECONDS = 0.25


def record_for(run: FillRun) -> ApplicationRecord | None:
    """What the plan should say. A failed run, or one tied to no program, records nothing."""
    if run.target is None:
        return None
    now = datetime.now(timezone.utc)
    pid = run.target.program_id
    if run.status == "done" and run.outcome:
        if run.outcome["status"] == "submitted":
            return ApplicationRecord(program_id=pid, status="submitted", updated_at=now,
                                     confirmation=run.outcome.get("confirmation"))
        return ApplicationRecord(program_id=pid, status="stopped", updated_at=now)
    if run.status == "stopped":
        return ApplicationRecord(program_id=pid, status="stopped", updated_at=now)
    return None


def make_recorder(sessions: SessionManager, *, wait_seconds: float = WAIT_FOR_IDLE_SECONDS) -> Callable[[FillRun], Awaitable[None]]:
    async def record(run: FillRun) -> None:
        result = record_for(run)
        if result is None:
            return
        deadline = time.monotonic() + wait_seconds
        while True:
            meta = sessions.get(run.session_id)
            if meta is None:
                return
            if not meta.busy:
                # No await between the check and submit(), which marks the session busy first.
                await sessions.submit(run.session_id, {"application_result": result})
                run.result_recorded = True
                return
            if time.monotonic() > deadline:
                logger.warning("filler result dropped: the session stayed busy")
                return
            await asyncio.sleep(POLL_SECONDS)

    return record
