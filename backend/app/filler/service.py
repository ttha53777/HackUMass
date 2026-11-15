"""Everything the Filler routes need, built once per app (or by a test)."""

from __future__ import annotations

from dataclasses import dataclass

from app.filler.consent import FillerSessions
from app.filler.jobs import PaperJobs
from app.filler.runs import FillRuns, SpikeRuns


@dataclass
class Filler:
    sessions: FillerSessions
    jobs: PaperJobs
    spike: SpikeRuns
    runs: FillRuns | None = None

    def __post_init__(self) -> None:
        # A session's state dropped (idle) cancels its reads too.
        self.sessions.set_on_drop(lambda _sid, state: self.jobs.cancel_session(state))

    async def shutdown(self) -> None:
        await self.jobs.shutdown()
        await self.spike.shutdown()
        if self.runs is not None:
            await self.runs.shutdown()
