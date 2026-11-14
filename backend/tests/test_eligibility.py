"""T10: deterministic eligibility — requirement kinds, status rules, recompute scope."""

from datetime import date, datetime, timezone

import pytest

from app.agents.eligibility import assess, check_requirement, eligibility, inputs_hash
from app.graph.state import (
    DirtyFlags,
    Fact,
    IntakeState,
    Profile,
    Program,
    Requirement,
    ServiceArea,
)
from app.services.programs_repo import ProgramsRepository, repository_from_env
from tests.conftest import make_profile

URL = "https://example.org/rules"


def req(kind: str, **kw) -> Requirement:
    return Requirement(id=kw.pop("id", kind), kind=kind, text=kw.pop("text", "rule"),
                       source_url=URL, verified=kw.pop("verified", True), **kw)


def program(*requirements: Requirement, pid: str = "p") -> Program:
    return Program(
        id=pid, name="Test program", provider="Provider", type="community",
        categories=["food"], service_area=ServiceArea(state="MA", counties=["Hampshire"]),
        description="d", info_url="https://example.org", requirements=list(requirements),
        verified_on=date(2026, 11, 14),
    )


def evidence_fact(value, provenance="nessie_sandbox") -> Fact:
    return Fact(value=value, provenance=provenance, updated_at=datetime.now(timezone.utc),
                confirmed=False)


MONTHLY_TABLE = req("income_max", field="monthly_income", op="lte", period="month",
                    value={"1": 2660, "2": 3607})


# --------------------------------------------------------------------------
# Requirement kinds
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("income", "size", "result"),
    [(1400, 1, "met"), (2660, 1, "met"), (2661, 1, "not_met"), (3000, 2, "met")],
)
def test_income_max_table_by_household_size(income, size, result):
    check = check_requirement(MONTHLY_TABLE, make_profile(monthly_income=income, household_size=size))
    assert check.result == result
    assert "$2,660" in check.evidence or "$3,607" in check.evidence


def test_income_yearly_limit_converts_monthly_income():
    yearly = req("income_max", field="monthly_income", op="lte", period="year", value={"1": 20000})
    assert check_requirement(yearly, make_profile(monthly_income=1600, household_size=1)).result == "met"
    over = check_requirement(yearly, make_profile(monthly_income=1700, household_size=1))
    assert over.result == "not_met"
    assert "about $20,400 a year" in over.evidence


def test_income_min_floor():
    floor = req("income_min", field="monthly_income", op="gte", period="year", value={"1": 53586})
    below = check_requirement(floor, make_profile(monthly_income=1400, household_size=1))
    assert below.result == "not_met" and "minimum" in below.evidence
    assert check_requirement(floor, make_profile(monthly_income=5000, household_size=1)).result == "met"


def test_scalar_income_limit_needs_no_household_size():
    scalar = req("income_max", field="monthly_income", op="lte", value=2000)
    assert check_requirement(scalar, make_profile(monthly_income=1999)).result == "met"


def test_household_size_missing_from_table_is_unknown_not_missing():
    check = check_requirement(MONTHLY_TABLE, make_profile(monthly_income=1000, household_size=9))
    assert check.result == "unknown" and check.missing == [] and check.uncertain
    assert "households of 9" in check.evidence


def test_income_rule_reports_each_missing_fact():
    assert check_requirement(MONTHLY_TABLE, make_profile()).missing == ["monthly_income", "household_size"]
    assert check_requirement(MONTHLY_TABLE, make_profile(monthly_income=1)).missing == ["household_size"]


def test_categorical_in_and_eq():
    owners = req("categorical", field="housing_status", op="in", value=["own"])
    assert check_requirement(owners, make_profile(housing_status="own")).result == "met"
    renting = check_requirement(owners, make_profile(housing_status="renting"))
    assert renting.result == "not_met" and "I rent" in renting.evidence
    assert check_requirement(owners, make_profile()).missing == ["housing_status"]


def test_multi_select_fact_matches_any_option():
    needs = req("categorical", field="needs", op="in", value=["food"])
    assert check_requirement(needs, make_profile(needs=["utilities", "food"])).result == "met"


def test_age_threshold_boolean():
    senior = req("age_min", field="age_60_plus", op="eq", value=True)
    assert check_requirement(senior, make_profile(age_60_plus=True)).result == "met"
    assert check_requirement(senior, make_profile(age_60_plus=False)).result == "not_met"


def test_household_rule():
    small = req("household", field="household_size", op="lte", value=2)
    assert check_requirement(small, make_profile(household_size=2)).result == "met"
    assert check_requirement(small, make_profile(household_size=3)).result == "not_met"


def test_open_access_residency_and_text_only():
    assert check_requirement(req("open_access"), make_profile()).result == "met"
    residency = check_requirement(req("residency"), make_profile(zip="01002"))
    assert residency.result == "met" and "01002" in residency.evidence
    assert check_requirement(req("residency"), make_profile()).missing == ["zip"]
    text = check_requirement(req("text_only"), make_profile())
    assert text.result == "unknown" and text.uncertain and not text.missing


def test_malformed_rule_is_unknown_not_a_crash():
    weird = req("categorical", field="housing_status", op="lte", value=["own"])
    assert check_requirement(weird, make_profile(housing_status="own")).result == "unknown"


# --------------------------------------------------------------------------
# Status rules
# --------------------------------------------------------------------------


def test_rule_1_verified_not_met_is_likely_ineligible():
    result = assess(program(MONTHLY_TABLE, req("text_only")),
                    make_profile(monthly_income=9000, household_size=1))
    assert result.status == "likely_ineligible"
    assert "may not fit" in result.explanation and "$2,660" in result.explanation


def test_rule_1_unverified_not_met_is_capped_at_possibly():
    unverified = MONTHLY_TABLE.model_copy(update={"verified": False})
    result = assess(program(unverified), make_profile(monthly_income=9000, household_size=1))
    assert result.status == "possibly_eligible"


def test_rule_1_wins_over_missing_information():
    owners = req("categorical", id="own", field="housing_status", op="in", value=["own"])
    result = assess(program(owners, MONTHLY_TABLE), make_profile(housing_status="renting"))
    assert result.status == "likely_ineligible"


def test_rule_2_missing_income_is_insufficient_with_field_named():
    result = assess(program(MONTHLY_TABLE), make_profile(household_size=1))
    assert result.status == "insufficient_information"
    assert result.missing_fields == ["monthly_income"]
    assert "household income" in result.explanation


def test_rule_2_skipped_field_is_explained_as_skipped():
    result = assess(program(MONTHLY_TABLE), make_profile(household_size=1),
                    skipped_fields=["monthly_income"])
    assert result.status == "insufficient_information"
    assert "skipped" in result.explanation


def test_rule_3_text_only_conditions_make_it_possible():
    result = assess(program(MONTHLY_TABLE, req("text_only", id="t1"), req("text_only", id="t2")),
                    make_profile(monthly_income=1000, household_size=1))
    assert result.status == "possibly_eligible"
    assert "2 more conditions" in result.explanation


def test_rule_3_all_text_only_says_we_cannot_check():
    result = assess(program(req("text_only")), make_profile())
    assert result.status == "possibly_eligible"
    assert "can't check" in result.explanation


def test_rule_3_unverified_met_is_capped_at_possibly():
    result = assess(program(req("open_access", verified=False)), make_profile())
    assert result.status == "possibly_eligible"


@pytest.mark.parametrize("provenance", ["nessie_sandbox", "document_extracted"])
def test_rule_3_evidence_fact_never_yields_likely(provenance):
    profile = make_profile(household_size=1)
    profile.facts["monthly_income"] = evidence_fact(1000, provenance)
    result = assess(program(MONTHLY_TABLE), profile)
    assert result.status == "possibly_eligible"
    assert "haven't confirmed" in result.explanation


def test_rule_3_unconfirmed_fact_cannot_rule_someone_out():
    profile = make_profile(household_size=1)
    profile.facts["monthly_income"] = evidence_fact(9000)
    assert assess(program(MONTHLY_TABLE), profile).status == "possibly_eligible"


def test_rule_4_all_verified_and_met_is_likely():
    result = assess(program(MONTHLY_TABLE, req("residency")),
                    make_profile(monthly_income=1000, household_size=1, zip="01002"))
    assert result.status == "likely_eligible"
    assert all(c.result == "met" for c in result.criteria)


def test_rule_4_open_access_wording():
    result = assess(program(req("open_access"), req("residency")), make_profile(zip="01002"))
    assert result.status == "likely_eligible" and "open to people" in result.explanation


def test_rule_5_no_requirements():
    result = assess(program(), make_profile())
    assert result.status == "insufficient_information"
    assert "could not verify" in result.explanation


def test_assessment_carries_sources_and_disclaimer():
    result = assess(program(MONTHLY_TABLE), make_profile())
    assert result.source_urls == [URL]
    assert "provider" in result.disclaimer


# --------------------------------------------------------------------------
# Hash and recompute scope
# --------------------------------------------------------------------------


def test_inputs_hash_tracks_used_fields_and_confirmation_only():
    p = program(MONTHLY_TABLE)
    base = make_profile(monthly_income=1000, household_size=1, situation="retired")
    assert inputs_hash(p, base) == inputs_hash(p, make_profile(monthly_income=1000, household_size=1))
    assert inputs_hash(p, base) != inputs_hash(p, make_profile(monthly_income=1001, household_size=1))
    unconfirmed = make_profile(household_size=1)
    unconfirmed.facts["monthly_income"] = evidence_fact(1000, "user_reported")
    assert inputs_hash(p, base) != inputs_hash(p, unconfirmed)


def test_residency_programs_hash_the_zip():
    p = program(req("residency"))
    assert inputs_hash(p, make_profile(zip="01002")) != inputs_hash(p, make_profile(zip="01003"))


def test_node_recomputes_only_dirty_programs():
    a, b = program(MONTHLY_TABLE, pid="a"), program(MONTHLY_TABLE, pid="b")
    old = assess(b, make_profile())
    state = {
        "profile": make_profile(monthly_income=1000, household_size=1),
        "programs": [a, b],
        "dirty": DirtyFlags(eligibility_ids=["a", "gone"]),
        "intake": IntakeState(),
        "eligibility_assessments": {"b": old},
    }
    out = eligibility(state)["eligibility_assessments"]
    assert out["a"].status == "likely_eligible"
    assert out["b"] is old  # untouched
    assert "gone" not in out


# --------------------------------------------------------------------------
# Real curated records (the demo persona)
# --------------------------------------------------------------------------


@pytest.fixture(scope="module")
def curated() -> ProgramsRepository:
    return repository_from_env("curated")


PERSONA = dict(needs=["food", "utilities"], zip="01002", utility_urgency="behind",
               household_size=1, monthly_income=1400.0)


def test_persona_against_curated_records(curated):
    profile = make_profile(**PERSONA)
    status = {p.id: assess(p, profile).status for p in curated.list("01002", ["food", "utilities"])}

    assert status["asc-community-meals"] == "likely_eligible"  # open access
    assert status["fbwm-mobile-food-bank"] == "likely_eligible"
    assert status["fbwm-snap-application-assistance"] == "possibly_eligible"  # DTA decides
    assert status["ma-good-neighbor-energy-fund"] == "likely_ineligible"  # below the 60% floor
    assert status["capv-rent-utility-assistance"] == "likely_ineligible"  # shutoff only
    assert status["capv-heating-system-repair"] == "insufficient_information"  # owners only
    assert status["capv-fuel-assistance"] == "possibly_eligible"  # rules are text only


def test_heating_repair_turns_on_the_housing_follow_up(curated):
    repair = curated.get("capv-heating-system-repair")
    assert assess(repair, make_profile(**PERSONA)).missing_fields == ["housing_status"]
    assert assess(repair, make_profile(**PERSONA, housing_status="own")).status == "possibly_eligible"
    assert assess(repair, make_profile(**PERSONA, housing_status="renting")).status == "likely_ineligible"


def test_every_curated_record_assesses_without_error(curated):
    for profile in (make_profile(), make_profile(**PERSONA)):
        for p in curated.all():
            result = assess(p, profile)
            assert result.explanation
            assert len(result.criteria) == len(p.requirements)
            assert set(result.source_urls) <= {r.source_url for r in p.requirements} | {p.info_url}
