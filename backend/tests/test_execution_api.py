"""Browser agent routes and run lifecycle with FakeProvider and a scripted model.

No browser and no network: acceptance for Phase 1 ("pytest passes with
FakeProvider and a scripted model").
"""

import asyncio
import logging
import time

import pytest
from fastapi.testclient import TestClient

from app.execution.config import AgentSettings
from app.execution.manager import ExecutionManager
from app.execution.models import AutomationRecord
from app.execution.provider import FakeProvider
from app.main import create_app
from app.services.nessie import NessieService
from tests.execution_fakes import FakeComputer, ScriptedModel, click, type_
from tests.test_api import run_food_intake

PROGRAM = "fixture-food-benefit"
CONFIRMATION = "Practice application received. Reference: PRACTICE-ABC234"
SETTINGS = AgentSettings(
    provider="local", gemini_api_key="", model="m", steel_api_key="",
    practice_base_url="http://127.0.0.1:8000", local_channel=None, local_headless=True,
)

FULL_RUN = [
    [click(100, 100)],
    [type_("{{first_name}}")],  # not known: the person is asked
    [click(100, 200)],
    [type_("{{zip}}")],  # from the profile
    [click(500, 950)],  # Submit: handed to the person
    [],
]


class Harness:
    def __init__(self, turns, *, fail=False, delay=0.0, pause_seconds=60.0, page_text=CONFIRMATION):
        self.computers: list[FakeComputer] = []

        def make_computer(target):
            computer = FakeComputer(url=target.start_url, text=page_text)
            self.computers.append(computer)
            return computer

        self.provider = FakeProvider(make_computer, fail=fail)
        self.model = ScriptedModel(turns, delay=delay)
        self.manager = ExecutionManager(
            self.provider, SETTINGS, model_factory=lambda _instruction: self.model, pause_seconds=pause_seconds
        )


@pytest.fixture
def harness(request, repo):
    options = getattr(request, "param", {})
    h = Harness(options.get("turns", FULL_RUN), **{k: v for k, v in options.items() if k != "turns"})
    app = create_app(repo, NessieService(None), execution=h.manager)
    app.state.automation = {PROGRAM: AutomationRecord(program_id=PROGRAM, mode="practice")}
    app.state.automatable_ids = frozenset(app.state.automation)
    with TestClient(app) as client:
        h.client = client
        yield h


def runs_url(session_id, run_id="", action=""):
    url = f"/api/sessions/{session_id}/applications"
    return url + (f"/{run_id}" if run_id else "") + (f"/{action}" if action else "")


def start_run(client, session_id, expect=201, **body):
    response = client.post(runs_url(session_id), json={"program_id": PROGRAM, "consent": True, **body})
    assert response.status_code == expect, response.text
    return response.json()


def wait_for(client, session_id, run_id, *statuses, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        view = client.get(runs_url(session_id, run_id)).json()
        if view["status"] in statuses:
            return view
        time.sleep(0.02)
    raise AssertionError(f"run never reached {statuses}; last {view['status']}")


def wait_for_recorded(client, session_id, run_id, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        view = client.get(runs_url(session_id, run_id)).json()
        if view["result_recorded"]:
            return view
        time.sleep(0.02)
    raise AssertionError("result never recorded")


def test_snapshot_lists_automatable_programs_on_the_persons_list(harness):
    _, snapshot = run_food_intake(harness.client)
    assert snapshot["automatable_program_ids"] == [PROGRAM]
    assert snapshot["applications"] == {}


def test_full_practice_run_with_one_question_and_one_handoff(harness, caplog):
    client = harness.client
    session_id, _ = run_food_intake(client)
    with caplog.at_level(logging.DEBUG):
        run = start_run(client, session_id)
        assert run["status"] in ("starting", "working", "needs_answer")
        assert run["mode"] == "practice"

        view = wait_for(client, session_id, run["run_id"], "needs_answer")
        assert view["question"]["id"] == "agent:first_name"
        assert view["live_view_url"].endswith("interactive=false") and view["interactive"] is False

        stale = client.post(runs_url(session_id, run["run_id"], "answer"), json={"question_id": "agent:email", "text": "x"})
        assert stale.status_code == 409
        response = client.post(runs_url(session_id, run["run_id"], "answer"), json={"question_id": "agent:first_name", "text": "Maya"})
        assert response.status_code == 200

        view = wait_for(client, session_id, run["run_id"], "needs_you")
        assert view["handoff"]["reason"] == "submit"
        assert view["interactive"] is True and view["live_view_url"].endswith("interactive=true")
        frame = client.get(runs_url(session_id, run["run_id"], "frame"))
        assert frame.status_code == 200 and frame.headers["content-type"] == "image/png"

        assert client.post(runs_url(session_id, run["run_id"], "control"), json={"action": "return"}).status_code == 200
        view = wait_for(client, session_id, run["run_id"], "done")

    assert view["outcome"] == {"status": "submitted", "confirmation_text": "PRACTICE-ABC234"}
    view = wait_for_recorded(client, session_id, run["run_id"])
    snapshot = client.get(f"/api/sessions/{session_id}").json()
    assert snapshot["applications"][PROGRAM]["status"] == "submitted"
    assert snapshot["applications"][PROGRAM]["confirmation"] == "PRACTICE-ABC234"
    item = next(i for i in snapshot["action_plan"] if i["program_id"] == PROGRAM)
    assert item["next_step"].startswith("Sent on ")
    assert "Maya" not in str(snapshot)
    assert view["live_view_url"] is None and view["seconds_left"] is None
    assert harness.computers[0].typed == {"first_name": "Maya", "zip": "00000"}
    assert harness.provider.sessions[0].closed is True
    texts = [step["text"] for step in view["steps"]]
    assert "Typed your first name" in texts and "Typed your ZIP code" in texts
    # Typed values appear nowhere: not in the step log, the model's inputs, or the logs.
    assert "Maya" not in str(view) and "Maya" not in str(harness.model.inputs)
    assert "Maya" not in caplog.text and "00000" not in str(harness.model.inputs)


def test_consent_and_program_checks(harness):
    client = harness.client
    session_id, _ = run_food_intake(client)
    no_consent = client.post(runs_url(session_id), json={"program_id": PROGRAM, "consent": False})
    assert no_consent.status_code == 400 and no_consent.json()["error"]["code"] == "consent_required"
    other = client.post(runs_url(session_id), json={"program_id": "fixture-rent-help", "consent": True})
    assert other.status_code == 422 and other.json()["error"]["code"] == "not_automatable"
    assert client.post(runs_url("missing"), json={"program_id": PROGRAM, "consent": True}).status_code == 404


def test_one_active_run_per_session_and_no_cross_session_reads(harness):
    client = harness.client
    session_id, _ = run_food_intake(client)
    other_session, _ = run_food_intake(client)
    run = start_run(client, session_id)
    second = client.post(runs_url(session_id), json={"program_id": PROGRAM, "consent": True})
    assert second.status_code == 409 and second.json()["error"]["code"] == "run_active"
    for action in ("", "frame"):
        response = client.get(runs_url(other_session, run["run_id"], action))
        assert response.status_code == 404
        assert "live" not in response.text
    assert client.post(runs_url(other_session, run["run_id"], "stop")).status_code == 404


@pytest.mark.parametrize("harness", [{"turns": [[click(500, 900)]] * 200, "delay": 0.05}], indirect=True)
def test_stop_releases_the_browser_quickly(harness):
    client = harness.client
    session_id, _ = run_food_intake(client)
    run = start_run(client, session_id)
    wait_for(client, session_id, run["run_id"], "working")
    started = time.monotonic()
    view = client.post(runs_url(session_id, run["run_id"], "stop")).json()
    assert time.monotonic() - started < 5
    assert view["status"] == "stopped" and view["live_view_url"] is None
    assert harness.provider.sessions[0].closed is True
    # A new run can start once the old one is over.
    assert start_run(client, session_id)["status"] in ("starting", "working")


@pytest.mark.parametrize("harness", [{"turns": [[click(500, 900)]] * 200, "delay": 0.05}], indirect=True)
def test_take_over_parks_the_agent(harness):
    client = harness.client
    session_id, _ = run_food_intake(client)
    run = start_run(client, session_id)
    wait_for(client, session_id, run["run_id"], "working")
    client.post(runs_url(session_id, run["run_id"], "control"), json={"action": "take"})
    view = wait_for(client, session_id, run["run_id"], "needs_you")
    assert view["handoff"]["reason"] == "person_requested"
    client.post(runs_url(session_id, run["run_id"], "stop"))


@pytest.mark.parametrize("harness", [{"pause_seconds": 0.2}], indirect=True)
def test_an_unanswered_question_times_out_and_closes_the_browser(harness):
    client = harness.client
    session_id, _ = run_food_intake(client)
    run = start_run(client, session_id)
    view = wait_for(client, session_id, run["run_id"], "stopped")
    assert "waited" in view["message"].lower()
    assert harness.provider.sessions[0].closed is True


@pytest.mark.parametrize("harness", [{"fail": True}], indirect=True)
def test_provider_failure_is_reported_safely(harness):
    client = harness.client
    session_id, _ = run_food_intake(client)
    run = start_run(client, session_id)
    view = wait_for(client, session_id, run["run_id"], "failed")
    assert view["message"] == "We couldn't open the browser. Please try again."


@pytest.mark.parametrize("harness", [{"turns": [[]], "page_text": "Step 2 of 3"}], indirect=True)
def test_practice_outcome_without_confirmation_is_not_submitted(harness):
    client = harness.client
    session_id, _ = run_food_intake(client)
    run = start_run(client, session_id)
    view = wait_for(client, session_id, run["run_id"], "done")
    assert view["outcome"]["status"] == "not_submitted"


def test_feature_off_hides_routes(repo, monkeypatch):
    monkeypatch.delenv("BROWSER_PROVIDER", raising=False)
    with TestClient(create_app(repo, NessieService(None))) as client:
        session_id, snapshot = run_food_intake(client)
        assert snapshot["automatable_program_ids"] == []
        response = client.post(runs_url(session_id), json={"program_id": PROGRAM, "consent": True})
        assert response.status_code in (404, 405)
        assert client.get("/practice/").status_code == 404


def test_provider_without_a_gemini_key_stays_off(repo, monkeypatch):
    monkeypatch.setenv("BROWSER_PROVIDER", "local")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with TestClient(create_app(repo, NessieService(None))) as client:
        assert client.get("/api/health").json()["browser_agent"] is False
        assert client.get("/practice/").status_code == 404


def test_health_reports_the_agent_when_mounted(harness):
    assert harness.client.get("/api/health").json()["browser_agent"] is True


@pytest.mark.parametrize("harness", [{"turns": [[click(500, 900)]] * 200, "delay": 0.05}], indirect=True)
def test_a_stopped_run_is_recorded_and_keeps_the_usual_next_step(harness):
    client = harness.client
    session_id, before = run_food_intake(client)
    run = start_run(client, session_id)
    wait_for(client, session_id, run["run_id"], "working")
    client.post(runs_url(session_id, run["run_id"], "stop"))
    wait_for_recorded(client, session_id, run["run_id"])
    after = client.get(f"/api/sessions/{session_id}").json()
    assert after["applications"][PROGRAM]["status"] == "stopped"
    step = lambda s: next(i["next_step"] for i in s["action_plan"] if i["program_id"] == PROGRAM)  # noqa: E731
    assert step(after) == step(before)


class SlowProvider(FakeProvider):
    async def open(self, target):
        await asyncio.sleep(30)  # a cloud browser that never comes up


ASK_THEN_SUBMIT = [[click(100, 100)], [type_("{{first_name}}")], [click(500, 950)], []]


@pytest.mark.parametrize("state", ["starting", "needs_answer", "needs_you"])
def test_stop_releases_the_browser_from_every_state(repo, state):
    turns = [[click(500, 950)], []] if state == "needs_you" else ASK_THEN_SUBMIT
    h = Harness(turns)
    if state == "starting":
        h.provider = SlowProvider(lambda target: FakeComputer())
        h.manager = ExecutionManager(h.provider, SETTINGS, model_factory=lambda _i: h.model)
    app = create_app(repo, NessieService(None), execution=h.manager)
    app.state.automation = {PROGRAM: AutomationRecord(program_id=PROGRAM, mode="practice")}
    app.state.automatable_ids = frozenset(app.state.automation)
    with TestClient(app) as client:
        session_id, _ = run_food_intake(client)
        run = start_run(client, session_id)
        wait_for(client, session_id, run["run_id"], state)
        started = time.monotonic()
        view = client.post(runs_url(session_id, run["run_id"], "stop")).json()
        assert time.monotonic() - started < 5
        assert view["status"] == "stopped" and view["live_view_url"] is None
        assert all(session.closed for session in h.provider.sessions)
