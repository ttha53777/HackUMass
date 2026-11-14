"""T11: Action Planning — ranking, exclusion, links copied from records, stated unknowns."""

from datetime import date

import pytest

from app.agents.action_planning import (
    NO_DEADLINE_LISTED,
    NO_DOCUMENTS_LISTED,
    action_planning,
    build_plan,
    urgency_for,
)
from app.agents.eligibility import assess
from app.graph.state import EligibilityAssessment, IntakeState, Program, Requirement, ServiceArea
from app.services.programs_repo import repository_from_env
from tests.conftest import make_profile


def program(pid: str, *, categories=("food",), kind="community", open_access=False,
            apply_url=None, documents=None, period=None, contact="413-555-0100") -> Program:
    requirements = [Requirement(id="o", kind="open_access", text="open",
                                source_url="https://example.org/r", verified=True)] if open_access else []
    return Program(
        id=pid, name=pid.title(), provider="Provider", type=kind, categories=list(categories),
        service_area=ServiceArea(state="MA", counties=["Hampshire"]), description="d",
        info_url=f"https://example.org/{pid}", apply_url=apply_url, contact=contact,
        documents_needed=documents, requirements=requirements, verified_on=date(2026, 11, 14),
        program_period=period,
    )


def assessed(pid: str, status: str, missing=()) -> EligibilityAssessment:
    return EligibilityAssessment(program_id=pid, status=status, missing_fields=list(missing),
                                 explanation="e", inputs_hash="h")


def test_tiers_order_and_ineligible_programs_are_left_out():
    programs = [program(p) for p in ("info", "out", "maybe", "likely")]
    assessments = {
        "info": assessed("info", "insufficient_information", ["monthly_income"]),
        "out": assessed("out", "likely_ineligible"),
        "maybe": assessed("maybe", "possibly_eligible"),
        "likely": assessed("likely", "likely_eligible"),
    }
    plan = build_plan(programs, assessments, make_profile(needs=["food"]))
    assert [i.program_id for i in plan] == ["likely", "maybe", "info"]
    assert [i.action_type for i in plan] == ["apply_now", "confirm_eligibility", "get_more_information"]
    assert [i.rank for i in plan] == [1, 2, 3]


def test_unassessed_programs_are_not_planned():
    assert build_plan([program("a")], {}, make_profile()) == []


def test_within_a_tier_need_order_then_open_access_community_then_name():
    programs = [
        program("b-gov", categories=["food"], kind="government"),
        program("utility", categories=["utilities"]),
        program("c-open", categories=["food"], open_access=True),
        program("a-food", categories=["food"]),
    ]
    assessments = {p.id: assessed(p.id, "possibly_eligible") for p in programs}
    plan = build_plan(programs, assessments, make_profile(needs=["food", "utilities"]))
    assert [i.program_id for i in plan] == ["c-open", "a-food", "b-gov", "utility"]

    flipped = build_plan(programs, assessments, make_profile(needs=["utilities", "food"]))
    assert flipped[0].program_id == "utility"


def test_urgency_comes_only_from_answers_and_breaks_ties_in_a_tier():
    food, utility = program("food"), program("utility", categories=["utilities"])
    assert urgency_for(utility, make_profile()) == "unknown"
    assert urgency_for(utility, make_profile(utility_urgency="shutoff")) == "high"
    assert urgency_for(utility, make_profile(utility_urgency="behind")) == "medium"
    assert urgency_for(food, make_profile(utility_urgency="shutoff")) == "unknown"
    housing = program("h", categories=["housing"])
    assert urgency_for(housing, make_profile(housing_status="no_stable_housing")) == "high"

    assessments = {p.id: assessed(p.id, "possibly_eligible") for p in (food, utility)}
    plan = build_plan([food, utility], assessments,
                      make_profile(needs=["food", "utilities"], utility_urgency="shutoff"))
    assert [i.program_id for i in plan] == ["utility", "food"]


def test_links_documents_and_unknowns_come_from_the_record():
    with_apply = program("apply", apply_url="https://example.org/apply", documents=["ID"])
    no_docs = program("nodocs", period="2026-2027 season")
    plan = build_plan([with_apply, no_docs],
                      {"apply": assessed("apply", "likely_eligible"),
                       "nodocs": assessed("nodocs", "likely_eligible")},
                      make_profile())
    first, second = plan
    assert first.link == "https://example.org/apply"
    assert first.documents == ["ID"] and NO_DOCUMENTS_LISTED not in first.uncertainty
    assert "online" in first.next_step
    assert second.link == "https://example.org/nodocs"  # info_url when no apply_url
    assert second.documents is None and NO_DOCUMENTS_LISTED in second.uncertainty
    assert "Provider note: 2026-2027 season." in second.uncertainty
    assert all(NO_DEADLINE_LISTED in item.uncertainty for item in plan)
    assert "413-555-0100" in second.next_step


def test_skipped_field_step_invites_the_answer():
    p = program("p")
    plan = build_plan([p], {"p": assessed("p", "insufficient_information", ["monthly_income"])},
                      make_profile(), skipped_fields=["monthly_income"])
    assert "household income" in plan[0].next_step


def test_node_reads_state():
    p = program("p", open_access=True)
    out = action_planning({
        "programs": [p],
        "eligibility_assessments": {"p": assessed("p", "likely_eligible")},
        "profile": make_profile(needs=["food"]),
        "intake": IntakeState(),
    })
    assert out["action_plan"][0].next_step.startswith("It's open to everyone")


@pytest.fixture(scope="module")
def curated():
    return repository_from_env("curated")


def test_curated_persona_plan(curated):
    profile = make_profile(needs=["food", "utilities"], zip="01002", utility_issues=["shutoff"],
                           household_size=1, household_who=["none"], monthly_income=1400.0)
    programs = curated.list("01002", ["food", "utilities"])
    assessments = {p.id: assess(p, profile) for p in programs}
    plan = build_plan(programs, assessments, profile)
    by_id = {p.id: p for p in programs}

    planned = [i.program_id for i in plan]
    # Urgent utility help comes first; open-access food follows in the "apply now" tier.
    assert planned[0] == "capv-fuel-assistance"
    assert planned.index("asc-community-meals") < planned.index("hves-benefits-support")
    assert {"asc-community-meals", "fbwm-mobile-food-bank"} <= set(planned)
    assert "ma-good-neighbor-energy-fund" not in planned  # likely ineligible
    assert "hves-home-delivered-meals" not in planned  # likely ineligible
    for item in plan:
        record = by_id[item.program_id]
        assert item.link in {record.info_url, record.apply_url}
        assert item.documents == record.documents_needed
    # A shut-off notice makes the utility help urgent; it is answered by the person, never guessed.
    utilities = [i for i in plan if "utilities" in by_id[i.program_id].categories]
    assert utilities and all(i.urgency == "high" for i in utilities)
