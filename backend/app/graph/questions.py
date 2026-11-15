"""Question registry and selection policy (ticket T4).

Every question the app can ask lives in REGISTRY. The Administrator never
invents questions; it picks from here with the two pure functions at the bottom.

The app asks only four core questions, in this order: `needs`, `zip`,
`household_size`, `household_who`. Everything else is a follow-up:

  * A follow-up is *open* once Eligibility reports its field as missing for at
    least one program. `open_questions` ranks them by how many programs each
    would settle, and the person may answer any of them in any order.
  * `pending_question` is always the head of that ranked list, so the app still
    asks one question at a time.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

from app.graph.state import (
    EligibilityAssessment,
    IntakeState,
    Option,
    Profile,
    Program,
    Question,
)

MAX_CORE_QUESTIONS = 6
MAX_FOLLOWUP_QUESTIONS = 20
MAX_TOTAL_QUESTIONS = 30

OTHER_OPTION_ID = "other"

# Requirement kinds that compare household income, possibly by household size.
INCOME_KINDS = frozenset({"income_max", "income_min"})


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
    # Core question that only matters when there are programs to match
    # (household facts): skipped when the ZIP is outside coverage or nothing matched.
    needs_programs: bool = False
    # Options built per session (income bands): ids must match this pattern.
    option_regex: str | None = None
    # Turns the chosen option id into the stored value (income bands).
    parse: Callable[[str], Any] | None = None


def _opts(*pairs: tuple[str, str]) -> list[Option]:
    return [Option(id=i, label=label) for i, label in pairs]


# Order matters: it is the order questions are considered in.
_SPECS: list[QuestionSpec] = [
    QuestionSpec(
        question=Question(
            id="needs",
            prompt="What could use some support right now?",
            reason="Pick everything that applies. You don't need to know which programs exist.",
            type="multi_select",
            options=_opts(
                ("food", "Food & groceries"),
                ("utilities", "Heat & utility bills"),
                ("housing", "Rent or a place to stay"),
                ("healthcare", "Medical care"),
                ("transportation", "Getting around"),
                ("mental_health", "Stress or someone to talk to"),
                ("legal", "Legal help"),
                ("childcare", "Childcare"),
                ("employment", "Work or job training"),
                ("safety", "Feeling unsafe at home"),
                ("taxes", "Free tax help"),
                ("phone_internet", "Phone or internet bills"),
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
            reason="Many programs only serve certain towns or counties. Your ZIP settles that.",
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
            origin="eligibility_followup",
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
            origin="eligibility_followup",
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
            origin="eligibility_followup",
        ),
        label="Situation",
    ),
    QuestionSpec(
        question=Question(
            id="household_size",
            prompt="Who lives with you?",
            reason="Income limits depend on household size. Count everyone you share food or bills with, including you.",
            type="number",
            skippable=False,
            target_field="household_size",
            min=1,
            max=20,
        ),
        label="Household size",
        integer=True,
        always=True,
        needs_programs=True,
    ),
    QuestionSpec(
        question=Question(
            id="household_who",
            prompt="Is anyone at home...",
            reason="Some programs are for older adults or young children.",
            type="multi_select",
            options=_opts(
                ("60", "Someone 60 or older"),
                ("55", "Someone 55 to 59"),
                ("child", "A child under 5 or someone pregnant"),
                ("none", "None of these"),
            ),
            skippable=False,
            target_field="household_who",
        ),
        label="At home",
        always=True,
        needs_programs=True,
    ),
    QuestionSpec(
        question=Question(
            id="monthly_income",
            prompt="About how much income does your household receive each month?",
            reason="Some programs have income limits. An estimate is fine.",
            type="currency",
            target_field="monthly_income",
            origin="eligibility_followup",
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

# --- Follow-ups added for the app shell. Each is asked only when a program's
# requirements name its field and the answer is still unknown. -------------

_YES_NO_UNSURE = _opts(("yes", "Yes"), ("no", "No"), ("unsure", "Not sure"))
_YES_NO = _opts(("yes", "Yes"), ("no", "No"))
# Option id that is exclusive within a multi-select ("None of these").
EXCLUSIVE_OPTION_ID = "none"

# Income bands are built per session from the programs' own tables, so their
# ids are numeric ranges like "0-32000" or "53585-inf", plus "unsure".
INCOME_BAND_PATTERN = r"^(?:\d{1,9}-(?:\d{1,9}|inf)|unsure)$"
_BAND_RE = re.compile(INCOME_BAND_PATTERN)


def parse_income_band(option_id: str) -> Any:
    """Stored value for a band id: {"lo", "hi"} in dollars per year, or "unsure"."""
    if option_id == "unsure":
        return "unsure"
    low, high = option_id.split("-")
    return {"lo": float(low), "hi": None if high == "inf" else float(high)}


_SPECS += [
    QuestionSpec(
        question=Question(
            id="income_band",
            prompt="About how much does your household make in a year, before taxes?",
            reason="A range is all we need. Each cutoff is a published limit for your household size.",
            type="single_select",
            options=[],  # filled in by income_band_question()
            target_field="income_band",
            origin="eligibility_followup",
        ),
        label="Yearly income",
        option_regex=INCOME_BAND_PATTERN,
        parse=parse_income_band,
    ),
    QuestionSpec(
        question=Question(
            id="benefits_held",
            prompt="Do you already get any of these?",
            reason="Some programs open up automatically once you have one of these.",
            type="multi_select",
            options=_opts(
                ("snap", "SNAP (food stamps)"),
                ("masshealth", "MassHealth"),
                ("fuel", "Fuel Assistance"),
                ("none", "None of these"),
            ),
            target_field="benefits_held",
            origin="eligibility_followup",
        ),
        label="Benefits you get",
    ),
    QuestionSpec(
        question=Question(
            id="utility_issues",
            prompt="What's going on with your heat or utilities?",
            reason="A shut-off notice or a broken furnace opens different programs.",
            type="multi_select",
            options=_opts(
                ("heat", "Paying for heat this winter"),
                ("bills", "My electric or gas bill is too high"),
                ("shutoff", "I have a shut-off notice"),
                ("broken", "My heating system is broken"),
            ),
            target_field="utility_issues",
            origin="eligibility_followup",
        ),
        label="Heat & utilities",
    ),
    QuestionSpec(
        question=Question(
            id="housing_need",
            prompt="Which is closest to your situation?",
            reason="Emergency shelter and rent help come from different places.",
            type="single_select",
            options=_opts(
                ("behind", "I'm behind on rent or facing eviction"),
                ("tonight", "I need a place to stay tonight"),
                ("search", "I'm looking for housing"),
            ),
            target_field="housing_need",
            origin="eligibility_followup",
        ),
        label="Housing situation",
    ),
    QuestionSpec(
        question=Question(
            id="eversource_customer",
            prompt="Is Eversource your electric or gas company?",
            reason="The discount rate is only for Eversource customers.",
            type="single_select",
            options=_YES_NO_UNSURE,
            target_field="eversource_customer",
            origin="eligibility_followup",
        ),
        label="Eversource customer",
    ),
    QuestionSpec(
        question=Question(
            id="umass_affiliation",
            prompt="Are you part of the UMass Amherst community?",
            reason="The Campus Pantry is for UMass students, staff and affiliates.",
            type="single_select",
            options=_YES_NO,
            target_field="umass_affiliation",
            origin="eligibility_followup",
        ),
        label="UMass Amherst community",
    ),
    QuestionSpec(
        question=Question(
            id="disability_bus",
            prompt="Does a disability make it hard to ride the bus?",
            reason="Door-to-door paratransit is for people who cannot use the regular bus.",
            type="single_select",
            options=_YES_NO_UNSURE,
            target_field="disability_bus",
            origin="eligibility_followup",
        ),
        label="Disability and the bus",
    ),
    QuestionSpec(
        question=Question(
            id="near_bus_route",
            prompt="Do you live within about 3/4 mile of a city bus route?",
            reason="PVTA paratransit only runs within 3/4 mile of a city bus route.",
            type="single_select",
            options=_YES_NO_UNSURE,
            target_field="near_bus_route",
            origin="eligibility_followup",
        ),
        label="Near a bus route",
    ),
    # Tailoring questions: no program's eligibility depends on them, but the
    # answers change the guide and the document list. Asked from the guide.
    QuestionSpec(
        question=Question(
            id="college_student",
            prompt="Is anyone in your household a college student?",
            reason="Fuel Assistance asks college students for their current financial aid awards.",
            type="single_select",
            options=_YES_NO,
            target_field="college_student",
            origin="eligibility_followup",
        ),
        label="College student at home",
    ),
    QuestionSpec(
        question=Question(
            id="raft_use",
            prompt="What do you need RAFT to cover?",
            reason="Rent help needs an application from your landlord too. For overdue utilities or moving costs, only your household applies.",
            type="single_select",
            options=_opts(
                ("rent", "Overdue rent"),
                ("mortgage", "Overdue mortgage"),
                ("utilities", "Overdue utilities"),
                ("moving", "Moving costs"),
            ),
            target_field="raft_use",
            origin="eligibility_followup",
        ),
        label="What RAFT would cover",
    ),
]

# --- Evidence questions (T15, T17). Asked only after the first results. -----

_SPECS += [
    QuestionSpec(
        question=Question(
            id="evidence_offer",
            prompt="Would you like to try a simulated bank profile to help check your income?",
            reason=(
                "This is optional and uses made-up demo data from a bank sandbox, never a real "
                "account. You can always type your own numbers instead."
            ),
            type="single_select",
            options=_opts(("yes", "Yes, show me the simulated profiles"), ("no", "No, thanks")),
            target_field="evidence_offer",
            origin="evidence_offer",
        ),
        label="Simulated bank profile",
        value_map={"yes": True, "no": False},
    ),
    QuestionSpec(
        question=Question(
            id="confirm_monthly_income",
            prompt="Is this close to your household's monthly income?",
            type="single_select",
            options=_opts(("yes", "Yes, that's about right"), ("no", "No, that's not right")),
            target_field="monthly_income_confirmation",
            origin="conflict",
        ),
        label="Income confirmed",
        value_map={"yes": True, "no": False},
    ),
    QuestionSpec(
        question=Question(
            id="confirm_household_size",
            prompt="Is this the number of people in your household?",
            type="single_select",
            options=_opts(("yes", "Yes, that's right"), ("no", "No, that's not right")),
            target_field="household_size_confirmation",
            origin="conflict",
        ),
        label="Household size confirmed",
        value_map={"yes": True, "no": False},
    ),
]

# Profile field -> the question that asks the person to confirm evidence about it.
CONFIRMATION_FOR: dict[str, str] = {
    "monthly_income": "confirm_monthly_income",
    "household_size": "confirm_household_size",
}
EVIDENCE_PROVENANCES = frozenset({"nessie_sandbox", "document_extracted", "inferred"})
_EVIDENCE_SOURCE = {
    "nessie_sandbox": "The simulated bank profile shows",
    "document_extracted": "Your document shows",
}

REGISTRY: dict[str, QuestionSpec] = {spec.question.id: spec for spec in _SPECS}
_BY_FIELD: dict[str, QuestionSpec] = {spec.question.target_field: spec for spec in _SPECS}


def get_spec(question_id: str) -> QuestionSpec | None:
    return REGISTRY.get(question_id)


def spec_for_field(target_field: str) -> QuestionSpec | None:
    return _BY_FIELD.get(target_field)


def referenced_fields(program: Program) -> set[str]:
    """Profile fields a program's requirements depend on."""
    fields: set[str] = set()
    if program.held_benefit:
        fields.add("benefits_held")  # "you already get this" depends on it
    for requirement in program.requirements:
        if requirement.field:
            fields.add(requirement.field)
        # An income table keyed by household size also needs the household size.
        if requirement.kind in INCOME_KINDS and isinstance(requirement.value, dict):
            fields.add("household_size")
        # Income is answered either as an amount or as a yearly band.
        if requirement.kind in INCOME_KINDS:
            fields.add("income_band")
    return fields


# Fields that can be answered by more than one question.
_ALIASES: dict[str, tuple[str, ...]] = {
    "monthly_income": ("monthly_income", "income_band"),
    "income_band": ("monthly_income", "income_band"),
}


def _is_settled(target_field: str, profile: Profile, intake: IntakeState) -> bool:
    """Answered or deliberately skipped: either way, do not ask again."""
    return any(
        name in profile.facts or name in intake.skipped_fields
        for name in _ALIASES.get(target_field, (target_field,))
    )


def _selected_needs(profile: Profile) -> list[str]:
    fact = profile.facts.get("needs")
    return list(fact.value) if fact and isinstance(fact.value, list) else []


def _budget_left(
    question_id: str, intake: IntakeState, *, followup: bool, counted: bool = True
) -> bool:
    """`counted=False` for evidence questions: only the session total limits them."""
    # Re-posing a question that was already asked does not spend budget.
    if question_id in intake.asked_question_ids:
        return True
    if len(intake.asked_question_ids) >= MAX_TOTAL_QUESTIONS:
        return False
    if not counted:
        return True
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
        if spec.needs_programs and not programs:
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


def unconfirmed_evidence(profile: Profile, field: str):
    """The evidence fact awaiting the person's confirmation for `field`, if any."""
    conflict = next((c for c in profile.conflicts if c.field == field), None)
    if conflict is not None:
        evidence = [c for c in conflict.candidates if c.provenance in EVIDENCE_PROVENANCES]
        return evidence[-1] if evidence else None
    fact = profile.facts.get(field)
    if fact is not None and not fact.confirmed and fact.provenance in EVIDENCE_PROVENANCES:
        return fact
    return None


# How a paper is named to the person, from its kind (never the file name).
PAPER_TITLES: dict[str, str] = {
    "income": "your pay stub",
    "dob": "your household paper",
    "lease": "your lease",
    "heat": "your utility bill",
    "shutoff": "your shut-off notice",
    "address": "your proof of address",
    "id": "your ID",
    "member_income": "your benefit letter",
}

# A household income figure added up from a wage paper and a member's income paper.
SUMMED_INCOME_TITLE = "your pay stub and benefit letter"


def income_is_summed(documents) -> bool:
    """True when the household income on file adds a member's income paper to wages."""
    kinds = {d.kind for d in documents if "monthly_income" in d.extracted_facts}
    return "member_income" in kinds and "income" in kinds


def paper_title(kind: str | None) -> str:
    return PAPER_TITLES.get(kind or "", "your document")


def evidence_from_source(profile: Profile, field: str, source: str):
    """The unconfirmed evidence for `field` that came from `source` ("doc:<id>"), if any."""
    fact = profile.facts.get(field)
    if fact is not None and not fact.confirmed and fact.source == source:
        return fact
    conflict = next((c for c in profile.conflicts if c.field == field), None)
    if conflict is not None:
        return next((c for c in conflict.candidates if c.source == source), None)
    return None


def _source_phrase(fact, source_labels: dict[str, str]) -> str:
    """ "Your pay stub shows", "The simulated bank profile shows". """
    label = source_labels.get(fact.source or "")
    if label:
        verb = "show" if " and " in label else "shows"  # "your pay stub and benefit letter show"
        return f"{label[0].upper()}{label[1:]} {verb}"
    return _EVIDENCE_SOURCE.get(fact.provenance, "Your document shows")


def _describe(field: str, fact) -> str:
    if field == "monthly_income":
        noun = "in deposits" if fact.provenance == "nessie_sandbox" else "in household income"
        return f"about ${float(fact.value):,.0f} a month {noun}"
    return f"a household of {fact.value}"


def confirmation_question(
    profile: Profile, intake: IntakeState, source_labels: dict[str, str] | None = None
) -> Question | None:
    """Ask the person to confirm a fact that came from evidence, if one is waiting."""
    for field, question_id in CONFIRMATION_FOR.items():
        spec = REGISTRY[question_id]
        if spec.question.target_field in intake.skipped_fields:
            continue
        evidence = unconfirmed_evidence(profile, field)
        if evidence is None or evidence.provenance not in _EVIDENCE_SOURCE:
            continue
        if not _budget_left(question_id, intake, followup=False, counted=False):
            continue
        labels = source_labels or {}
        detail = f"{_source_phrase(evidence, labels)} {_describe(field, evidence)}"
        conflict = next((c for c in profile.conflicts if c.field == field), None)
        user = next((c for c in conflict.candidates if c.provenance == "user_reported"), None) if conflict else None
        others = [c for c in conflict.candidates if c is not evidence and c.provenance != "user_reported"] if conflict else []
        if user is not None:
            told = (f"You told us about ${float(user.value):,.0f} a month" if field == "monthly_income"
                    else f"You told us {user.value} {'person lives' if user.value == 1 else 'people live'} with you")
            detail = f"{told}. {detail}"
            reason = "This is different from what you told us, so we're still using your answer."
        elif others:
            other = others[-1]
            detail = f"{detail}, but {_source_phrase(other, labels).lower()} {_describe(field, other)}"
            reason = "Your papers disagree, so we won't use either number until you choose."
        else:
            reason = "We won't use this number until you confirm it."
        return spec.question.model_copy(
            update={"prompt": f"{detail}. {spec.question.prompt}", "reason": reason}
        )
    return None


def evidence_offer_question(
    profile: Profile,
    intake: IntakeState,
    programs: list[Program],
    has_summary: bool,
) -> Question | None:
    """Offer the simulated bank profile once, and only when income matters."""
    spec = REGISTRY["evidence_offer"]
    if has_summary or _is_settled(spec.question.target_field, profile, intake):
        return None
    if spec.question.id in intake.answered_question_ids:
        return None
    if not any("monthly_income" in referenced_fields(p) for p in programs):
        return None
    if not _budget_left(spec.question.id, intake, followup=False, counted=False):
        return None
    return spec.question


def next_awaiting_question(
    profile: Profile,
    intake: IntakeState,
    programs: list[Program],
    assessments: dict[str, EligibilityAssessment],
    *,
    has_summary: bool = False,
    source_labels: dict[str, str] | None = None,
) -> Question | None:
    """After results: confirm evidence first, then a follow-up, then the evidence offer."""
    return (
        confirmation_question(profile, intake, source_labels)
        or next_followup_question(profile, intake, programs, assessments)
        or evidence_offer_question(profile, intake, programs, has_summary)
    )


PERIOD_TO_YEAR = {"month": 12.0, "year": 1.0, "week": 52.0}


def _money(amount: float) -> str:
    return f"${amount:,.0f}"


def _income_cutoffs(programs: list[Program], household: int) -> list[int]:
    """Yearly income limits that matter for this household, from the programs' own tables."""
    cutoffs: list[float] = []
    for program in programs:
        for requirement in program.requirements:
            if requirement.kind not in INCOME_KINDS or not isinstance(requirement.value, dict):
                continue
            limit = requirement.value.get(str(household))
            factor = PERIOD_TO_YEAR.get(requirement.period or "month")
            if limit is not None and factor is not None:
                cutoffs.append(float(limit) * factor)
    kept: list[int] = []
    for value in sorted(cutoffs):
        # Limits that differ by a dollar (one program's ceiling is another's
        # floor) would make a pointless band.
        if not kept or value - kept[-1] > max(25.0, kept[-1] * 0.001):
            kept.append(round(value))
    return kept


def income_band_question(profile: Profile, programs: list[Program]) -> Question | None:
    """The yearly income question, with ranges split at the published limits."""
    size_fact = profile.facts.get("household_size")
    try:
        household = max(1, int(size_fact.value)) if size_fact else None
    except (TypeError, ValueError):
        household = None
    if household is None:
        return None
    cutoffs = _income_cutoffs(programs, household)
    if not cutoffs:
        return None
    edges = [0, *cutoffs]
    options = [
        Option(
            id=f"{low}-{high}",
            label=f"Under {_money(high)}" if low == 0 else f"{_money(low)} to {_money(high)}",
        )
        for low, high in zip(edges, cutoffs)
    ]
    options.append(Option(id=f"{cutoffs[-1]}-inf", label=f"Over {_money(cutoffs[-1])}"))
    options.append(Option(id="unsure", label="Not sure, or prefer not to say"))
    base = REGISTRY["income_band"].question
    people = "person" if household == 1 else "people"
    return base.model_copy(
        update={
            "options": options,
            "prompt": f"About how much does your household of {household} make in a year, before taxes?",
            "reason": (
                f"Each cutoff is a published limit for {household} {people}. "
                "A range is all we need."
            ),
        }
    )


def question_for_field(
    target_field: str, profile: Profile, programs: list[Program]
) -> Question | None:
    """The question that would settle a field Eligibility reported as missing."""
    if target_field in ("monthly_income", "income_band"):
        return income_band_question(profile, programs) or REGISTRY["monthly_income"].question
    spec = spec_for_field(target_field)
    return spec.question if spec else None


@dataclass(frozen=True)
class OpenQuestion:
    question: Question
    affects: list[str]  # program ids this answer could settle


def open_questions(
    profile: Profile,
    intake: IntakeState,
    programs: list[Program],
    assessments: dict[str, EligibilityAssessment],
) -> list[OpenQuestion]:
    """Unanswered follow-ups, most useful first.

    A question is open when an assessment reports its field as missing and the
    person has neither answered nor skipped it. Ranked by how many programs it
    affects (programs in the person's first need count double), then by
    registry order, so the order is stable.
    """
    order = {spec.question.id: index for index, spec in enumerate(_SPECS)}
    needs = _selected_needs(profile)
    first_need = needs[0] if needs else None
    found: dict[str, tuple[Question, list[str]]] = {}
    weight: dict[str, int] = {}
    for program in programs:
        assessment = assessments.get(program.id)
        if assessment is None:
            continue
        for missing in assessment.missing_fields:
            if _is_settled(missing, profile, intake):
                continue
            question = question_for_field(missing, profile, programs)
            if question is None or question.origin == "core":
                continue
            entry = found.setdefault(question.id, (question, []))
            if program.id not in entry[1]:
                entry[1].append(program.id)
                # Programs in the first need the person chose count double.
                weight[question.id] = weight.get(question.id, 0) + (
                    2 if first_need in program.categories else 1
                )
    ranked = sorted(
        found.values(), key=lambda e: (-weight[e[0].id], order.get(e[0].id, 999))
    )
    return [OpenQuestion(question=q, affects=ids) for q, ids in ranked]


def next_followup_question(
    profile: Profile,
    intake: IntakeState,
    programs: list[Program],
    assessments: dict[str, EligibilityAssessment],
) -> Question | None:
    """The head of the open-question list: the one question worth asking next."""
    for item in open_questions(profile, intake, programs, assessments):
        if _budget_left(item.question.id, intake, followup=True):
            return item.question
    return None
