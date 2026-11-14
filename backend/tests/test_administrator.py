"""T3: Administrator routing rules, termination, and per-thread persistence."""

from langgraph.graph import END

from app.agents.action_planning import action_planning
from app.agents.discovery import make_discovery
from app.agents.eligibility import assess, eligibility
from app.agents.user_intelligence import user_intelligence
from app.graph.administrator import (
    DISCOVERY,
    ELIGIBILITY,
    MAX_RUNS_PER_SPECIALIST,
    PLANNING,
    USER_INTELLIGENCE,
    decide,
)
from app.graph.build import build_graph, run_config
from app.graph.state import AnswerIn, DirtyFlags, IntakeState
from app.services.session_store import get_checkpointer
from tests.conftest import make_profile

FOOD_PROFILE = dict(needs=["food"], zip="00000", household_size=1, monthly_income=1400.0)


def settled_state(repo, **overrides):
    """A session where intake is done and results are current."""
    profile = make_profile(**FOOD_PROFILE)
    programs = repo.list("00000", ["food"])
    state = {
        "profile": profile,
        "programs": programs,
        "coverage": "supported",
        "intake": IntakeState(
            asked_question_ids=["needs", "zip", "household_size", "monthly_income"],
            core_asked_count=4,
        ),
        "eligibility_assessments": {p.id: assess(p, profile) for p in programs},
        "dirty": DirtyFlags(),
    }
    return {**state, **overrides}


# --- the seven routing rules -------------------------------------------------


def test_rule_1_waiting_answer_goes_to_user_intelligence(repo):
    answer = AnswerIn(question_id="household_size", value=2)
    decision = decide(settled_state(repo, user_answer=answer))
    assert decision.goto == USER_INTELLIGENCE
    assert decision.update["dispatched"] == USER_INTELLIGENCE
    assert decision.update["agent_statuses"][USER_INTELLIGENCE].status == "running"


def test_rule_1_records_and_clears_skips():
    skip = AnswerIn(question_id="monthly_income", skipped=True)
    intake = decide({"user_answer": skip}).update["intake"]
    assert intake.skipped_fields == ["monthly_income"]
    assert intake.answered_question_ids == ["monthly_income"]

    # Answering a previously skipped question withdraws the skip.
    answer = AnswerIn(question_id="monthly_income", value=1400)
    intake = decide({"user_answer": answer, "intake": intake}).update["intake"]
    assert intake.skipped_fields == []


def test_rule_2_discovery_when_needs_and_zip_known(repo):
    state = settled_state(repo, dirty=DirtyFlags(discovery=True))
    decision = decide(state)
    assert decision.goto == DISCOVERY
    assert decision.update["workflow_phase"] == "discovering"


def test_rule_2_waits_until_location_is_known():
    state = {"profile": make_profile(needs=["food"]), "dirty": DirtyFlags(discovery=True)}
    decision = decide(state)
    assert decision.goto == END
    assert decision.update["pending_question"].id == "zip"


def test_rule_3_core_question_ends_the_run():
    decision = decide({})
    assert decision.goto == END
    assert decision.update["pending_question"].id == "needs"
    assert decision.update["workflow_phase"] == "intake"
    assert decision.update["intake"].asked_question_ids == ["needs"]
    assert decision.update["intake"].core_asked_count == 1


def test_rule_3_core_questions_come_before_eligibility(repo):
    state = settled_state(repo, profile=make_profile(needs=["food"], zip="00000"))
    state["dirty"] = DirtyFlags(eligibility_ids=["fixture-food-benefit"], plan=True)
    decision = decide(state)
    assert decision.goto == END
    assert decision.update["pending_question"].id == "household_size"


def test_rule_4_eligibility_when_assessments_are_dirty(repo):
    state = settled_state(repo, dirty=DirtyFlags(eligibility_ids=["fixture-food-benefit"]))
    decision = decide(state)
    assert decision.goto == ELIGIBILITY
    assert decision.update["workflow_phase"] == "evaluating"
    # The flag stays set while Eligibility runs so it knows what to recompute.
    assert decision.update["dirty"].eligibility_ids == ["fixture-food-benefit"]


def test_rule_5_planning_when_plan_is_dirty(repo):
    decision = decide(settled_state(repo, dirty=DirtyFlags(plan=True)))
    assert decision.goto == PLANNING
    assert decision.update["workflow_phase"] == "planning"


def test_rule_6_followup_ends_the_run(repo):
    decision = decide(settled_state(repo))
    assert decision.goto == END
    assert decision.update["pending_question"].id == "age_60_plus"
    assert decision.update["workflow_phase"] == "awaiting_user"
    assert decision.update["intake"].followup_asked_count == 1


def test_rule_6_offers_the_simulated_bank_profile_after_follow_ups(repo):
    intake = IntakeState(skipped_fields=["age_60_plus"])
    decision = decide(settled_state(repo, intake=intake))
    assert decision.update["pending_question"].id == "evidence_offer"
    assert decision.update["workflow_phase"] == "awaiting_user"
    assert decision.update["intake"].followup_asked_count == 0  # not a follow-up


def test_rule_7_complete_when_nothing_is_left(repo):
    intake = IntakeState(skipped_fields=["age_60_plus", "evidence_offer"])
    decision = decide(settled_state(repo, intake=intake))
    assert decision.goto == END
    assert decision.update["pending_question"] is None
    assert decision.update["workflow_phase"] == "complete"


# --- consequences of a specialist finishing ----------------------------------


def test_changed_needs_or_zip_marks_discovery_dirty(repo):
    state = settled_state(repo, dispatched=USER_INTELLIGENCE, changed_fields=["zip"])
    decision = decide(state)
    assert decision.goto == DISCOVERY
    assert decision.update["changed_fields"] == []


def test_changed_field_marks_only_dependent_programs(repo):
    state = settled_state(repo, dispatched=USER_INTELLIGENCE, changed_fields=["age_60_plus"])
    decision = decide(state)
    assert decision.goto == ELIGIBILITY
    assert decision.update["dirty"].eligibility_ids == ["fixture-senior-pantry"]


def test_discovery_return_prunes_results_for_dropped_programs(repo):
    state = settled_state(repo, dispatched=DISCOVERY)
    state["programs"] = [p for p in state["programs"] if p.id == "fixture-food-benefit"]
    state["action_plan"] = action_planning(settled_state(repo))["action_plan"]
    decision = decide(state)
    assert set(decision.update["eligibility_assessments"]) == {"fixture-food-benefit"}
    assert [item.program_id for item in decision.update["action_plan"]] == ["fixture-food-benefit"]
    assert decision.goto == ELIGIBILITY


def test_eligibility_return_marks_plan_dirty(repo):
    state = settled_state(repo, dispatched=ELIGIBILITY)
    state["dirty"] = DirtyFlags(eligibility_ids=["fixture-food-benefit"])
    decision = decide(state)
    assert decision.goto == PLANNING
    assert decision.update["dirty"].eligibility_ids == []


def test_specialist_budget_stops_repeat_dispatch(repo):
    state = settled_state(
        repo,
        dirty=DirtyFlags(eligibility_ids=["fixture-food-benefit"]),
        run_counts={ELIGIBILITY: MAX_RUNS_PER_SPECIALIST},
    )
    decision = decide(state)
    assert decision.goto != ELIGIBILITY
    assert decision.update["errors"][0].code == "run_budget_exceeded"
    assert decision.update["dirty"].eligibility_ids == []


# --- the compiled graph -------------------------------------------------------


def make_graph(repo, **overrides):
    nodes = dict(
        user_intelligence=user_intelligence,
        discovery=make_discovery(repo),
        eligibility=eligibility,
        action_planning=action_planning,
    )
    return build_graph(checkpointer=get_checkpointer(), **{**nodes, **overrides})


def answer(graph, thread, **fields):
    payload = {"user_answer": AnswerIn(**fields), "run_counts": {}, "errors": []}
    return graph.invoke(payload, run_config(thread))


def test_new_session_asks_first_question_without_input(repo):
    graph = make_graph(repo)
    state = graph.invoke({"session_id": "s", "run_counts": {}}, run_config("s"))
    assert state["pending_question"].id == "needs"
    assert state["workflow_phase"] == "intake"


def test_state_persists_across_invocations_and_threads_are_isolated(repo):
    graph = make_graph(repo)
    for thread in ("a", "b"):
        graph.invoke({"session_id": thread, "run_counts": {}}, run_config(thread))
    answer(graph, "a", question_id="needs", selected_option_ids=["food"])
    state = answer(graph, "a", question_id="zip", value="00000")

    assert state["profile"].facts["needs"].value == ["food"]  # kept from the earlier turn
    assert state["pending_question"].id == "household_size"
    other = graph.get_state(run_config("b")).values
    assert other["pending_question"].id == "needs"
    assert not other.get("profile")


def test_full_run_reaches_results_and_then_completes(repo):
    graph = make_graph(repo)
    graph.invoke({"session_id": "s", "run_counts": {}}, run_config("s"))
    answer(graph, "s", question_id="needs", selected_option_ids=["food"])
    answer(graph, "s", question_id="zip", value="00000")
    answer(graph, "s", question_id="household_size", value=1)
    state = answer(graph, "s", question_id="monthly_income", value=1400)

    assert state["workflow_phase"] == "awaiting_user"
    assert state["pending_question"].id == "age_60_plus"
    assert {p.type for p in state["programs"]} == {"government", "community"}
    assert len(state["action_plan"]) == 2
    assert state["dirty"] == DirtyFlags()

    state = answer(graph, "s", question_id="age_60_plus", selected_option_ids=["yes"])
    assert state["eligibility_assessments"]["fixture-senior-pantry"].missing_fields == []
    assert state["pending_question"].id == "evidence_offer"

    state = answer(graph, "s", question_id="evidence_offer", selected_option_ids=["no"])
    assert state["workflow_phase"] == "complete" and state["pending_question"] is None


def test_followup_recomputes_only_the_affected_program(repo):
    assessed: list[list[str]] = []

    def spying_eligibility(state):
        assessed.append(list(state["dirty"].eligibility_ids))
        return eligibility(state)

    graph = make_graph(repo, eligibility=spying_eligibility)
    graph.invoke({"session_id": "s", "run_counts": {}}, run_config("s"))
    answer(graph, "s", question_id="needs", selected_option_ids=["food"])
    answer(graph, "s", question_id="zip", value="00000")
    answer(graph, "s", question_id="household_size", value=1)
    answer(graph, "s", question_id="monthly_income", value=1400)
    answer(graph, "s", question_id="age_60_plus", selected_option_ids=["yes"])

    # Discovery's ordering is its own concern; only the sets matter here.
    assert [sorted(ids) for ids in assessed] == [
        ["fixture-food-benefit", "fixture-senior-pantry"],  # first pass: everything
        ["fixture-senior-pantry"],  # follow-up: only the program that uses age
    ]


def test_failing_specialist_does_not_crash_or_loop(repo):
    def broken(state):
        raise RuntimeError("boom")

    graph = make_graph(repo, eligibility=broken)
    graph.invoke({"session_id": "s", "run_counts": {}}, run_config("s"))
    answer(graph, "s", question_id="needs", selected_option_ids=["transportation"])
    state = answer(graph, "s", question_id="zip", value="00000")

    assert state["agent_statuses"]["eligibility"].status == "failed"
    assert [error.code for error in state["errors"]] == ["specialist_failed"]
    assert "boom" not in state["errors"][0].message
    assert state["workflow_phase"] == "complete"
    assert len(state["programs"]) == 1  # discovery results survive the failure


def test_unsupported_zip_yields_no_programs(repo):
    graph = make_graph(repo)
    graph.invoke({"session_id": "s", "run_counts": {}}, run_config("s"))
    answer(graph, "s", question_id="needs", selected_option_ids=["food"])
    state = answer(graph, "s", question_id="zip", value="99999")

    assert state["coverage"] == "unsupported"
    assert state["programs"] == []
    assert state["action_plan"] == []
    assert state["workflow_phase"] == "complete"
