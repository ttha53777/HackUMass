"""Writes a finished run's outcome into the main graph (plan section 3).

The run's result becomes the main graph input `application_result`; the
Administrator stores it and Action Planning updates the next step. Nothing about
the form's contents is recorded, only the status and the page's own
confirmation reference.

The main graph runs one input at a time, so the recorder waits for the session
to be idle (a person may be answering a question in another tab) before it
submits, and gives up quietly if the session is gone.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Awaitable, Callable

from app.graph.state import ApplicationRecord

if TYPE_CHECKING:
    from app.execution.manager import Run
    from app.services.session_store import SessionManager

logger = logging.getLogger(__name__)

WAIT_FOR_IDLE_SECONDS = 60
POLL_SECONDS = 0.25

# What the final page showed -> what the plan records. A form that was not sent
# is recorded as "stopped": the usual next step still applies.
OUTCOME_TO_STATUS = {"submitted": "submitted", "unclear": "unclear", "not_submitted": "stopped"}


def record_for(run: Run) -> ApplicationRecord | None:
    """The record a finished run leaves behind, or None (a failed run leaves none)."""
    now = datetime.now(timezone.utc)
    if run.status == "done" and run.outcome is not None:
        status = OUTCOME_TO_STATUS[run.outcome.status]
        confirmation = run.outcome.confirmation_text if status == "submitted" else None
        return ApplicationRecord(
            program_id=run.target.program_id, status=status, updated_at=now, confirmation=confirmation  # type: ignore[arg-type]
        )
    if run.status == "stopped":
        return ApplicationRecord(program_id=run.target.program_id, status="stopped", updated_at=now)
    return None


def make_recorder(
    sessions: SessionManager, *, wait_seconds: float = WAIT_FOR_IDLE_SECONDS
) -> Callable[[Run], Awaitable[None]]:
    async def record(run: Run) -> None:
        result = record_for(run)
        if result is None:
            return
        deadline = time.monotonic() + wait_seconds
        while True:
            meta = sessions.get(run.session_id)
            if meta is None:
                return  # the session expired; nothing to update
            if not meta.busy:
                # No await between the check and submit(), which marks the session busy
                # before it yields, so no other input can slip in between.
                await sessions.submit(run.session_id, {"application_result": result})
                return
            if time.monotonic() > deadline:
                logger.warning("application result dropped: session stayed busy (run %s)", run.run_id)
                return
            await asyncio.sleep(POLL_SECONDS)

    return record
