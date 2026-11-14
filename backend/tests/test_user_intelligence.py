"""User Intelligence (T7): normalisation, provenance, changed_fields, conflicts."""

from datetime import datetime, timezone

import pytest

from app.agents.user_intelligence import (
    apply_evidence_facts,
    user_intelligence,
    values_agree,
)
from app.graph.answers import AnswerError, validate_answer
from app.graph.questions import get_spec
from app.graph.state import AnswerIn, Fact, Profile

NOW = datetime(2026, 11, 14, tzinfo=timezone.utc)


def run(profile: Profile | None, **answer) -> dict:
    state = {"user_answer": AnswerIn(**answer)}
    if profile is not None:
        state["profile"] = profile
    return user_intelligence(state)


def user_fact(value, **extra) -> Fact:
    return Fact(value=value, provenance="user_reported", updated_at=NOW, **extra)


def nessie_fact(value) -> Fact:
    return Fact(value=value, provenance="nessie_sandbox", updated_at=NOW, period="month")


# --------------------------------------------------------------------------
# One row per question type: answer in -> stored fact out
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("answer", "field", "value", "period"),
    [
        ({"question_id": "needs", "selected_option_ids": ["utilities", "food"]},
         "needs", ["utilities", "food"], None),  # order kept: first need weights follow-ups
        ({"question_id": "situation", "selected_option_ids": ["retired"]},
         "situation", "retired", None),
        ({"question_id": "age_60_plus", "selected_option_ids": ["yes"]},
         "age_60_plus", True, None),
        ({"question_id": "zip", "value": "01002"}, "zip", "01002", None),
        ({"question_id": "zip", "value": "01002-1234"}, "zip", "01002", None),
        ({"question_id": "household_size", "value": "2"}, "household_size", 2, None),
        ({"question_id": "monthly_income", "value": "$1,400"}, "monthly_income", 1400.0, "month"),
        ({"question_id": "monthly_income", "value": 16800, "period": "year"},
         "monthly_income", 1400.0, "month"),
    ],
)
def test_each_question_type_is_normalised_with_provenance(answer, field, value, period):
    out = run(None, **answer)
    fact = out["profile"].facts[field]
    assert fact.value == value
    assert type(fact.value) is type(value)
    assert fact.provenance == "user_reported"
    assert fact.confirmed is True
    assert fact.period == period
    assert out["changed_fields"] == [field]
    assert out["user_answer"] is None and out["pending_evidence"] is None


@pytest.mark.parametrize(
    "answer",
    [
        {"question_id": "zip", "value": 1002.0},  # a JSON number lost the leading zero
        {"question_id": "zip", "value": "0100"},
        {"question_id": "zip", "value": "01002-12"},
        {"question_id": "monthly_income", "value": "nan"},
        {"question_id": "monthly_income", "value": "inf"},
        {"question_id": "household_size", "value": "NaN"},
        {"question_id": "household_size", "value": 21},
    ],
)
def test_bad_zip_and_number_input_is_rejected(answer):
    with pytest.raises(AnswerError):
        validate_answer(get_spec(answer["question_id"]), AnswerIn(**answer))


# --------------------------------------------------------------------------
# changed_fields
# --------------------------------------------------------------------------


def test_same_answer_again_changes_nothing():
    first = run(None, question_id="household_size", value=2)
    again = run(first["profile"], question_id="household_size", value="2")
    assert again["changed_fields"] == []


def test_edit_replaces_the_value_and_is_not_a_conflict():
    first = run(None, question_id="household_size", value=2)
    edited = run(first["profile"], question_id="household_size", value=3)
    assert edited["profile"].facts["household_size"].value == 3
    assert edited["profile"].conflicts == []
    assert edited["changed_fields"] == ["household_size"]


def test_skip_withdraws_an_earlier_answer():
    first = run(None, question_id="monthly_income", value=1400)
    skipped = run(first["profile"], question_id="monthly_income", skipped=True)
    assert "monthly_income" not in skipped["profile"].facts
    assert skipped["changed_fields"] == ["monthly_income"]
    assert run(skipped["profile"], question_id="monthly_income", skipped=True)["changed_fields"] == []


def test_other_note_is_kept_verbatim_and_cleared_when_dropped():
    with_note = run(None, question_id="needs", selected_option_ids=["food", "other"],
                    text="  diapers   for my  baby ")
    assert with_note["profile"].facts["needs_note"].value == "diapers for my baby"
    assert set(with_note["changed_fields"]) == {"needs", "needs_note"}

    without = run(with_note["profile"], question_id="needs", selected_option_ids=["food"])
    assert "needs_note" not in without["profile"].facts
    assert set(without["changed_fields"]) == {"needs", "needs_note"}


def test_input_profile_is_not_mutated():
    profile = Profile(facts={"household_size": user_fact(2)})
    run(profile, question_id="household_size", value=4)
    assert profile.facts["household_size"].value == 2


# --------------------------------------------------------------------------
# Evidence and conflicts
# --------------------------------------------------------------------------


def test_contradicting_evidence_opens_a_conflict_and_does_not_overwrite():
    profile = Profile(facts={"monthly_income": user_fact(1400.0, period="month")})
    changed = apply_evidence_facts(profile, {"monthly_income": nessie_fact(2600.0)})

    fact = profile.facts["monthly_income"]
    assert fact.value == 1400.0 and fact.provenance == "user_reported"
    assert fact.confirmed is False  # flagged while the conflict is open
    assert changed == ["monthly_income"]
    [conflict] = profile.conflicts
    assert conflict.field == "monthly_income"
    assert [c.value for c in conflict.candidates] == [1400.0, 2600.0]
    assert [c.provenance for c in conflict.candidates] == ["user_reported", "nessie_sandbox"]


def test_repeated_contradicting_evidence_keeps_one_conflict():
    profile = Profile(facts={"monthly_income": user_fact(1400.0)})
    apply_evidence_facts(profile, {"monthly_income": nessie_fact(2600.0)})
    changed = apply_evidence_facts(profile, {"monthly_income": nessie_fact(2700.0)})
    assert changed == []
    [conflict] = profile.conflicts
    assert conflict.candidates[-1].value == 2700.0
    assert profile.facts["monthly_income"].value == 1400.0


def test_agreeing_evidence_is_not_a_conflict():
    profile = Profile(facts={"monthly_income": user_fact(1400.0)})
    assert apply_evidence_facts(profile, {"monthly_income": nessie_fact(1450.0)}) == []
    assert profile.conflicts == []
    assert profile.facts["monthly_income"].confirmed is True


def test_evidence_alone_is_stored_unconfirmed():
    profile = Profile()
    assert apply_evidence_facts(profile, {"monthly_income": nessie_fact(1400.0)}) == ["monthly_income"]
    fact = profile.facts["monthly_income"]
    assert fact.provenance == "nessie_sandbox" and fact.confirmed is False


def test_evidence_must_not_claim_user_provenance():
    with pytest.raises(ValueError):
        apply_evidence_facts(Profile(), {"monthly_income": user_fact(1.0)})


def test_user_answer_resolves_an_open_conflict():
    profile = Profile(facts={"monthly_income": user_fact(1400.0)})
    apply_evidence_facts(profile, {"monthly_income": nessie_fact(2600.0)})

    out = run(profile, question_id="monthly_income", value=1400)  # user confirms their figure
    fact = out["profile"].facts["monthly_income"]
    assert fact.value == 1400.0 and fact.confirmed is True
    assert out["profile"].conflicts == []
    assert out["changed_fields"] == ["monthly_income"]


def test_user_answer_confirms_unconfirmed_evidence():
    profile = Profile()
    apply_evidence_facts(profile, {"monthly_income": nessie_fact(1400.0)})
    out = run(profile, question_id="monthly_income", value=1400)
    fact = out["profile"].facts["monthly_income"]
    assert fact.provenance == "user_reported" and fact.confirmed is True
    assert out["changed_fields"] == ["monthly_income"]  # confirmation can lift a status


def test_skipping_during_a_conflict_falls_back_to_the_evidence_unconfirmed():
    profile = Profile(facts={"monthly_income": user_fact(1400.0)})
    apply_evidence_facts(profile, {"monthly_income": nessie_fact(2600.0)})
    out = run(profile, question_id="monthly_income", skipped=True)
    fact = out["profile"].facts["monthly_income"]
    assert fact.value == 2600.0 and fact.confirmed is False
    assert out["profile"].conflicts == []


@pytest.mark.parametrize(
    ("a", "b", "agree"),
    [
        (1400.0, 1500.0, True),
        (1400.0, 1600.0, False),
        (0, 0.0, True),
        (True, 1, False),  # a bool is never a number match
        ("retired", "retired", True),
        (["food"], ["food", "utilities"], False),
    ],
)
def test_values_agree(a, b, agree):
    assert values_agree(a, b) is agree
