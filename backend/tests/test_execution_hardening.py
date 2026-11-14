"""Phase 3 hardening: fill-and-stop on real sites, records, model and provider failures."""

import asyncio
import json
import logging
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.execution.agent import Agent, Call, GeminiBrowserModel, ModelUnavailable
from app.execution.computer import install_allowlist
from app.execution.config import AUTOMATION_DIR, automation_records
from app.execution.fields import FieldStore, sheet_lines
from app.execution.models import AutomationRecord
from app.execution.provider import GENERIC_CLOUD_MESSAGE, steel_message
from tests.execution_fakes import FakeComputer, ScriptedModel, click
from tests.test_execution_agent import HOSTS, Hooks

# -- automation records -----------------------------------------------------


def test_disabled_records_are_validated_but_not_offered():
    enabled = automation_records()
    everything = automation_records(include_disabled=True)
    assert "hves-home-delivered-meals" not in enabled
    real = everything["hves-home-delivered-meals"]
    assert real.mode == "stop_before_submit" and real.enabled is False
    assert all(r.mode == "practice" for r in enabled.values())


def test_every_record_names_a_curated_program(repo):
    from app.services.programs_repo import repository_from_env

    curated = {p.id for p in repository_from_env("curated").all()}
    assert set(automation_records(include_disabled=True)) <= curated


@pytest.mark.parametrize(
    "body",
    [
        {"mode": "stop_before_submit", "start_url": "http://x.org/f", "allowed_hosts": ["x.org"]},  # not https
        {"mode": "stop_before_submit", "start_url": "https://x.org/f", "allowed_hosts": ["y.org"]},  # host mismatch
        {"mode": "stop_before_submit", "allowed_hosts": ["x.org"]},  # no URL
        {"mode": "practice", "start_url": "https://x.org/f"},  # practice URLs are server config
    ],
)
def test_bad_records_are_rejected(body):
    with pytest.raises(ValueError):
        AutomationRecord(program_id="p", **body)


def test_record_files_are_well_formed_json():
    for path in AUTOMATION_DIR.glob("*.json"):
        assert path.stem == json.loads(path.read_text())["program_id"]


# -- fill sheet ---------------------------------------------------------------


def test_full_name_comes_from_first_and_last():
    store = FieldStore()
    store.put("first_name", "Maya")
    assert "full_name" not in store.known()
    store.put("last_name", "Rivera")
    assert store.value("full_name") == "Maya Rivera"
    assert "{{full_name}} = Full name (known)" in "\n".join(sheet_lines(store))


# -- fill-and-stop -------------------------------------------------------------


def stop_agent(turns):
    hooks = Hooks()
    hooks.store = FieldStore()
    computer = FakeComputer(url="http://127.0.0.1:8000/practice/")
    agent = Agent(computer, ScriptedModel(turns), hooks.store, HOSTS, hooks, stop_before_submit=True)
    return agent, computer, hooks


@pytest.mark.parametrize("point", [(500, 950), (100, 300)])  # Submit, then the certify box
def test_real_sites_end_at_the_first_submit_or_attestation(point):
    agent, computer, hooks = stop_agent([[click(500, 900)], [click(*point)], [click(500, 900)]])
    end = asyncio.run(agent.run())
    assert end.kind == "stopped_before_submit"
    assert hooks.handoffs == ["stop_point"]
    assert computer.executed == ["click"]  # only the first Next; nothing after the stop point
    assert ("handoff", "Stopped before sending") in hooks.logs


def test_other_handoffs_still_continue_in_fill_and_stop():
    agent, _, hooks = stop_agent([[click(100, 350)], []])  # SSN field
    assert asyncio.run(agent.run()).kind == "finished"
    assert hooks.handoffs == ["sensitive_field"]


# -- model failures -----------------------------------------------------------


class FakeInteractions:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    async def create(self, **kwargs):
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def model(outcomes, retries=1):
    fake = FakeInteractions(outcomes)
    return GeminiBrowserModel("k", "m", "i", retries=retries, retry_delay=0, interactions=fake), fake


def test_a_transient_model_failure_is_retried_once():
    ok = {"id": "i1", "status": "completed", "steps": [{"type": "function_call", "id": "c", "name": "click", "arguments": {}}]}
    client, fake = model([ConnectionError("reset"), ok])
    turn = asyncio.run(client.turn([], None))
    assert fake.calls == 2 and turn.calls[0].name == "click"


def test_persistent_failure_or_failed_status_raises_model_unavailable(caplog):
    client, fake = model([RuntimeError("quota for key AIza-secret"), RuntimeError("again")])
    with caplog.at_level(logging.WARNING), pytest.raises(ModelUnavailable):
        asyncio.run(client.turn([], None))
    assert fake.calls == 2 and "AIza-secret" not in caplog.text
    failed, _ = model([{"id": "i", "status": "failed", "steps": []}])
    with pytest.raises(ModelUnavailable):
        asyncio.run(failed.turn([], None))


# -- provider messages --------------------------------------------------------


@pytest.mark.parametrize("status,phrase", [(402, "credit"), (429, "busy"), (401, "set up"), (500, "try again")])
def test_steel_errors_become_safe_messages(status, phrase):
    exc = Exception("body with secrets")
    exc.response = SimpleNamespace(status_code=status)
    assert phrase in steel_message(exc).lower()
    assert steel_message(Exception("no response")) == GENERIC_CLOUD_MESSAGE


# -- allowlist ----------------------------------------------------------------


class FakeRoute:
    def __init__(self, url, navigation, resource="script"):
        self.request = SimpleNamespace(url=url, is_navigation_request=lambda: navigation, resource_type=resource)
        self.result = None

    async def continue_(self):
        self.result = "continue"

    async def abort(self, reason):
        self.result = "abort"


async def _route(strict, url, navigation):
    handler = {}

    class Context:
        async def route(self, pattern, fn):
            handler["fn"] = fn

    await install_allowlist(Context(), frozenset({"apply.example.org"}), strict=strict)
    route = FakeRoute(url, navigation)
    await handler["fn"](route)
    return route.result


@pytest.mark.parametrize(
    "strict,url,navigation,expected",
    [
        (False, "https://apply.example.org/step2", True, "continue"),
        (False, "https://elsewhere.example.com/", True, "abort"),  # off-site navigation
        (False, "https://cdn.example.net/app.js", False, "continue"),  # real sites keep their CDN
        (True, "https://cdn.example.net/app.js", False, "abort"),  # practice form: nothing off-site
        (True, "https://www.google.com/recaptcha/api2/anchor", True, "continue"),  # captcha must load to be seen
        (False, "data:image/png;base64,AAAA", False, "continue"),
    ],
)
def test_allowlist(strict, url, navigation, expected):
    assert asyncio.run(_route(strict, url, navigation)) == expected
