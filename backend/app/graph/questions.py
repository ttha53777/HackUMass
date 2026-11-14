"""Question registry and selection policy (ticket T4).

Every question the app can ask lives in REGISTRY. The Administrator never
invents questions; it picks from here with the two pure functions at the bottom.

A question is only asked when its answer matters:
  * `needs` and `zip` are always asked, in that order.
  * Other core questions are asked only if a candidate program's requirements
    reference the question's target field.
  * Follow-up questions are asked only after Eligibility reports the field as
    missing for at least one program.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.graph.state import (
    EligibilityAssessment,
    IntakeState,
    Option,
    Profile,
    Program,
    Question,
)

MAX_CORE_QUESTIONS = 6
MAX_FOLLOWUP_QUESTIONS = 2
MAX_TOTAL_QUESTIONS = 10

OTHER_OPTION_ID = "other"


@dataclass(frozen=True)
class QuestionSpec:
    question: Question
    label: str  # short name for the profile summary
    # Ask only when the user selected one of these need categories. Empty = any.
    only_for_needs: frozenset[str] = frozenset()
    # Asked regardless of what programs reference (needs, zip).
    always: bool = False
    # Maps option ids to stored values, e.g. {"yes": True}. Default: the id itself.
    value_map: dict[str, Any] = field(default_factory=dict)
    integer: bool = False


def _opts(*pairs: tuple[str, str]) -> list[Option]:
    return [Option(id=i, label=label) for i, label in pairs]


# Order matters: it is the order questions are considered in.
_SPECS: list[QuestionSpec] = [
    QuestionSpec(
        question=Question(
            id="needs",
            prompt="What are you having the most trouble with right now?",
            reason="Choose everything that applies. This decides which programs we look for.",
            type="multi_select",
            options=_opts(
                ("food", "Food & groceries"),
                ("utilities", "Utilities & energy bills"),
                ("housing", "Housing & rent"),
                ("healthcare", "Healthcare"),
                ("transportation", "Transportation"),
                ("employment", "Work & income"),
            ),
            allow_other=True,
            skippable=False,
            target_field="needs",
        ),
        label="Needs",
        always=True,
    ),
    QuestionSpec(
        question=Question(
            id="zip",
            prompt="What ZIP code do you live in?",
            reason="We use your ZIP code to find programs that serve your area.",
            type="zip",
            skippable=False,
            target_field="zip",
        ),
        label="ZIP code",
        always=True,
    ),
    QuestionSpec(
        question=Question(
            id="utility_urgency",
            prompt="Are you behind on a utility bill, or trying to lower future bills?",
            type="single_select",
            options=_opts(
                ("behind", "I'm behind on a bill"),
                ("shutoff", "I have a shutoff notice"),
                ("reduce", "I want to lower future bills"),
            ),
            target_field="utility_urgency",
        ),
        label="Utility situation",
        only_for_needs=frozenset({"utilities"}),
    ),
    QuestionSpec(
        question=Question(
            id="housing_status",
            prompt="Which best describes your housing right now?",
            type="single_select",
            options=_opts(
                ("renting", "I rent"),
                ("own", "I own my home"),
                ("staying_with_others", "I'm staying with family or friends"),
                ("no_stable_housing", "I don't have stable housing"),
            ),
            target_field="housing_status",
        ),
        label="Housing",
        only_for_needs=frozenset({"housing"}),
    ),
    QuestionSpec(
        question=Question(
            id="situation",
            prompt="Which best describes your current situation?",
            type="single_select",
            options=_opts(
                ("working", "Working"),
                ("looking_for_work", "Looking for work"),
                ("retired", "Retired"),
                ("student", "Student"),
                ("unable_to_work", "Unable to work"),
            ),
            allow_other=True,
            target_field="situation",
        ),
        label="Situation",
    ),
    QuestionSpec(
        question=Question(
            id="household_size",
            prompt="How many people live in your household, including you?",
            reason="Some programs set their limits by household size.",
            type="number",
            target_field="household_size",
            min=1,
            max=20,
        ),
        label="Household size",
        integer=True,
    ),
    QuestionSpec(
        question=Question(
            id="monthly_income",
            prompt="About how much income does your household receive?",
            reason="Some programs have income limits. An estimate is fine.",
            type="currency",
            target_field="monthly_income",
            min=0,
            max=1_000_000,
        ),
        label="Monthly income",
    ),
    QuestionSpec(
        question=Question(
            id="age_60_plus",
            prompt="Are you 60 or older?",
            reason="Some nearby programs are only for people aged 60 and over.",
            type="single_select",
            options=_opts(("yes", "Yes"), ("no", "No")),
            target_field="age_60_plus",
            origin="eligibility_followup",
        ),
        label="Aged 60 or older",
        value_map={"yes": True, "no": False},
    ),
    QuestionSpec(
        question=Question(
            id="heat_included_in_rent",
            prompt="Is heat included in your rent, or do you pay for it yourself?",
            reason="Some energy programs depend on who pays the heating bill.",
            type="single_select",
            options=_opts(
                ("included", "Heat is included in my rent"),
                ("pay_directly", "I pay for heat myself"),
            ),
            target_field="heat_included_in_rent",
            origin="eligibility_followup",
        ),
        label="Heat included in rent",
        value_map={"included": True, "pay_directly": False},
    ),
]

REGISTRY: dict[str, QuestionSpec] = {spec.question.id: spec for spec in _SPECS}
_BY_FIELD: dict[str, QuestionSpec] = {spec.question.target_field: spec for spec in _SPECS}


def get_spec(question_id: str) -> QuestionSpec | None:
    return REGISTRY.get(question_id)


def spec_for_field(target_field: str) -> QuestionSpec | None:
    return _BY_FIELD.get(target_field)


def referenced_fields(program: Program) -> set[str]:
    """Profile fields a program's requirements depend on."""
    fields: set[str] = set()
    for requirement in program.requirements:
        if requirement.field:
            fields.add(requirement.field)
        # An income table keyed by household size also needs the household size.
        if requirement.kind == "income_max" and isinstance(requirement.value, dict):
            fields.add("household_size")
    return fields


def _is_settled(target_field: str, profile: Profile, intake: IntakeState) -> bool:
    """Answered or deliberately skipped: either way, do not ask again."""
    return target_field in profile.facts or target_field in intake.skipped_fields


def _selected_needs(profile: Profile) -> list[str]:
    fact = profile.facts.get("needs")
    return list(fact.value) if fact and isinstance(fact.value, list) else []


def _budget_left(question_id: str, intake: IntakeState, *, followup: bool) -> bool:
    # Re-posing a question that was already asked does not spend budget.
    if question_id in intake.asked_question_ids:
        return True
    if len(intake.asked_question_ids) >= MAX_TOTAL_QUESTIONS:
        return False
    if followup:
        return intake.followup_asked_count < MAX_FOLLOWUP_QUESTIONS
    return intake.core_asked_count < MAX_CORE_QUESTIONS


def next_core_question(
    profile: Profile, intake: IntakeState, programs: list[Program]
) -> Question | None:
    """The next intake question worth asking before eligibility runs, if any."""
    needs = set(_selected_needs(profile))
    referenced: set[str] = set()
    for program in programs:
        referenced |= referenced_fields(program)

    for spec in _SPECS:
        question = spec.question
        if question.origin != "core":
            continue
        if _is_settled(question.target_field, profile, intake):
            continue
        if not spec.always:
            if question.target_field not in referenced:
                continue
            if spec.only_for_needs and not (spec.only_for_needs & needs):
                continue
        if not _budget_left(question.id, intake, followup=False):
            continue
        return question
    return None


def next_followup_question(
    profile: Profile,
    intake: IntakeState,
    programs: list[Program],
    assessments: dict[str, EligibilityAssessment],
) -> Question | None:
    """The single follow-up most likely to change a recommendation, if any.

    Score = number of assessments stuck on `insufficient_information` because of
    the field, counted double for programs in the user's first-selected need.
    """
    needs = _selected_needs(profile)
    first_need = needs[0] if needs else None
    categories = {program.id: program.categories for program in programs}

    scores: dict[str, int] = {}
    for program_id, assessment in assessments.items():
        if assessment.status != "insufficient_information":
            continue
        weight = 2 if first_need and first_need in categories.get(program_id, []) else 1
        for missing in assessment.missing_fields:
            scores[missing] = scores.get(missing, 0) + weight

    best: tuple[int, int, Question] | None = None
    for order, spec in enumerate(_SPECS):
        question = spec.question
        score = scores.get(question.target_field, 0)
        if score == 0 or _is_settled(question.target_field, profile, intake):
            continue
        if not _budget_left(question.id, intake, followup=True):
            continue
        # Highest score wins; registry order breaks ties.
        if best is None or (score, -order) > (best[0], -best[1]):
            best = (score, order, question)
    return best[2] if best else None
