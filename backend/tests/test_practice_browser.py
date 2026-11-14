"""The real practice form in a real (headless) browser: computer.py + gate + agent loop.

Skipped when Playwright or a browser isn't installed. Uses the installed Google
Chrome by default (LOCAL_BROWSER_CHANNEL), so no browser download is needed.
"""

import asyncio
import os
from pathlib import Path

import pytest

playwright_api = pytest.importorskip("playwright.async_api")

from app.execution.agent import Agent, Call, ModelTurn  # noqa: E402
from app.execution.computer import PlaywrightComputer, install_allowlist  # noqa: E402
from app.execution.fields import FieldStore  # noqa: E402
from app.execution.verify import verify_practice  # noqa: E402

PAGE = (Path(__file__).resolve().parents[1] / "app" / "execution" / "practice.html").read_text()
URL = "http://practice.test/practice/"
HOSTS = frozenset({"practice.test"})
CHANNEL = os.environ.get("LOCAL_BROWSER_CHANNEL", "chrome") or None

VALUES = {
    "first_name": "Maya", "last_name": "Rivera", "date_of_birth": "04/07/1961", "phone": "413-555-0100",
    "street_address": "1 Main St", "city": "Amherst", "state": "MA", "zip": "01002",
    "household_size": "2", "monthly_income": "1,450",
}
STEP1 = [("#first_name", "first_name"), ("#last_name", "last_name"), ("#dob", "date_of_birth"), ("#phone", "phone"),
         ("#street", "street_address"), ("#city", "city"), ("#state", "state"), ("#zip", "zip")]
STEP2 = [("#household", "household_size"), ("#income", "monthly_income")]


class FormModel:
    """Plays the model: reads element positions at turn time and proposes grid coordinates."""

    def __init__(self, page, plan):
        self.page, self.plan, self.inputs = page, list(plan), []

    async def at(self, selector):
        # A real model scrolls until it sees the control; step 3 is taller than the viewport.
        await self.page.locator(selector).scroll_into_view_if_needed()
        box = await self.page.locator(selector).bounding_box()
        size = self.page.viewport_size
        return {"x": int((box["x"] + box["width"] / 2) / size["width"] * 1000),
                "y": int((box["y"] + box["height"] / 2) / size["height"] * 1000)}

    async def turn(self, input_parts, previous_id):
        self.inputs.append(input_parts)
        if not self.plan:
            return ModelTurn("done", [])
        kind, arg = self.plan.pop(0)
        if kind == "click":
            call = Call(f"c{len(self.inputs)}", "click", await self.at(arg))
        else:
            call = Call(f"t{len(self.inputs)}", "type", {"text": "{{" + arg + "}}"})
        return ModelTurn(f"i{len(self.inputs)}", [call])


class Hooks:
    def __init__(self):
        self.handoffs, self.logs = [], []

    def log(self, kind, text):
        self.logs.append(text)

    async def ask(self, key):
        return False

    async def handoff(self, reason):
        self.handoffs.append(reason)

    def takeover_requested(self):
        return False


def fill(pairs):
    plan = []
    for selector, key in pairs:
        plan += [("click", selector), ("type", key)]
    return plan


async def _scenario():
    async with playwright_api.async_playwright() as p:
        try:
            browser = await p.chromium.launch(channel=CHANNEL, headless=True)
        except Exception as exc:
            pytest.skip(f"no browser available ({exc.__class__.__name__})")
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        await install_allowlist(context, HOSTS, strict=True)
        await context.route(URL, lambda route: route.fulfill(body=PAGE, content_type="text/html"))
        page = await context.new_page()
        await page.goto(URL)

        store = FieldStore()
        for key, value in VALUES.items():
            store.put(key, value)
        plan = fill(STEP1) + [("click", "#next")] + fill(STEP2) + [("click", "#next"),
                ("click", "#certify"), ("type", "first_name"), ("click", "#submit")]
        hooks = Hooks()
        model = FormModel(page, plan)
        end = await Agent(PlaywrightComputer(page, settle_seconds=0.05), model, store, HOSTS, hooks).run()

        typed = {key: await page.input_value(sel) for sel, key in STEP1 + STEP2}
        on_review = await page.locator("[data-panel='3']").is_visible()
        certified = await page.locator("#certify").is_checked()
        signature = await page.input_value("#signature")
        text = await page.inner_text("body")
        try:
            await page.goto("https://example.com/")
            off_site = "loaded"
        except Exception:
            off_site = "blocked"
        await browser.close()
        return end, hooks, model, typed, on_review, certified, signature, text, off_site


def test_agent_fills_steps_one_and_two_and_stops_at_attest_and_submit():
    end, hooks, model, typed, on_review, certified, signature, text, off_site = asyncio.run(_scenario())
    assert end.kind == "finished"
    assert typed == {key: VALUES[key] for _, key in STEP1 + STEP2}
    assert on_review  # reached step 3
    # The certify box and the final submit were handed to the person; typing into the
    # signature without focusing it was refused.
    assert hooks.handoffs == ["attestation", "submit"]
    assert "Skipped an action that isn't allowed" in hooks.logs
    assert not certified and signature == ""
    assert verify_practice(text).status == "not_submitted"
    assert off_site == "blocked"
    assert "Practice copy, not sent to any agency" in text
    assert "Maya" not in str(model.inputs) and "413-555-0100" not in str(model.inputs)
    assert "Typed your phone number" in hooks.logs


# ---------------------------------------------------------------------------
# Phase 2 acceptance: the whole practice run through the real manager and
# LocalProvider, with one question and one handoff, the person submitting.
# ---------------------------------------------------------------------------

import contextlib  # noqa: E402
import http.server  # noqa: E402
import threading  # noqa: E402
import time  # noqa: E402

from app.execution.config import AgentSettings, RunTarget  # noqa: E402
from app.execution.fields import store_from_profile  # noqa: E402
from app.execution.manager import ExecutionManager  # noqa: E402
from app.execution.provider import LocalProvider  # noqa: E402
from app.graph.state import AnswerIn  # noqa: E402
from tests.conftest import make_profile  # noqa: E402


@contextlib.contextmanager
def practice_server():
    """Serves the practice page the way the backend does, on a free local port."""

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            body = PAGE.encode() if self.path == "/practice/" else b""
            self.send_response(200 if body else 404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/practice/"
    finally:
        server.shutdown()


class LiveFormModel(FormModel):
    """FormModel that finds the page through the provider once the run has opened it."""

    def __init__(self, provider, plan):
        super().__init__(None, plan)
        self.provider = provider

    async def turn(self, input_parts, previous_id):
        self.page = self.provider.sessions[-1].page
        if self.plan and self.plan[0][0] == "finish":
            self.inputs.append(input_parts)
            self.plan.pop(0)
            return ModelTurn("fin", [Call("f", "finish", {})])
        return await super().turn(input_parts, previous_id)


async def _full_run(start_url):
    provider = LocalProvider(CHANNEL, headless=True, settle_seconds=0.05)
    settings = AgentSettings("local", "", "m", "", "", CHANNEL, True)
    profile = make_profile(zip="01002", household_size=2, monthly_income=1450)
    region = {"01002": {"city": "Amherst", "state": "MA"}}
    store = store_from_profile(profile, region.get)
    for key in ("last_name", "date_of_birth", "phone", "street_address"):
        store.put(key, VALUES[key])  # as if asked earlier; first_name is asked live below
    plan = fill(STEP1) + [("click", "#next")] + fill(STEP2) + [("click", "#next"), ("click", "#certify"), ("finish", None)]
    model = LiveFormModel(provider, plan)
    recorded = []

    async def on_result(run):
        recorded.append(run.status)

    manager = ExecutionManager(provider, settings, model_factory=lambda _i: model, on_result=on_result)
    target = RunTarget("p1", "practice", start_url, frozenset({"127.0.0.1"}))
    started = time.monotonic()
    try:
        run = manager.start("s1", target, store)
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"could not start ({exc.__class__.__name__})")
    questions = handoffs = 0
    while run.active and time.monotonic() - started < 120:
        if run.status == "needs_answer":
            questions += 1
            assert run.view().question.id == "agent:first_name"
            manager.answer(run, AnswerIn(question_id="agent:first_name", text="Maya"))
        elif run.status == "needs_you":
            handoffs += 1
            assert run.handoff_reason == "attestation"
            page = provider.sessions[-1].page  # the person, in takeover
            await page.check("#certify")
            await page.fill("#signature", "Maya Rivera")
            await page.click("#submit")
            manager.control(run, "return")
        await asyncio.sleep(0.05)
    if run.status == "failed" and "browser" in (run.message or ""):
        pytest.skip("no browser available")
    await asyncio.wait({run.task}, timeout=10)
    return run, questions, handoffs, time.monotonic() - started, recorded, provider


def test_full_practice_run_with_one_question_and_one_handoff():
    with practice_server() as url:
        run, questions, handoffs, seconds, recorded, provider = asyncio.run(_full_run(url))
    assert run.status == "done", run.message
    assert (questions, handoffs) == (1, 1)
    assert run.outcome.status == "submitted" and run.outcome.confirmation_text.startswith("PRACTICE-")
    assert seconds < 240  # plan: under 4 minutes (a scripted model is far faster)
    assert recorded == ["done"] and run.result_recorded
    assert run.store.known() == set()  # private details wiped
    assert provider.sessions[-1]._closed
    assert "Maya" not in str(run.view())
