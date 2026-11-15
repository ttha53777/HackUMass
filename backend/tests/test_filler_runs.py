"""Filler phase 3: a fill run on the practice form, in real Chrome, end to end.

A scripted model plays Gemini (reading element positions off the live page, as a model
reads a screenshot); the test plays the person over the live WebSocket: it answers one
question, ticks the certify box and signs during hand-offs, and presses Submit itself at
the review. Skipped when Playwright or Chrome is missing. The live check against Gemini
is scripts/spikes/filler_phase3.py.
"""

import asyncio
import os
import time

import pytest
from fastapi.testclient import TestClient

from app.filler.consent import FillerSessions
from app.filler.gate import Action, Element, GatePolicy, PageFacts, decide
from app.filler.jobs import PaperJobs
from app.filler.loop import Call, ModelTurn
from app.filler.runs import FillRuns, SpikeRuns
from app.filler.service import Filler
from app.main import create_app
from app.services.nessie import NessieService

CHANNEL = os.environ.get("LOCAL_BROWSER_CHANNEL", "chrome") or None

# Confirmed details for an obviously fictional person. Phone is missing on purpose: the
# run must ask for it once.
DETAILS = {
    "first_name": "Maya", "last_name": "Rivera", "date_of_birth": "04/07/1961", "street_address": "12 Elm Street",
    "city": "Amherst", "state": "MA", "zip": "01002", "household_size": "2", "monthly_income": "2600",
}
STEP1 = [("#first_name", "first_name"), ("#last_name", "last_name"), ("#dob", "date_of_birth"), ("#phone", "phone"),
         ("#street", "street_address"), ("#city", "city"), ("#state", "state"), ("#zip", "zip")]
STEP2 = [("#household", "household_size"), ("#income", "monthly_income")]


# -- the gate, pure ---------------------------------------------------------------

POLICY = GatePolicy(frozenset({"form.test"}), frozenset({"zip"}), frozenset({"zip", "phone"}))
URL = "https://form.test/apply"


def verdict(action, target=None, focused=None, url=URL, frames=()):
    return decide(action, PageFacts(url, target, focused, frames), POLICY)


def test_gate_hands_the_person_every_choice_signature_and_the_submit():
    click = Action("click", {"x": 1, "y": 1})
    assert verdict(click, Element(tag="button", text="Next")).kind == "allow"
    assert verdict(click, Element(tag="button", text="Submit application")).reason == "submit"
    assert verdict(click, Element(tag="input", type="checkbox", text="I certify this is true")).reason == "attestation"
    assert verdict(click, Element(tag="input", type="radio", text="Yes")).reason == "choice"
    assert verdict(click, Element(tag="input", type="password", text="Password", editable=True)).reason == "sign_in"
    assert verdict(click, Element(tag="input", type="text", text="Social Security number", editable=True)).reason == "sensitive_field"
    assert verdict(click, Element(tag="button", text="Next"), frames=("www.google.com/recaptcha/api2",)).reason == "captcha"


def test_gate_blocks_free_text_enter_and_other_sites():
    field = Element(tag="input", type="text", text="ZIP code", editable=True)
    assert verdict(Action("type", {"text": "01002"}), focused=field).kind == "block"
    assert verdict(Action("type", {"text": "{{zip}}"}), focused=field).kind == "allow"
    assert verdict(Action("type", {"text": "{{phone}}"}), focused=field).kind == "ask"
    assert verdict(Action("type", {"text": "{{ssn}}"}), focused=field).kind == "block"
    assert verdict(Action("press_key", {"key": "Enter"})).kind == "block"
    assert verdict(Action("navigate", {"url": "https://evil.test/"})).kind == "block"
    assert verdict(Action("click", {"x": 1, "y": 1}), Element(tag="button", text="Next"), url="https://evil.test/").kind == "block"
    signature = Element(tag="input", type="text", text="Signature: type your full name", editable=True)
    assert verdict(Action("type", {"text": "{{zip}}"}), focused=signature).reason == "attestation"
    assert verdict(Action("click", {"x": 1}), Element(tag="button", text="Go"), ).kind == "allow"
    assert verdict(Action("drag_and_drop", {})).kind == "block"
    assert verdict(Action("click", {"x": 1, "y": 1, "safety_decision": {"decision": "require_confirmation"}}),
                   Element(tag="button", text="Next")).reason == "safety_confirmation"


# -- a whole run in real Chrome ------------------------------------------------------

playwright_api = pytest.importorskip("playwright.async_api")
from app.filler.sandbox import LocalBrowser  # noqa: E402


class FormModel:
    """Plays Gemini on the practice form: fill_fields per page, Next, then try the
    certify box, the signature and Submit (each of which the gate hands to the person)."""

    def __init__(self, page_of):
        self.page_of = page_of
        self.turns = 0
        self.plan = [
            ("fill", STEP1), ("click", "#next"), ("fill", STEP2), ("click", "#next"),
            ("click", "#certify"), ("click", "#signature"), ("click", "#submit"),
        ]

    async def at(self, selector, scroll=False):
        page = self.page_of()
        if scroll:  # a real model scrolls until it sees the button
            await page.locator(selector).scroll_into_view_if_needed()
        box = await page.locator(selector).bounding_box()
        assert box is not None, f"{selector} is not visible"
        return {"x": round((box["x"] + box["width"] / 2) / 1280 * 1000), "y": round((box["y"] + box["height"] / 2) / 800 * 1000)}

    async def turn(self, parts, previous):
        self.turns += 1
        if not self.plan:
            return ModelTurn("i", [Call("end", "ready_for_review", {})])
        kind, arg = self.plan.pop(0)
        if kind == "fill":
            fields = [{**(await self.at(sel)), "key": key} for sel, key in arg]
            return ModelTurn("i", [Call(f"f{self.turns}", "fill_fields", {"fields": fields})])
        return ModelTurn("i", [Call(f"c{self.turns}", "click", await self.at(arg, scroll=True))])


@pytest.fixture
def setup(repo):
    sessions = FillerSessions()
    holder = {}
    runs = FillRuns(LocalBrowser(CHANNEL, headless=True),
                    lambda instruction: holder.setdefault("model", FormModel(lambda: holder["run"].computer.page)),
                    sessions, type_delay_ms=0, wait_seconds=20)
    filler = Filler(sessions, PaperJobs(reader=None), SpikeRuns(browser=None, make_model=None), runs)
    with TestClient(create_app(repo, NessieService(None), filler=filler)) as client:
        yield client, holder, sessions


def wait_for(client, url, statuses, timeout=30.0):
    deadline = time.monotonic() + timeout
    while True:
        view = client.get(url).json()
        if view["status"] in statuses:
            return view
        assert time.monotonic() < deadline, view
        time.sleep(0.05)


def center(client, run, selector):
    async def find():
        box = await run.computer.page.locator(selector).bounding_box()
        return {"x": int(box["x"] + box["width"] / 2), "y": int(box["y"] + box["height"] / 2)}

    return client.portal.call(find)


def test_practice_run_end_to_end_with_one_question_and_the_person_sending(setup):
    """Phase 3 gate: filled end to end, 0 or 1 questions, hand-offs at certify and Submit."""
    client, holder, sessions = setup
    sid = client.post("/api/sessions").json()["session_id"]
    base = f"/api/sessions/{sid}/filler"
    assert client.post(f"{base}/details/confirm", json={"edits": DETAILS}).status_code == 200

    started = time.monotonic()
    view = client.post(f"{base}/runs").json()
    run_url = f"{base}/runs/{view['run_id']}"
    holder["run"] = client.app.state.filler.runs.get(sid, view["run_id"])
    assert client.post(f"{base}/runs").status_code == 409  # one per session

    events = []
    with client.websocket_connect(f"{run_url}/live") as ws:
        # 1. One question: the phone number.
        view = wait_for(client, run_url, {"needs_answer"})
        assert view["question"]["key"] == "phone"
        assert client.post(f"{run_url}/answer", json={"value": "12"}).status_code == 422  # not a phone
        client.post(f"{run_url}/answer", json={"value": "(413) 555-0100"})

        # 2. Certify box: the person ticks it.
        view = wait_for(client, run_url, {"needs_you"})
        assert view["handoff"]["reason"] == "attestation"
        ws.send_json({"type": "mouse", "action": "click", **center(client, holder["run"], "#certify")})
        time.sleep(0.3)
        client.post(f"{run_url}/control", json={"action": "return"})

        # 3. Signature: the person signs.
        wait_for(client, run_url, {"filling"})
        view = wait_for(client, run_url, {"needs_you"})
        assert view["handoff"]["reason"] == "attestation"
        ws.send_json({"type": "mouse", "action": "click", **center(client, holder["run"], "#signature")})
        time.sleep(0.2)
        ws.send_json({"type": "text", "text": "Maya Rivera"})
        time.sleep(0.2)
        client.post(f"{run_url}/control", json={"action": "return"})

        # 4. Review at Submit: the agent never presses it; the person does.
        view = wait_for(client, run_url, {"review"})
        assert {f["key"] for f in view["filled"]} == set(DETAILS) | {"phone"}
        assert client.post(f"{run_url}/control", json={"action": "return"}).status_code == 409
        ws.send_json({"type": "mouse", "action": "click", **center(client, holder["run"], "#submit")})
        time.sleep(0.5)
        client.post(f"{run_url}/control", json={"action": "done"})
        view = wait_for(client, run_url, {"done"})
        while True:
            event = ws.receive_json()
            events.append(event)
            if event["type"] == "end":
                break

    elapsed = time.monotonic() - started
    assert view["outcome"]["status"] == "submitted"
    assert view["outcome"]["confirmation"].startswith("PRACTICE-")
    assert elapsed < 180
    assert holder["run"].handle is None and holder["run"].computer is None  # browser released
    # The answer became the person's own detail for later forms.
    assert sessions.get(sid).details["phone"].value == "413-555-0100"
    captions = [e["caption"] for e in events if e["type"] == "step"]
    values = set(DETAILS.values()) | {"413-555-0100"}
    assert not any(v in c for c in captions for v in values if len(v) > 2)


def test_stop_releases_the_browser_and_take_over_parks_the_agent(setup):
    client, holder, _ = setup
    sid = client.post("/api/sessions").json()["session_id"]
    base = f"/api/sessions/{sid}/filler"
    client.post(f"{base}/details/confirm", json={"edits": DETAILS})
    view = client.post(f"{base}/runs").json()
    run_url = f"{base}/runs/{view['run_id']}"
    holder["run"] = client.app.state.filler.runs.get(sid, view["run_id"])
    wait_for(client, run_url, {"filling", "needs_answer"})
    if client.get(run_url).json()["status"] == "filling":
        client.post(f"{run_url}/control", json={"action": "take"})
    view = wait_for(client, run_url, {"needs_you", "needs_answer"})
    assert client.post(f"{run_url}/stop").json()["status"] == "stopped"
    assert holder["run"].handle is None
    other = client.post("/api/sessions").json()["session_id"]
    assert client.get(f"/api/sessions/{other}/filler/runs/{view['run_id']}").status_code == 404
