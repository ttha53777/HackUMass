"""Run outcome -> main graph input (Phase 2)."""

import asyncio
from types import SimpleNamespace

import pytest

from app.execution.config import RunTarget
from app.execution.fields import FieldStore
from app.execution.manager import Run
from app.execution.models import Outcome
from app.execution.results import make_recorder, record_for

TARGET = RunTarget("p1", "practice", "http://127.0.0.1:8000/practice/", frozenset({"127.0.0.1"}))


def run_with(status, outcome=None):
    run = Run(run_id="r1", session_id="s1", target=TARGET, store=FieldStore())
    run.status, run.outcome = status, outcome
    return run


@pytest.mark.parametrize(
    "status,outcome,expected",
    [
        ("done", Outcome(status="submitted", confirmation_text="PRACTICE-ABC234"), ("submitted", "PRACTICE-ABC234")),
        ("done", Outcome(status="unclear", confirmation_text="ignored"), ("unclear", None)),
        ("done", Outcome(status="not_submitted"), ("stopped", None)),
        ("stopped", None, ("stopped", None)),
    ],
)
def test_record_for(status, outcome, expected):
    record = record_for(run_with(status, outcome))
    assert (record.status, record.confirmation) == expected and record.program_id == "p1"


def test_a_failed_run_records_nothing():
    assert record_for(run_with("failed")) is None


class FakeSessions:
    def __init__(self, busy_for=0, exists=True):
        self.meta = SimpleNamespace(busy=busy_for > 0) if exists else None
        self.busy_for = busy_for
        self.submitted = []

    def get(self, session_id):
        if self.meta is not None and self.busy_for:
            self.busy_for -= 1
            self.meta.busy = self.busy_for > 0
        return self.meta

    async def submit(self, session_id, graph_input):
        self.submitted.append((session_id, graph_input))
        return True


def test_recorder_waits_for_an_idle_session(monkeypatch):
    monkeypatch.setattr("app.execution.results.POLL_SECONDS", 0.001)
    sessions = FakeSessions(busy_for=3)
    asyncio.run(make_recorder(sessions)(run_with("done", Outcome(status="submitted"))))
    [(session_id, graph_input)] = sessions.submitted
    assert session_id == "s1" and graph_input["application_result"].status == "submitted"


def test_recorder_gives_up_quietly(monkeypatch):
    monkeypatch.setattr("app.execution.results.POLL_SECONDS", 0.001)
    busy = FakeSessions(busy_for=10_000)
    asyncio.run(make_recorder(busy, wait_seconds=0.01)(run_with("stopped")))
    gone = FakeSessions(exists=False)
    asyncio.run(make_recorder(gone)(run_with("stopped")))
    assert busy.submitted == [] and gone.submitted == []
