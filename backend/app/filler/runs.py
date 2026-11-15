"""Phase 1 spike runs: open a browser, stream it, let Gemini fill the practice page.

Not yet the session-scoped run registry from the spec (phase 3 replaces this): a
spike run belongs to no session, uses a fictional fill sheet, and loads a built-in
page with `set_content`, so it never leaves the browser. One spike at a time.

Every exit path closes the stream and releases the browser.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from app.filler.computer import Computer
from app.filler.loop import AgentLoop, BrowserModel, FillSheet, LoopEnd, ModelUnavailable, SheetEntry, system_instruction
from app.filler.sandbox import BrowserHandle, CloudBrowser, SandboxError
from app.filler.stream import LiveStream
from app.services.log_safety import describe_exception

logger = logging.getLogger(__name__)

SPIKE_PAGE = (Path(__file__).with_name("spike_page.html")).read_text()
SPIKE_TASK = "Fill in the first name and last name fields from the fill sheet, then click Next."
# An obviously fictional person; nothing real is ever typed in a spike.
SPIKE_SHEET = {
    "first_name": SheetEntry("Maya", "first name", "your practice paper"),
    "last_name": SheetEntry("Rivera", "last name", "your practice paper"),
}
FIELDS = {"first_name": "#first_name", "last_name": "#last_name"}
# The page is served by a Playwright route, so it has a real URL (Gemini rejects turns
# whose URL is about:blank with a misleading "safety violations" 400) but the browser
# still never reaches the network. `.test` is a reserved TLD.
SPIKE_URL = "https://practice.filler.test/"

ACTIVE = ("starting", "running")


async def _serve_spike_page(route: Any) -> None:
    """Fulfil the practice page; abort every other request (the spike stays offline)."""
    if route.request.url == SPIKE_URL:
        await route.fulfill(status=200, content_type="text/html; charset=utf-8", body=SPIKE_PAGE)
    else:
        await route.abort("blockedbyclient")


class SpikeBusy(Exception):
    pass


@dataclass
class SpikeRun:
    id: str
    stream: LiveStream = field(default_factory=LiveStream)
    status: str = "starting"  # starting | running | done | failed | stopped
    message: str | None = None
    started_at: float = field(default_factory=time.monotonic)
    first_type_seconds: float | None = None
    end: LoopEnd | None = None
    filled: dict[str, bool] = field(default_factory=dict)
    peak_fps: float = 0.0
    task: asyncio.Task[None] | None = None

    def view(self) -> dict[str, Any]:
        return {
            "run_id": self.id,
            "status": self.status,
            "message": self.message,
            "frames": self.stream.frames,
            "peak_fps": round(self.peak_fps or self.stream.peak_fps(), 1),
            "first_type_seconds": None if self.first_type_seconds is None else round(self.first_type_seconds, 1),
            "actions": self.end.actions if self.end else None,
            "end": self.end.kind if self.end else None,
            "filled": self.filled,
        }


class _TimedStream(LiveStream):
    """Notes when the first value starts being typed, for the latency check."""

    def __init__(self, run: SpikeRun) -> None:
        super().__init__()
        self._run = run

    def step(self, caption: str, field_key: str | None = None) -> None:
        if field_key and self._run.first_type_seconds is None:
            self._run.first_type_seconds = time.monotonic() - self._run.started_at
        super().step(caption, field_key)


class SpikeRuns:
    def __init__(self, browser: CloudBrowser, make_model: Callable[[str], BrowserModel], *,
                 type_delay_ms: int | None = None) -> None:
        self._browser = browser
        self._make_model = make_model
        self._type_delay_ms = type_delay_ms
        self._runs: dict[str, SpikeRun] = {}

    def get(self, run_id: str) -> SpikeRun | None:
        return self._runs.get(run_id)

    def start(self) -> SpikeRun:
        if any(run.status in ACTIVE for run in self._runs.values()):
            raise SpikeBusy
        run = SpikeRun(id=secrets.token_urlsafe(12))
        run.stream = _TimedStream(run)
        self._runs = {run.id: run}  # keep only the latest spike
        run.task = asyncio.create_task(self._run(run))
        return run

    async def stop(self, run_id: str) -> SpikeRun | None:
        run = self._runs.get(run_id)
        if run is None:
            return None
        if run.task and not run.task.done():
            run.task.cancel()
            try:
                await run.task
            except (asyncio.CancelledError, Exception):
                pass
        return run

    async def shutdown(self) -> None:
        for run_id in list(self._runs):
            await self.stop(run_id)

    async def _run(self, run: SpikeRun) -> None:
        handle: BrowserHandle | None = None
        stream = run.stream
        try:
            stream.status("starting", "Opening the browser")
            handle = await self._browser.open()
            page = handle.page
            await stream.start_screencast(page)
            await page.route("**/*", _serve_spike_page)
            await page.goto(SPIKE_URL, wait_until="domcontentloaded")
            sheet = FillSheet(dict(SPIKE_SHEET))
            model = self._make_model(system_instruction(sheet))
            kwargs = {} if self._type_delay_ms is None else {"type_delay_ms": self._type_delay_ms}
            computer = Computer(page, stream, **kwargs)
            run.status = "running"
            run.end = await AgentLoop(model, computer, stream, sheet).run(SPIKE_TASK)
            # Check the practice page itself (fictional values only).
            for key, selector in FIELDS.items():
                run.filled[key] = (await page.input_value(selector)) == SPIKE_SHEET[key].value
            run.status = "done"
            stream.status("done", "Finished the practice form")
        except asyncio.CancelledError:
            run.status, run.message = "stopped", "Stopped."
            stream.status("stopped", run.message)
            raise
        except SandboxError as exc:
            run.status, run.message = "failed", str(exc)
            stream.status("failed", run.message)
        except ModelUnavailable:
            run.status, run.message = "failed", "Our helper couldn't reach Google's AI."
            stream.status("failed", run.message)
        except Exception as exc:
            logger.error("filler spike crashed: %s", describe_exception(exc))
            run.status, run.message = "failed", "Something went wrong."
            stream.status("failed", run.message)
        finally:
            run.peak_fps = stream.peak_fps()
            await stream.close()
            if handle is not None:
                await handle.close()
