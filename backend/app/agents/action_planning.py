"""Action Planning (ticket T11): an ordered list of next steps from the assessments.

Deterministic. Every link, document and contact detail is copied from the
program record; nothing is generated. In live mode a model may reword
`rationale` and `next_step` (services/wording.py, guarded) but never the order,
links, documents or urgency.

Order (foundation plan B.4, with urgency as a tie-breaker inside a tier):
  1. tier:     apply_now (likely eligible) -> confirm_eligibility (possibly)
               -> get_more_information (insufficient information).
               Likely-ineligible programs are left out of the plan; their
               cards still show them, with the reason.
  2. urgency:  high before medium before low before unknown.
  3. need:     the user's earliest-listed need first.
  4. speed:    open-access community programs first (no application).
  5. name.

Urgency comes only from the user's answers (a shutoff notice, no stable
housing); otherwise it is "unknown". Nothing here invents a deadline.
"""

from __future__ import annotations

from typing import Any

from app.agents.eligibility import field_phrase
from app.graph.questions import get_spec
from app.graph.state import (
    ActionItem,
    EligibilityAssessment,
    IntakeState,
    Profile,
    Program,
    SessionState,
)
from app.services.wording import reword_plan

TIER = {
    "likely_eligible": "apply_now",
    "possibly_eligible": "confirm_eligibility",
    "insufficient_information": "get_more_information",
}
TIER_ORDER = {"apply_now": 0, "confirm_eligibility": 1, "get_more_information": 2}
URGENCY_ORDER = {"high": 0, "medium": 1, "low": 2, "unknown": 3}

# (need category, profile field, answer) -> urgency. Only answers the user gave.
URGENCY_RULES = [
    ("utilities", "utility_urgency", "shutoff", "high"),
    ("utilities", "utility_urgency", "behind", "medium"),
    ("utilities", "utility_urgency", "reduce", "low"),
    ("housing", "housing_status", "no_stable_housing", "high"),
    ("housing", "housing_status", "staying_with_others", "medium"),
]

NO_DOCUMENTS_LISTED = "The provider doesn't list required documents; ask when you contact them."
NO_DEADLINE_LISTED = "No application deadline is listed; confirm timing with the provider."

STATUS_SENTENCE = {
    "apply_now": "You appear to meet the requirements it lists.",
    "confirm_eligibility": "You may qualify; some conditions need checking with the provider.",
    "get_more_information": "We need a little more information to check whether it fits.",
}


def _need_labels() -> dict[str, str]:
    spec = get_spec("needs")
    return {option.id: option.label for option in spec.question.options} if spec else {}


def urgency_for(program: Program, profile: Profile) -> str:
    best = "unknown"
    for category, name, answer, level in URGENCY_RULES:
        fact = profile.facts.get(name)
        if category in program.categories and fact is not None and fact.value == answer:
            if URGENCY_ORDER[level] < URGENCY_ORDER[best]:
                best = level
    return best


def _is_open_access(program: Program) -> bool:
    return any(r.kind == "open_access" for r in program.requirements)


def _reach(program: Program) -> str:
    if program.contact:
        return f"contact them: {program.contact}"
    return "use the provider's page to get in touch"


def _next_step(program: Program, action: str, assessment: EligibilityAssessment, skipped: set[str]) -> str:
    if action == "apply_now":
        if program.apply_url:
            return "Apply online using the link below."
        if _is_open_access(program):
            return "It's open to everyone it serves. Check the provider's page for times and places."
        return f"To apply, {_reach(program)}"

    if action == "confirm_eligibility":
        if program.apply_url:
            return "Check the conditions listed for this program, then apply online using the link below."
        return f"To confirm the conditions and ask how to apply, {_reach(program)}"

    skipped_now = [name for name in assessment.missing_fields if name in skipped]
    if skipped_now:
        phrases = " and ".join(field_phrase(name) for name in skipped_now)
        return f"Add your answer about {phrases} to check this program. Or, {_reach(program)}"
    return f"To ask whether you qualify, {_reach(program)}"


def _uncertainty(program: Program) -> str:
    parts = []
    if program.documents_needed is None:
        parts.append(NO_DOCUMENTS_LISTED)
    if program.program_period:
        parts.append(f"Provider note: {program.program_period}.")
    parts.append(NO_DEADLINE_LISTED)
    return " ".join(parts)


def build_plan(
    programs: list[Program],
    assessments: dict[str, EligibilityAssessment],
    profile: Profile,
    skipped_fields: list[str] | None = None,
) -> list[ActionItem]:
    needs_fact = profile.facts.get("needs")
    needs = [n for n in (needs_fact.value if needs_fact else []) or [] if isinstance(n, str)]
    need_rank = {need: i for i, need in enumerate(dict.fromkeys(needs))}
    labels = _need_labels()
    skipped = set(skipped_fields or [])

    rows = []
    for program in programs:
        assessment = assessments.get(program.id)
        if assessment is None or assessment.status not in TIER:
            continue  # unassessed, or likely ineligible
        action = TIER[assessment.status]
        urgency = urgency_for(program, profile)
        matched = sorted((need_rank[c], c) for c in program.categories if c in need_rank)
        rank_need = matched[0][0] if matched else len(need_rank)
        fast = 0 if program.type == "community" and _is_open_access(program) else 1
        key = (TIER_ORDER[action], URGENCY_ORDER[urgency], rank_need, fast, program.name.lower())
        rows.append((key, program, assessment, action, urgency, matched))

    items: list[ActionItem] = []
    for key, program, assessment, action, urgency, matched in sorted(rows, key=lambda row: row[0]):
        helps = ", ".join(labels.get(c, c).lower() for _, c in matched)
        rationale = (f"Helps with {helps}. " if helps else "") + STATUS_SENTENCE[action]
        items.append(
            ActionItem(
                rank=len(items) + 1,
                program_id=program.id,
                action_type=action,
                rationale=rationale,
                next_step=_next_step(program, action, assessment, skipped),
                documents=program.documents_needed,
                link=program.apply_url or program.info_url,
                urgency=urgency,
                uncertainty=_uncertainty(program),
            )
        )
    return items


def action_planning(state: SessionState) -> dict[str, Any]:
    intake = state.get("intake") or IntakeState()
    programs = state.get("programs") or []
    plan = build_plan(
        programs,
        state.get("eligibility_assessments") or {},
        state.get("profile") or Profile(),
        intake.skipped_fields,
    )
    # Live mode only: rephrase rationale and next step. Order, links and
    # documents are never sent for rewriting.
    return {"action_plan": reword_plan(plan, {p.id: p for p in programs})}
