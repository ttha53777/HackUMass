"""T4: question registry, selection policy, and answer validation."""

import pytest

from app.agents.eligibility import assess
from app.graph.answers import AnswerError, display_value, normalize_answer, validate_answer
from app.graph.questions import (
    MAX_FOLLOWUP_QUESTIONS,
    MAX_TOTAL_QUESTIONS,
    REGISTRY,
    get_spec,
    next_core_question,
    next_followup_question,
    referenced_fields,
)
from app.graph.state import AnswerIn, IntakeState
from tests.conftest import make_profile

ANSWERS = {
    "utility_urgency": "behind",
    "housing_status": "renting",
    "situation": "retired",
    "household_size": 1,
    "monthly_income": 1400.0,
}


def core_sequence(repo, needs: list[str], zip_code: str = "00000") -> list[str]:
    """Question ids asked, in order, when every question is answered."""
    profile, intake, asked = make_profile(), IntakeState(), []
    while True:
        facts = profile.facts
        programs = (
            repo.list(facts["zip"].value, facts["needs"].value)
            if {"needs", "zip"} <= set(facts)
            else []
        )
        question = next_core_question(profile, intake, programs)
        if question is None:
            return asked
        asked.append(question.id)
        intake.asked_question_ids.append(question.id)
        intake.core_asked_count += 1
        value = {"needs": needs, "zip": zip_code}.get(question.id, ANSWERS.get(question.id))
        profile = make_profile(
            **{name: fact.value for name, fact in facts.items()}, **{question.target_field: value}
        )


def test_first_questions_are_always_needs_then_zip(repo):
    assert core_sequence(repo, ["transportation"])[:2] == ["needs", "zip"]


def test_different_needs_produce_different_questions(repo):
    food = core_sequence(repo, ["food"])
    housing = core_sequence(repo, ["housing"])
    assert food == ["needs", "zip", "household_size", "monthly_income"]
    assert housing == ["needs", "zip", "housing_status", "household_size", "monthly_income"]


def test_irrelevant_questions_are_never_asked(repo):
    # No transportation program has an income rule, so income is not asked.
    assert core_sequence(repo, ["transportation"]) == ["needs", "zip"]
    # `situation` is in the registry but no fixture program references it.
    for needs in (["food"], ["housing"], ["utilities"], ["food", "utilities", "housing"]):
        assert "situation" not in core_sequence(repo, needs)


def test_need_specific_question_requires_that_need(repo):
    assert "utility_urgency" in core_sequence(repo, ["utilities"])
    assert "utility_urgency" not in core_sequence(repo, ["food"])


def test_skipped_or_answered_questions_are_not_selected_again(repo):
    programs = repo.list("00000", ["food"])
    profile = make_profile(needs=["food"], zip="00000", household_size=2)
    intake = IntakeState(skipped_fields=["monthly_income"])
    assert next_core_question(profile, intake, programs) is None


def test_core_question_cap(repo):
    programs = repo.list("00000", ["food"])
    profile = make_profile(needs=["food"], zip="00000")
    capped = IntakeState(asked_question_ids=[f"q{i}" for i in range(6)], core_asked_count=6)
    assert next_core_question(profile, capped, programs) is None
    # A question that was already asked can be re-posed without spending budget.
    capped.asked_question_ids.append("household_size")
    assert next_core_question(profile, capped, programs).id == "household_size"


def _assessments(repo, needs, profile):
    programs = repo.list("00000", needs)
    return programs, {program.id: assess(program, profile) for program in programs}


def test_followup_targets_a_missing_field(repo):
    profile = make_profile(needs=["food"], zip="00000", household_size=1, monthly_income=1400.0)
    programs, assessments = _assessments(repo, ["food"], profile)
    question = next_followup_question(profile, IntakeState(), programs, assessments)
    assert question.id == "age_60_plus"
    assert question.origin == "eligibility_followup"


def test_followup_prefers_the_first_selected_need(repo):
    base = dict(zip="00000", household_size=1, monthly_income=1400.0, utility_urgency="behind")
    food_first = make_profile(needs=["food", "utilities"], **base)
    programs, assessments = _assessments(repo, ["food", "utilities"], food_first)
    assert next_followup_question(food_first, IntakeState(), programs, assessments).id == "age_60_plus"

    utilities_first = make_profile(needs=["utilities", "food"], **base)
    programs, assessments = _assessments(repo, ["utilities", "food"], utilities_first)
    picked = next_followup_question(utilities_first, IntakeState(), programs, assessments)
    assert picked.id == "heat_included_in_rent"


def test_followup_caps_and_skips(repo):
    profile = make_profile(needs=["food"], zip="00000", household_size=1, monthly_income=1400.0)
    programs, assessments = _assessments(repo, ["food"], profile)

    spent = IntakeState(followup_asked_count=MAX_FOLLOWUP_QUESTIONS)
    assert next_followup_question(profile, spent, programs, assessments) is None

    total = IntakeState(asked_question_ids=[f"q{i}" for i in range(MAX_TOTAL_QUESTIONS)])
    assert next_followup_question(profile, total, programs, assessments) is None

    skipped = IntakeState(skipped_fields=["age_60_plus"])
    assert next_followup_question(profile, skipped, programs, assessments) is None


def test_income_table_also_references_household_size(repo):
    assert referenced_fields(repo.get("fixture-food-benefit")) == {"monthly_income", "household_size"}
    assert referenced_fields(repo.get("fixture-ride-service")) == set()


def test_income_floor_table_also_references_household_size(repo):
    program = repo.get("fixture-food-benefit")
    floor = program.requirements[0].model_copy(update={"kind": "income_min", "op": "gte"})
    assert referenced_fields(program.model_copy(update={"requirements": [floor]})) == {
        "monthly_income",
        "household_size",
    }


def test_registry_is_consistent():
    fields = [spec.question.target_field for spec in REGISTRY.values()]
    assert len(fields) == len(set(fields)), "each question fills its own field"
    for spec in REGISTRY.values():
        question = spec.question
        if question.type in ("single_select", "multi_select"):
            assert question.options
        assert set(spec.value_map) <= {option.id for option in question.options}


@pytest.mark.parametrize(
    ("question_id", "answer", "expected"),
    [
        ("needs", {"selected_option_ids": ["food", "utilities", "food"]}, ["food", "utilities"]),
        ("needs", {"selected_option_ids": ["other"], "text": "pet food"}, ["other"]),
        ("zip", {"value": " 00000 "}, "00000"),
        ("household_size", {"value": "3"}, 3),
        ("monthly_income", {"value": 1400}, 1400.0),
        ("monthly_income", {"value": "$16,800", "period": "year"}, 1400.0),
        ("monthly_income", {"value": 300, "period": "week"}, 1300.0),
        ("age_60_plus", {"selected_option_ids": ["yes"]}, True),
        ("age_60_plus", {"selected_option_ids": ["no"]}, False),
        ("situation", {"selected_option_ids": ["retired"]}, "retired"),
    ],
)
def test_normalize_valid_answers(question_id, answer, expected):
    spec = get_spec(question_id)
    assert normalize_answer(spec, AnswerIn(question_id=question_id, **answer)) == expected


@pytest.mark.parametrize(
    ("question_id", "answer"),
    [
        ("needs", {}),
        ("needs", {"selected_option_ids": ["yachts"]}),
        ("needs", {"selected_option_ids": ["other"]}),  # "Other" needs a note
        ("zip", {"value": "1234"}),
        ("zip", {"value": "abcde"}),
        ("household_size", {"value": 0}),
        ("household_size", {"value": 2.5}),
        ("household_size", {"value": "many"}),
        ("monthly_income", {"value": -5}),
        ("age_60_plus", {"selected_option_ids": ["yes", "no"]}),
        ("age_60_plus", {}),
    ],
)
def test_reject_invalid_answers(question_id, answer):
    with pytest.raises(AnswerError):
        validate_answer(get_spec(question_id), AnswerIn(question_id=question_id, **answer))


def test_skip_rules():
    validate_answer(get_spec("monthly_income"), AnswerIn(question_id="monthly_income", skipped=True))
    for required in ("needs", "zip"):
        with pytest.raises(AnswerError):
            validate_answer(get_spec(required), AnswerIn(question_id=required, skipped=True))


def test_display_values():
    profile = make_profile(
        needs=["food", "other"], monthly_income=1400.0, age_60_plus=False, household_size=1
    )
    shown = {name: display_value(get_spec(name), fact) for name, fact in profile.facts.items()}
    assert shown == {
        "needs": "Food & groceries, Other",
        "monthly_income": "$1,400 per month",
        "age_60_plus": "No",
        "household_size": "1",
    }
