"""Contract tests: the shared snapshot fixture, the frontend copy, and graph state."""

import json
from datetime import datetime, timezone
from pathlib import Path

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from app.api.schemas import SessionSnapshot
from app.graph.state import (
    AgentStatus,
    DirtyFlags,
    Fact,
    IntakeState,
    Profile,
    SessionState,
)

FIXTURE = Path(__file__).parent / "fixtures" / "snapshot.json"
FRONTEND_COPY = (
    Path(__file__).parents[2] / "frontend" / "src" / "lib" / "fixtures" / "snapshot.ts"
)
MARKER = "export const snapshotFixture: SessionSnapshot = "


def test_fixture_validates_and_round_trips():
    raw = json.loads(FIXTURE.read_text())
    snapshot = SessionSnapshot.model_validate(raw)
    # Every key in the fixture is a declared field, and nothing is silently dropped.
    assert json.loads(snapshot.model_dump_json()) == raw


def test_fixture_covers_both_program_types_and_links():
    snapshot = SessionSnapshot.model_validate_json(FIXTURE.read_text())
    assert {card.program.type for card in snapshot.programs} == {"government", "community"}
    known_urls = {
        url
        for card in snapshot.programs
        for url in (card.program.info_url, card.program.apply_url)
        if url
    }
    assert all(item.link in known_urls for item in snapshot.action_plan)


def test_frontend_fixture_copy_is_in_sync():
    """Fails when snapshot.json changed without `npm run sync:fixture`."""
    text = FRONTEND_COPY.read_text()
    body = text[text.index(MARKER) + len(MARKER) :].rstrip().removesuffix(";")
    assert json.loads(body) == json.loads(FIXTURE.read_text())


def test_session_state_persists_across_invocations():
    now = datetime.now(timezone.utc)

    def first(state: SessionState) -> dict:
        profile = Profile(
            facts={"zip": Fact(value="00000", provenance="user_reported", updated_at=now)}
        )
        return {
            "profile": profile,
            "intake": IntakeState(asked_question_ids=["zip"]),
            "dirty": DirtyFlags(discovery=True),
            "agent_statuses": {
                "user_intelligence": AgentStatus(status="completed", updated_at=now)
            },
        }

    def second(state: SessionState) -> dict:
        return {
            "agent_statuses": {
                "program_discovery": AgentStatus(status="completed", updated_at=now)
            }
        }

    builder = StateGraph(SessionState)
    builder.add_node("first", first)
    builder.add_node("second", second)
    builder.add_edge(START, "first")
    builder.add_edge("first", "second")
    builder.add_edge("second", END)
    graph = builder.compile(checkpointer=InMemorySaver())

    config = {"configurable": {"thread_id": "t1"}}
    graph.invoke({"session_id": "t1"}, config)
    values = graph.get_state(config).values

    assert isinstance(values["profile"], Profile)
    assert values["profile"].facts["zip"].value == "00000"
    assert values["dirty"].discovery is True
    # The reducer merges statuses from different nodes instead of replacing them.
    assert set(values["agent_statuses"]) == {"user_intelligence", "program_discovery"}

    other = graph.get_state({"configurable": {"thread_id": "t2"}}).values
    assert other == {}
