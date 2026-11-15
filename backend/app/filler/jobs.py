"""Background reading of consented papers, so details are ready before a form opens.

`PaperJobs.schedule` is called when a paper gains consent (its own switch, or
auto-read at upload). The read runs as an asyncio task, at most `CONCURRENCY` at
once. The reader is called ONLY from here, and only after checking the paper's
consent; when the answer comes back the consent is checked again, so a switch
turned off mid-read discards what was read. After a successful read the file bytes
are dropped; only the details remain.
"""

from __future__ import annotations

import asyncio
import logging
import time

from starlette.concurrency import run_in_threadpool

from app.filler.consent import FillerSession
from app.filler.extract import PaperReader, PaperRejected, ReaderUnavailable, build_request, interpret
from app.filler.models import Paper
from app.services.log_safety import describe_exception

logger = logging.getLogger(__name__)

CONCURRENCY = 2
READ_AGAIN = "Add this paper again so we can read it."
COULD_NOT_READ = "We couldn't read this paper. Try again, or type the details in."


class PaperJobs:
    def __init__(self, reader: PaperReader, concurrency: int = CONCURRENCY) -> None:
        self._reader = reader
        self._limit = asyncio.Semaphore(concurrency)
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self.read_seconds: dict[str, float] = {}  # paper id -> seconds from schedule to done (for the gate)

    def schedule(self, state: FillerSession, paper: Paper) -> None:
        if paper.consent is None:
            return  # never read without consent
        if paper.data is None:
            paper.status, paper.message = "failed", READ_AGAIN
            return
        self.cancel(paper.id)
        paper.status, paper.message, paper.found = "queued", None, 0
        self._tasks[paper.id] = asyncio.create_task(self._read(state, paper))

    def cancel(self, paper_id: str) -> None:
        task = self._tasks.pop(paper_id, None)
        if task is not None and not task.done():
            task.cancel()

    def cancel_session(self, state: FillerSession) -> None:
        for paper_id in list(state.papers):
            self.cancel(paper_id)

    async def wait(self, paper_id: str) -> None:
        """Tests and scripts: wait for a paper's read to finish."""
        task = self._tasks.get(paper_id)
        if task is not None:
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def shutdown(self) -> None:
        for paper_id in list(self._tasks):
            self.cancel(paper_id)

    async def _read(self, state: FillerSession, paper: Paper) -> None:
        started = time.monotonic()
        consent = paper.consent
        try:
            async with self._limit:
                if not state.may_read(paper, consent) or paper.data is None:
                    return
                paper.status = "reading"
                assert consent is not None
                request = await run_in_threadpool(build_request, paper.data, paper.mime, consent.scopes, paper.kind_hint)
                raw = await self._reader.read(request)
                if not state.may_read(paper, consent):
                    return  # the switch went off while reading: discard everything
                kind, details = interpret(raw, paper_id=paper.id, pages=paper.pages, scopes=consent.scopes,
                                          photo=paper.mime != "application/pdf")
                paper.kind = kind
                state.propose(details)
                paper.found = len(details)
                paper.status, paper.data = "done", None  # read once; keep only the details
                self.read_seconds[paper.id] = time.monotonic() - started
        except asyncio.CancelledError:
            if paper.status in ("queued", "reading"):
                paper.status = "waiting"
            raise
        except (ReaderUnavailable, PaperRejected):
            paper.status, paper.message = "failed", COULD_NOT_READ
        except Exception as exc:
            logger.error("paper read crashed: %s", describe_exception(exc))
            paper.status, paper.message = "failed", COULD_NOT_READ
        finally:
            if self._tasks.get(paper.id) is asyncio.current_task():
                del self._tasks[paper.id]
