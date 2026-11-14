"""Run registry for the browser execution agent (one active run per session).

Copies the shape of `SessionManager`: in-process only, no database. Each run is
one asyncio task:

    starting -> working <-> needs_answer | needs_you -> verifying -> done
    (any state) -> stopped | failed

A pause is an asyncio.Event the loop awaits; the answer, control and stop routes
set it. This is the plain state machine the plan names as the fallback for a
LangGraph `interrupt()` graph, chosen because resuming an interrupted node
re-runs it (replaying browser actions), a live browser cannot be checkpointed,
and the private fill-sheet values must stay out of checkpoints.

Private details (the FieldStore) live only on the Run object and are wiped when
the run ends, whatever the exit path. Screenshots stay in memory.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from app.execution.agent import Agent, AgentEnd, BrowserModel, GeminiBrowserModel, system_instruction
from app.execution.computer import Computer, Observation
from app.execution.config import (
    MAX_CONCURRENT_RUNS,
    PAUSE_SECONDS,
    SESSION_SECONDS,
    AgentSettings,
    RunTarget,
)
from app.execution.fields import FieldStore, InvalidAnswer, clean_answer, question_for
from app.execution.gate import Action, PageFacts
from app.execution.models import (
    ACTIVE_STATUSES,
    HANDOFF_MESSAGES,
    HandoffReason,
    HandoffView,
    Outcome,
    RunStatus,
    RunView,
    StepLog,
)
from app.execution.provider import BrowserProvider, BrowserSession, ProviderError
from app.execution.verify import verify
from app.graph.state import AnswerIn
from app.services.log_safety import describe_exception

logger = logging.getLogger(__name__)

CLOSE_TIMEOUT_SECONDS = 5
KEEP_FINISHED_SECONDS = 15 * 60
MAX_STEP_LOG = 80
# Leave a margin so we release the browser before the provider kills it.
RUN_DEADLINE_SECONDS = SESSION_SECONDS - 30

END_MESSAGES = {
    "finished": None,
    "step_limit": "The assistant reached its step limit. Check the page and finish it yourself if needed.",
    "time_limit": "The assistant ran out of time. Check the page and finish it yourself if needed.",
}
PAUSE_TIMEOUT_MESSAGE = "We waited a while with no reply, so we closed the browser. Nothing was sent."
DEADLINE_MESSAGE = "The browser session ran out of time, so we closed it."
STOPPED_MESSAGE = "You stopped the assistant and we closed the browser."
FAILED_MESSAGE = "Something went wrong with the browser. Nothing more was filled in."


class ExecutionError(Exception):
    """Maps to an API error. The message is safe to show."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class _PauseTimeout(Exception):
    pass


ModelFactory = Callable[[str], BrowserModel]  # system instruction -> model client
ResultCallback = Callable[["Run"], Awaitable[None]]


@dataclass
class Run:
    run_id: str
    session_id: str
    target: RunTarget
    store: FieldStore
    status: RunStatus = "starting"
    steps: list[StepLog] = field(default_factory=list)
    question_key: str | None = None
    handoff_reason: HandoffReason | None = None
    outcome: Outcome | None = None
    message: str | None = None
    browser: BrowserSession | None = None
    last_frame: bytes | None = None  # newest screenshot, memory only
    started: float = field(default_factory=time.monotonic)
    finished: float | None = None
    task: asyncio.Task | None = None
    # True once the outcome has been written to the main graph (or there was nothing
    # to write). The panel refreshes the session snapshot after this.
    result_recorded: bool = False
    _resume: asyncio.Event = field(default_factory=asyncio.Event)
    _answered: bool = False
    _takeover: bool = False

    @property
    def active(self) -> bool:
        return self.status in ACTIVE_STATUSES

    def seconds_left(self) -> int | None:
        if not self.active:
            return None
        return max(0, int(self.started + RUN_DEADLINE_SECONDS - time.monotonic()))

    def view(self) -> RunView:
        interactive = self.status == "needs_you"
        live = None
        if self.browser is not None and self.status in ("working", "needs_answer", "needs_you", "verifying"):
            live = self.browser.live_view_url(interactive)
        return RunView(
            run_id=self.run_id,
            program_id=self.target.program_id,
            mode=self.target.mode,  # type: ignore[arg-type]
            status=self.status,
            steps=list(self.steps),
            question=question_for(self.question_key) if self.status == "needs_answer" and self.question_key else None,
            handoff=HandoffView(reason=self.handoff_reason, message=HANDOFF_MESSAGES[self.handoff_reason])
            if self.status == "needs_you" and self.handoff_reason
            else None,
            live_view_url=live,
            interactive=interactive and live is not None,
            has_frame=self.last_frame is not None and self.active,
            seconds_left=self.seconds_left(),
            outcome=self.outcome,
            message=self.message,
            result_recorded=self.result_recorded,
        )


class _RecordingComputer:
    """Keeps the newest screenshot on the run for the fallback view."""

    def __init__(self, inner: Computer, run: Run) -> None:
        self._inner, self._run = inner, run

    async def observe(self) -> Observation:
        observation = await self._inner.observe()
        self._run.last_frame = observation.screenshot
        return observation

    async def facts(self, action: Action) -> PageFacts:
        return await self._inner.facts(action)

    async def execute(self, action: Action, value: str | None = None) -> dict[str, Any]:
        return await self._inner.execute(action, value)

    async def page_text(self) -> str:
        return await self._inner.page_text()


class _Hooks:
    """The agent's view of its run: logging and pauses."""

    def __init__(self, run: Run, pause_seconds: float) -> None:
        self._run, self._pause_seconds = run, pause_seconds

    def log(self, kind: str, text: str) -> None:
        steps = self._run.steps
        steps.append(StepLog(at=datetime.now(timezone.utc), kind=kind, text=text))  # type: ignore[arg-type]
        del steps[:-MAX_STEP_LOG]

    def takeover_requested(self) -> bool:
        return self._run._takeover

    async def _wait(self) -> None:
        try:
            await asyncio.wait_for(self._run._resume.wait(), timeout=self._pause_seconds)
        except TimeoutError as exc:
            raise _PauseTimeout from exc
        finally:
            self._run._resume.clear()

    async def ask(self, field_key: str) -> bool:
        run = self._run
        run.question_key, run._answered, run.status = field_key, False, "needs_answer"
        await self._wait()
        run.question_key, run.status = None, "working"
        return run._answered

    async def handoff(self, reason: HandoffReason) -> None:
        run = self._run
        run.handoff_reason, run.status = reason, "needs_you"
        await self._wait()
        run.handoff_reason, run._takeover, run.status = None, False, "working"


class ExecutionManager:
    def __init__(
        self,
        provider: BrowserProvider,
        settings: AgentSettings,
        *,
        model_factory: ModelFactory | None = None,
        on_result: ResultCallback | None = None,
        pause_seconds: float = PAUSE_SECONDS,
        run_deadline: float = RUN_DEADLINE_SECONDS,
    ) -> None:
        self._provider = provider
        self._settings = settings
        self._model_factory = model_factory or self._gemini
        self._on_result = on_result
        self._pause_seconds = pause_seconds
        self._run_deadline = run_deadline
        self._runs: dict[str, Run] = {}

    def set_result_callback(self, callback: ResultCallback) -> None:
        """Where finished runs report their outcome (main.py wires the main graph)."""
        self._on_result = callback

    @property
    def has_result_callback(self) -> bool:
        return self._on_result is not None

    def _gemini(self, instruction: str) -> BrowserModel:
        if not self._settings.gemini_api_key:
            raise ExecutionError(503, "browser_unavailable", "The browser assistant isn't set up on this server.")
        return GeminiBrowserModel(self._settings.gemini_api_key, self._settings.model, instruction)

    # -- lookup -------------------------------------------------------------

    def get(self, session_id: str, run_id: str) -> Run | None:
        """A run, only for the session that owns it."""
        self._forget_old()
        run = self._runs.get(run_id)
        return run if run is not None and run.session_id == session_id else None

    def require(self, session_id: str, run_id: str) -> Run:
        run = self.get(session_id, run_id)
        if run is None:
            raise ExecutionError(404, "run_not_found", "That browser session has ended.")
        return run

    def active_for(self, session_id: str) -> Run | None:
        return next((r for r in self._runs.values() if r.session_id == session_id and r.active), None)

    # -- commands -----------------------------------------------------------

    def start(self, session_id: str, target: RunTarget, store: FieldStore) -> Run:
        self._forget_old()
        if self.active_for(session_id) is not None:
            store.clear()
            raise ExecutionError(409, "run_active", "The assistant is already working on an application.")
        if sum(1 for r in self._runs.values() if r.active) >= MAX_CONCURRENT_RUNS:
            store.clear()
            raise ExecutionError(429, "too_many_runs", "The browser assistant is busy. Try again in a few minutes.")
        model = self._model_factory(system_instruction(store))
        run = Run(run_id=str(uuid.uuid4()), session_id=session_id, target=target, store=store)
        self._runs[run.run_id] = run
        run.task = asyncio.create_task(self._drive(run, model))
        return run

    def answer(self, run: Run, answer: AnswerIn) -> None:
        if run.status != "needs_answer" or not run.question_key:
            raise ExecutionError(409, "run_finished", "The assistant isn't waiting for an answer.")
        if answer.question_id != f"agent:{run.question_key}":
            raise ExecutionError(409, "stale_question", "That question is no longer open.")
        if not answer.skipped:
            raw = answer.text if answer.text is not None else (None if answer.value is None else str(answer.value))
            try:
                run.store.put(run.question_key, clean_answer(run.question_key, raw))
            except InvalidAnswer as exc:
                raise ExecutionError(422, "validation_error", str(exc)) from exc
            run._answered = True
        run._resume.set()

    def control(self, run: Run, action: str) -> None:
        if action == "take":
            if run.status in ("working", "needs_answer"):
                # The loop parks before its next action; an open question is dropped.
                run._takeover = True
                if run.status == "needs_answer":
                    run._resume.set()
            elif run.status != "needs_you":
                raise ExecutionError(409, "run_finished", "There's nothing to take over right now.")
        elif action == "return":
            if run.status != "needs_you":
                raise ExecutionError(409, "run_finished", "You don't have control right now.")
            run._resume.set()

    async def stop(self, run: Run) -> None:
        """End the run and release the browser (within CLOSE_TIMEOUT_SECONDS)."""
        if run.task is not None and not run.task.done():
            run.task.cancel()
            await asyncio.wait({run.task}, timeout=CLOSE_TIMEOUT_SECONDS + 1)

    async def shutdown(self) -> None:
        tasks = [r.task for r in self._runs.values() if r.task is not None and not r.task.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.wait(tasks, timeout=CLOSE_TIMEOUT_SECONDS + 1)

    # -- the run task -------------------------------------------------------

    async def _drive(self, run: Run, model: BrowserModel) -> None:
        hooks = _Hooks(run, self._pause_seconds)
        try:
            await asyncio.wait_for(self._work(run, model, hooks), timeout=self._run_deadline)
        except asyncio.CancelledError:
            self._end(run, "stopped", STOPPED_MESSAGE)
            hooks.log("note", "Stopped")
            raise
        except TimeoutError:
            self._end(run, "stopped", DEADLINE_MESSAGE)
        except _PauseTimeout:
            self._end(run, "stopped", PAUSE_TIMEOUT_MESSAGE)
        except ProviderError as exc:
            self._end(run, "failed", str(exc))
        except ExecutionError as exc:
            self._end(run, "failed", exc.message)
        except Exception as exc:
            logger.error("browser run failed (run %s): %s", run.run_id, describe_exception(exc))
            self._end(run, "failed", FAILED_MESSAGE)
        finally:
            run.store.clear()
            if run.browser is not None:
                try:
                    await asyncio.wait_for(asyncio.shield(run.browser.close()), timeout=CLOSE_TIMEOUT_SECONDS)
                except BaseException as exc:  # noqa: BLE001 - cleanup must never raise
                    logger.warning("browser close did not finish (run %s): %s", run.run_id, exc.__class__.__name__)
            if run.status in ("done", "stopped") and self._on_result is not None:
                try:
                    # Shielded: a stop request must not cancel the write that records it.
                    await asyncio.shield(self._on_result(run))
                except BaseException as exc:  # noqa: BLE001 - never let recording break cleanup
                    logger.error("application result not recorded (run %s): %s", run.run_id, exc.__class__.__name__)
            run.result_recorded = True

    async def _work(self, run: Run, model: BrowserModel, hooks: _Hooks) -> None:
        hooks.log("note", "Opening the application")
        run.browser = await self._provider.open(run.target)
        run.status = "working"
        computer = _RecordingComputer(run.browser.computer, run)
        end: AgentEnd = await Agent(computer, model, run.store, run.target.allowed_hosts, hooks).run()
        run.status = "verifying"
        observation = await computer.observe()
        text = await computer.page_text()
        run.outcome = await asyncio.to_thread(verify, run.target.mode, text, observation.url)
        hooks.log("note", "Checked the final page")
        self._end(run, "done", END_MESSAGES[end.kind])

    def _end(self, run: Run, status: RunStatus, message: str | None) -> None:
        if not run.active:
            return
        run.status, run.message, run.finished = status, message, time.monotonic()
        run.question_key = run.handoff_reason = None

    def _forget_old(self) -> None:
        cutoff = time.monotonic() - KEEP_FINISHED_SECONDS
        for run_id, run in list(self._runs.items()):
            if not run.active and run.finished is not None and run.finished < cutoff:
                run.last_frame = None
                del self._runs[run_id]
