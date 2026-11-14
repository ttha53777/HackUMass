"""T4: question registry, selection policy, and answer validation."""

import pytest

from app.agents.eligibility import assess
from app.graph.answers import AnswerError, display_value, normalize_answer, validate_answer
from app.graph.questions import (
    MAX_FOLLOWUP_QUESTIONS,
    MAX_TOTAL_QUESTIONS,
    REGISTRY,
    get_spec,
    income_band_question,
    next_core_question,
    next_followup_question,
    open_questions,
    referenced_fields,
)
from app.graph.state import AnswerIn, IntakeState
from tests.conftest import make_profile

ANSWERS = {
    "utility_urgency": "behind",
    "housing_status": "renting",
    "situation": "retired",
    "household_size": 1,
    "household_who": ["none"],
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


CORE = ["needs", "zip", "household_size", "household_who"]


def test_core_is_the_same_four_questions_whatever_the_needs(repo):
    for needs in (["food"], ["housing"], ["utilities"], ["transportation"]):
        assert core_sequence(repo, needs) == CORE


def test_everything_else_is_a_followup_never_a_core_question(repo):
    for needs in (["food"], ["housing"], ["utilities"], ["food", "utilities", "housing"]):
        asked = core_sequence(repo, needs)
        assert "situation" not in asked and "monthly_income" not in asked


def test_household_questions_wait_for_programs():
    # No programs (outside coverage, or no match): nothing to match a household to.
    profile = make_profile(needs=["food"], zip="99999")
    assert next_core_question(profile, IntakeState(), []) is None


def test_need_specific_followups_are_open_only_for_that_need(repo):
    base = dict(zip="00000", household_size=1, household_who=["none"], monthly_income=1400.0)
    for needs, expected in ((["utilities"], True), (["food"], False)):
        profile = make_profile(needs=needs, **base)
        programs, assessments = _assessments(repo, needs, profile)
        ids = [item.question.id for item in open_questions(profile, IntakeState(), programs, assessments)]
        assert ("utility_urgency" in ids) is expected


def test_skipped_or_answered_questions_are_not_selected_again(repo):
    programs = repo.list("00000", ["food"])
    profile = make_profile(needs=["food"], zip="00000", household_size=2, household_who=["none"])
    assert next_core_question(profile, IntakeState(), programs) is None


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
    assert referenced_fields(repo.get("fixture-food-benefit")) == {
        "monthly_income",
        "income_band",
        "household_size",
    }
    assert referenced_fields(repo.get("fixture-ride-service")) == set()


def test_income_floor_table_also_references_household_size(repo):
    program = repo.get("fixture-food-benefit")
    floor = program.requirements[0].model_copy(update={"kind": "income_min", "op": "gte"})
    assert referenced_fields(program.model_copy(update={"requirements": [floor]})) == {
        "monthly_income",
        "income_band",
        "household_size",
    }


def test_registry_is_consistent():
    fields = [spec.question.target_field for spec in REGISTRY.values()]
    assert len(fields) == len(set(fields)), "each question fills its own field"
    for spec in REGISTRY.values():
        question = spec.question
        if question.type in ("single_select", "multi_select") and not spec.option_regex:
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
    for required in ("needs", "zip", "household_size", "household_who"):
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


# --- open questions, income bands, new answer shapes ---------------------------


def test_open_questions_are_ranked_and_name_the_programs_they_affect(repo):
    profile = make_profile(needs=["food"], zip="00000", household_size=1, household_who=["none"])
    programs, assessments = _assessments(repo, ["food"], profile)
    items = open_questions(profile, IntakeState(), programs, assessments)
    by_id = {item.question.id: item.affects for item in items}
    assert by_id["income_band"] == ["fixture-food-benefit"]
    assert by_id["age_60_plus"] == ["fixture-senior-pantry"]
    # The head is what the app asks next.
    assert next_followup_question(profile, IntakeState(), programs, assessments) == items[0].question


def test_answered_or_skipped_questions_leave_the_open_list(repo):
    profile = make_profile(needs=["food"], zip="00000", household_size=1, household_who=["none"])
    programs, assessments = _assessments(repo, ["food"], profile)
    skipped = IntakeState(skipped_fields=["monthly_income"])  # income_band is the same fact
    ids = [i.question.id for i in open_questions(profile, skipped, programs, assessments)]
    assert "income_band" not in ids and "age_60_plus" in ids


def test_income_band_options_split_at_the_published_limits(repo):
    profile = make_profile(needs=["food"], zip="00000", household_size=1)
    question = income_band_question(profile, repo.list("00000", ["food"]))
    labels = [option.label for option in question.options]
    assert labels[0].startswith("Under $") and labels[-2].startswith("Over $")
    assert labels[-1] == "Not sure, or prefer not to say"
    assert "household of 1" in question.prompt


def test_income_band_answers_are_validated_by_shape_and_stored_as_a_range():
    spec = get_spec("income_band")
    value = normalize_answer(spec, AnswerIn(question_id="income_band", selected_option_ids=["0-31920"]))
    assert value == {"lo": 0.0, "hi": 31920.0}
    assert normalize_answer(spec, AnswerIn(question_id="income_band", selected_option_ids=["unsure"])) == "unsure"
    open_ended = normalize_answer(spec, AnswerIn(question_id="income_band", selected_option_ids=["53585-inf"]))
    assert open_ended == {"lo": 53585.0, "hi": None}
    with pytest.raises(AnswerError):
        normalize_answer(spec, AnswerIn(question_id="income_band", selected_option_ids=["lots"]))


def test_none_of_these_is_exclusive():
    spec = get_spec("household_who")
    assert normalize_answer(spec, AnswerIn(question_id="household_who", selected_option_ids=["none"])) == ["none"]
    with pytest.raises(AnswerError):
        validate_answer(spec, AnswerIn(question_id="household_who", selected_option_ids=["none", "60"]))
