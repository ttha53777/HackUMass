"""Runs: the phase 1 spike (no session), and phase 3 fill runs (one per session).

Fill runs open a browser, stream it, let Gemini fill the practice form from the
session's confirmed details, ask the person for anything missing, hand the browser to
them for anything that is theirs, stop at the final Submit for their review, and read
the result. Every exit path closes the stream and releases the browser.

Phase 1 spike runs: open a browser, stream it, let Gemini fill the practice page.

Not yet the session-scoped run registry from the spec (phase 3 replaces this): a
spike run belongs to no session, uses a fictional fill sheet, and loads a built-in
page with `set_content`, so it never leaves the browser. One spike at a time.

Every exit path closes the stream and releases the browser.
"""

from __future__ import annotations

import asyncio
import logging
import re as _re
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from app.filler.computer import Computer
from app.filler.consent import FillerSession, FillerSessions
from app.filler.gate import HandoffReason
from app.filler.models import CATALOGUE, KIND_LABEL
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
SPIKE_HOSTS = frozenset({"practice.filler.test"})

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
            run.end = await AgentLoop(model, computer, stream, sheet, allowed_hosts=SPIKE_HOSTS).run(SPIKE_TASK)
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


# ===========================================================================
# Fill runs (phase 3): one per session, filling a form from confirmed details
# ===========================================================================

PRACTICE_PAGE = (Path(__file__).with_name("practice.html")).read_text()
PRACTICE_URL = "https://practice.filler.test/practice/"
PRACTICE_HOSTS = frozenset({"practice.filler.test"})
FILL_TASK = "Fill in the application on this page from the fill sheet, step by step, up to its final Submit button."
PRACTICE_RECEIVED = "Practice application received"
_PRACTICE_REF = _re.compile(r"\bPRACTICE-[A-Z0-9]{6}\b")

MAX_RUNS = 2
WAIT_SECONDS = 5 * 60  # longest wait for one answer, hand-off or pause
RUN_SECONDS = 15 * 60  # the whole run, as Steel's free tier caps a session

FillStatus = str  # preparing | filling | needs_answer | paused | needs_you | review | verifying | done | stopped | failed
ACTIVE_FILL = ("preparing", "filling", "needs_answer", "paused", "needs_you", "review", "verifying")
INTERACTIVE = ("needs_you", "review")  # the person may click and type in the live view

HANDOFF_TEXT: dict[str, str] = {
    "choice": "This question is yours to answer. Pick your answer, then hand back.",
    "attestation": "This part asks you to confirm or sign. Do it yourself, then hand back.",
    "sign_in": "This page asks you to sign in. Sign in yourself, then hand back.",
    "captcha": "This page wants to check you're a person. Do the check, then hand back.",
    "sensitive_field": "This field asks for something we never fill in. Fill it yourself if you want to.",
    "file_upload": "This page asks you to upload a file. Upload it yourself, then hand back.",
    "safety_confirmation": "Please do this step yourself, then hand back.",
    "unknown_field": "This part of the page is one we can't fill. Do it yourself, then hand back.",
    "stuck": "The helper needs you to do this part, then hand back.",
    "person_requested": "You have the controls. Hand back when you're ready.",
}
_KEYS_PERSON = _re.compile(r"^[A-Za-z0-9]$|^(Enter|Tab|Backspace|Delete|Escape|Space|Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown)$")


class RunError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass
class FillRun:
    id: str
    session_id: str
    state: FillerSession
    stream: LiveStream = field(default_factory=LiveStream)
    status: FillStatus = "preparing"
    message: str | None = None
    question: dict[str, str] | None = None
    handoff_reason: str | None = None
    filled: list[str] = field(default_factory=list)
    outcome: dict[str, Any] | None = None
    started_at: float = field(default_factory=time.monotonic)
    task: asyncio.Task[None] | None = None
    computer: Computer | None = None
    handle: BrowserHandle | None = None
    wait_seconds: float = WAIT_SECONDS
    _wake: asyncio.Event = field(default_factory=asyncio.Event)
    _answered: bool = False
    _pause: bool = False
    _take: bool = False
    _done: bool = False

    # -- view ----------------------------------------------------------------------

    def view(self) -> dict[str, Any]:
        return {
            "run_id": self.id,
            "status": self.status,
            "message": self.message,
            "question": self.question,
            "handoff": ({"reason": self.handoff_reason, "text": HANDOFF_TEXT.get(self.handoff_reason, "")}
                        if self.handoff_reason else None),
            "filled": [{"key": k, "label": CATALOGUE[k].label} for k in self.filled if k in CATALOGUE],
            "outcome": self.outcome,
            "seconds_left": max(0, int(RUN_SECONDS - (time.monotonic() - self.started_at))),
        }

    def _set(self, status: FillStatus, message: str | None = None) -> None:
        self.status, self.message = status, message
        self.stream.status(status, message)

    # -- hooks the loop calls ---------------------------------------------------------

    async def _sleep_until_woken(self) -> None:
        self._wake.clear()
        try:
            await asyncio.wait_for(self._wake.wait(), timeout=self.wait_seconds)
        except asyncio.TimeoutError:
            raise RunTimedOut from None

    async def ask(self, key: str) -> bool:
        label = CATALOGUE[key].label
        self.question = {"key": key, "label": label, "text": f"What is your {label}?"}
        self._answered = False
        self.stream.publish({"type": "question", **self.question})
        self._set("needs_answer")
        await self._sleep_until_woken()
        self.question = None
        self._set("filling")
        return self._answered

    async def handoff(self, reason: HandoffReason) -> None:
        self.handoff_reason = reason
        self._take = False
        self.stream.publish({"type": "handoff", "reason": reason, "text": HANDOFF_TEXT.get(reason, "")})
        self._set("needs_you")
        await self._sleep_until_woken()
        self.handoff_reason = None
        self._set("filling")

    async def checkpoint(self) -> None:
        if self._take:
            await self.handoff("person_requested")
        if self._pause:
            self._set("paused")
            while self._pause:
                await self._sleep_until_woken()
            self._set("filling")

    # -- the person -----------------------------------------------------------------

    def answer(self, answered: bool) -> None:
        if self.status != "needs_answer":
            raise RunError(409, "no_question", "There's no question waiting.")
        self._answered = answered
        self._wake.set()

    def control(self, action: str) -> None:
        if action == "pause" and self.status in ("filling", "preparing"):
            self._pause = True
        elif action == "resume" and self._pause:
            self._pause = False
            self._wake.set()
        elif action == "take" and self.status in ("filling", "paused", "preparing"):
            self._take, self._pause = True, False
            self._wake.set()
        elif action == "return" and self.status == "needs_you":
            self._wake.set()
        elif action == "done" and self.status == "review":
            self._done = True
            self._wake.set()
        else:
            raise RunError(409, "bad_control", "That isn't possible right now.")

    async def person_input(self, event: dict[str, Any]) -> None:
        """A click, scroll or key from the viewer, during a hand-off or the review only."""
        if self.status not in INTERACTIVE or self.computer is None:
            return
        page = self.computer.page
        kind = event.get("type")
        try:
            if kind == "mouse":
                x, y = int(event.get("x", 0)), int(event.get("y", 0))
                if not (0 <= x < 4000 and 0 <= y < 4000):
                    return
                if event.get("action") == "click":
                    await page.mouse.click(x, y)
                elif event.get("action") == "wheel":
                    await page.mouse.wheel(0, max(-2000, min(2000, int(event.get("dy", 0)))))
                else:
                    await page.mouse.move(x, y)
                self.stream.cursor(x, y, "click" if event.get("action") == "click" else "move")
            elif kind == "key" and _KEYS_PERSON.match(str(event.get("key", ""))):
                await page.keyboard.press(str(event["key"]))
            elif kind == "text":
                await page.keyboard.insert_text(str(event.get("text", ""))[:200])
        except Exception as exc:  # the person's input never crashes the run
            logger.info("person input failed (%s)", exc.__class__.__name__)


class RunTimedOut(Exception):
    pass


def fill_sheet_for(state: FillerSession) -> FillSheet:
    """The live fill sheet: confirmed details whose paper is still consented (or typed)."""

    def entries() -> dict[str, SheetEntry]:
        return {
            key: SheetEntry(d.value, CATALOGUE[key].label,
                            f"your {KIND_LABEL[d.paper_kind]}" if d.source == "paper" and d.paper_kind in KIND_LABEL else None)
            for key, d in state.confirmed().items()
        }

    return FillSheet(source=entries)


class FillRuns:
    """Runs by id, at most one active per session and MAX_RUNS in all."""

    def __init__(self, browser: CloudBrowser, make_model: Callable[[str], BrowserModel], sessions: FillerSessions,
                 *, type_delay_ms: int | None = None, wait_seconds: float | None = None) -> None:
        self._browser, self._make_model, self._sessions = browser, make_model, sessions
        self._type_delay_ms = type_delay_ms
        self._wait_seconds = wait_seconds or WAIT_SECONDS
        self._runs: dict[str, FillRun] = {}

    def get(self, session_id: str, run_id: str) -> FillRun:
        run = self._runs.get(run_id)
        if run is None or run.session_id != session_id:  # one session never sees another's run
            raise RunError(404, "run_not_found", "That run doesn't exist.")
        return run

    def start(self, session_id: str) -> FillRun:
        active = [r for r in self._runs.values() if r.status in ACTIVE_FILL]
        if any(r.session_id == session_id for r in active):
            raise RunError(409, "run_active", "A form is already being filled. Stop it first.")
        if len(active) >= MAX_RUNS:
            raise RunError(429, "too_many_runs", "The helper is busy. Try again in a few minutes.")
        state = self._sessions.get(session_id)
        assert state is not None
        run = FillRun(id=secrets.token_urlsafe(12), session_id=session_id, state=state, wait_seconds=self._wait_seconds)
        for old_id, old in list(self._runs.items()):  # keep finished runs of other sessions briefly
            if old.session_id == session_id and old.status not in ACTIVE_FILL:
                del self._runs[old_id]
        self._runs[run.id] = run
        run.task = asyncio.create_task(self._run(run))
        return run

    async def stop(self, session_id: str, run_id: str) -> FillRun:
        run = self.get(session_id, run_id)
        if run.task and not run.task.done():
            run.task.cancel()
            try:
                await run.task
            except (asyncio.CancelledError, Exception):
                pass
        return run

    async def shutdown(self) -> None:
        for run in list(self._runs.values()):
            if run.task and not run.task.done():
                run.task.cancel()
                try:
                    await run.task
                except (asyncio.CancelledError, Exception):
                    pass

    async def _run(self, run: FillRun) -> None:
        stream = run.stream
        try:
            await asyncio.wait_for(self._fill(run), timeout=RUN_SECONDS)
        except asyncio.CancelledError:
            run._set("stopped", "Stopped. Nothing was sent.")
            raise
        except (asyncio.TimeoutError, RunTimedOut):
            run._set("stopped", "Stopped after waiting too long. Nothing was sent.")
        except SandboxError as exc:
            run._set("failed", str(exc))
        except ModelUnavailable:
            run._set("failed", "Our helper couldn't reach Google's AI. You can fill the form yourself.")
        except Exception as exc:
            logger.error("filler run crashed: %s", describe_exception(exc))
            run._set("failed", "Something went wrong. Nothing was sent.")
        finally:
            handle, run.handle, run.computer = run.handle, None, None
            await stream.close()
            if handle is not None:
                await handle.close()

    async def _fill(self, run: FillRun) -> None:
        stream = run.stream
        run._set("preparing", "Opening the form")
        run.handle = await self._browser.open()
        page = run.handle.page
        await stream.start_screencast(page)
        await page.route("**/*", _serve_practice)
        await page.goto(PRACTICE_URL, wait_until="domcontentloaded")
        sheet = fill_sheet_for(run.state)
        askable = frozenset(CATALOGUE)
        kwargs = {} if self._type_delay_ms is None else {"type_delay_ms": self._type_delay_ms}
        run.computer = Computer(page, stream, allowed_hosts=PRACTICE_HOSTS, **kwargs)
        model = self._make_model(system_instruction(sheet, askable))
        loop = AgentLoop(model, run.computer, stream, sheet, allowed_hosts=PRACTICE_HOSTS, askable=askable, hooks=run)
        run._set("filling")
        end = await loop.run(FILL_TASK)
        run.filled = list(end.typed_keys)

        # Review: the person checks the highlighted fields and presses the form's own Submit.
        count = await run.computer.highlight_filled()
        stream.step(f"Filled {count} field{'' if count == 1 else 's'}. Check them, then press Submit yourself.")
        run._set("review", "Check what was filled, then press the form's Submit button yourself.")
        while not run._done:
            await run._sleep_until_woken()

        run._set("verifying", "Checking the result")
        text = await page.inner_text("body")
        if PRACTICE_RECEIVED in text:
            ref = _PRACTICE_REF.search(text)
            run.outcome = {"status": "submitted", "confirmation": ref.group(0) if ref else None}
            run._set("done", "The form was sent. Keep the reference for your records.")
        else:
            run.outcome = {"status": "not_submitted", "confirmation": None}
            run._set("done", "The form wasn't sent.")


async def _serve_practice(route: Any) -> None:
    """Fulfil the practice form; abort everything else (the practice run stays offline)."""
    if route.request.url.split("#")[0].split("?")[0] == PRACTICE_URL:
        await route.fulfill(status=200, content_type="text/html; charset=utf-8", body=PRACTICE_PAGE)
    else:
        await route.abort("blockedbyclient")
