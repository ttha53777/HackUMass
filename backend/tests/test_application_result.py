"""Main graph: an application result from the browser agent updates the plan (Phase 0/1, stream D)."""

from datetime import datetime, timezone

from app.agents.action_planning import build_plan
from app.graph.administrator import PLANNING, decide
from app.graph.state import ApplicationRecord, DirtyFlags, EligibilityAssessment
from tests.conftest import make_profile
from tests.test_api import run_food_intake

SENT = datetime(2026, 11, 14, 15, 0, tzinfo=timezone.utc)


def record(program_id, status, confirmation=None):
    return ApplicationRecord(program_id=program_id, status=status, updated_at=SENT, confirmation=confirmation)


def assessment(program_id, status="likely_eligible"):
    return EligibilityAssessment(program_id=program_id, status=status, explanation="", inputs_hash="h")


def test_administrator_stores_the_result_and_marks_the_plan_dirty():
    result = record("p1", "submitted", "PRACTICE-ABC234")
    decision = decide({"application_result": result, "applications": {}, "dirty": DirtyFlags()})
    assert decision.update["applications"] == {"p1": result}
    assert decision.update["application_result"] is None
    # Deterministic: no new specialist; Action Planning picks it up because the plan is dirty.
    assert decision.update["dirty"].plan is True


def test_result_flows_through_the_real_graph_into_the_plan(client):
    session_id, snapshot = run_food_intake(client)
    program_id = snapshot["action_plan"][0]["program_id"]
    sessions = client.app.state.sessions
    finished = client.portal.call(sessions.submit, session_id, {"application_result": record(program_id, "submitted")})
    assert finished
    after = client.get(f"/api/sessions/{session_id}").json()
    assert after["applications"][program_id]["status"] == "submitted"
    item = next(i for i in after["action_plan"] if i["program_id"] == program_id)
    assert item["next_step"].startswith("Sent on November 14, 2026.")
    assert after["action_plan"][-1]["program_id"] == program_id
    assert after["plan_stale"] is False
    assert sessions.values(session_id)["agent_statuses"][PLANNING].status == "completed"


def test_a_newer_result_replaces_the_older_one_for_the_same_program():
    older = {"p1": record("p1", "unclear"), "p2": record("p2", "submitted")}
    decision = decide({"application_result": record("p1", "submitted"), "applications": older})
    assert decision.update["applications"]["p1"].status == "submitted"
    assert decision.update["applications"]["p2"] is older["p2"]


def test_no_result_leaves_applications_alone():
    decision = decide({"applications": {"p1": record("p1", "submitted")}})
    assert "applications" not in decision.update


def test_submitted_moves_below_unstarted_and_says_when(repo):
    programs = [p for p in repo.all() if p.id in ("fixture-food-benefit", "fixture-senior-pantry")]
    assessments = {p.id: assessment(p.id) for p in programs}
    profile = make_profile(needs=["food"])
    before = build_plan(programs, assessments, profile)
    first = before[0].program_id

    after = build_plan(programs, assessments, profile, applications={first: record(first, "submitted")})
    assert after[-1].program_id == first
    provider = next(p.provider for p in programs if p.id == first)
    assert after[-1].next_step == f"Sent on November 14, 2026. Watch for a reply from {provider}."
    assert [i.rank for i in after] == [1, 2]


def test_unclear_asks_the_person_to_check_with_the_provider(repo):
    program = repo.get("fixture-food-benefit")
    plan = build_plan([program], {program.id: assessment(program.id)}, make_profile(needs=["food"]),
                      applications={program.id: record(program.id, "unclear")})
    assert plan[0].next_step.startswith("Check whether your application went through")
    if program.contact:
        assert program.contact in plan[0].next_step


def test_stopped_keeps_the_usual_next_step(repo):
    program = repo.get("fixture-food-benefit")
    args = ([program], {program.id: assessment(program.id)}, make_profile(needs=["food"]))
    assert build_plan(*args, applications={program.id: record(program.id, "stopped")}) == build_plan(*args)
