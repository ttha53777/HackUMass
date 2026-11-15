"""Action Planning (ticket T11): an ordered list of next steps from the assessments.

Deterministic. Every link, document and contact detail is copied from the
program record; nothing is generated. In live mode a model may reword
`rationale` and `next_step` after the run (services/wording.py, guarded) but
never the order, links, documents or urgency.

Order (foundation plan B.4, with urgency as a tie-breaker inside a tier):
  1. tier:     apply_now (likely eligible) -> confirm_eligibility (possibly)
               -> get_more_information (insufficient information).
               Likely-ineligible programs are left out of the plan; their
               cards still show them, with the reason.
  2. urgency:  high before medium before low before unknown.
  3. need:     the user's earliest-listed need first.
  4. speed:    open-access community programs first (no application).
  5. name.

An application the person sent with the browser agent (status "submitted") moves
below every unstarted item and says when it was sent; one whose outcome is
"unclear" asks the person to check, using the provider's own contact details.

Each item also gets a horizon for the plan's lanes (`horizon_for`): "today" for
urgent programs the person can act on and for local help reached by walking in or
calling with nothing to bring; "week" for programs to apply for or confirm (and
urgent ones that need more information first); "later" when more information is
needed. `deadline` marks one step per urgent need: the highest-ranked program with
"high" urgency in that need (every "high" rule is a shutoff, no place to stay, or
safety), so the plan opens with one thing that cannot wait, not a wall of them.

Urgency comes only from the user's answers (a shutoff notice, no stable
housing); otherwise it is "unknown". Nothing here invents a deadline.
"""

from __future__ import annotations

from typing import Any

from app.agents.eligibility import field_phrase
from app.graph.questions import get_spec
from app.graph.state import (
    ActionItem,
    ApplicationRecord,
    EligibilityAssessment,
    IntakeState,
    Profile,
    Program,
    SessionState,
)

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
    # Answers from the app shell's follow-ups (multi-select answers are lists).
    ("utilities", "utility_issues", "shutoff", "high"),
    ("housing", "housing_need", "tonight", "high"),
    ("housing", "housing_need", "behind", "medium"),
    # Choosing "Feeling unsafe at home" puts confidential safety help first.
    ("safety", "needs", "safety", "high"),
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
        answered = fact is not None and (
            answer in fact.value if isinstance(fact.value, list) else fact.value == answer
        )
        if category in program.categories and answered:
            if URGENCY_ORDER[level] < URGENCY_ORDER[best]:
                best = level
    return best


def urgent_categories(program: Program, profile: Profile) -> set[str]:
    """The program's categories that a "high" urgency rule fired for (shutoff -> utilities)."""
    out = set()
    for category, name, answer, level in URGENCY_RULES:
        fact = profile.facts.get(name)
        answered = fact is not None and (
            answer in fact.value if isinstance(fact.value, list) else fact.value == answer
        )
        if level == "high" and category in program.categories and answered:
            out.add(category)
    return out


def horizon_for(program: Program, action: str, urgency: str) -> str:
    """Which lane of the plan: "today", "week" or "later". Deterministic."""
    if urgency == "high":
        return "week" if action == "get_more_information" else "today"
    quick = program.track == "local" and program.access in ("walk_in", "call") and not program.documents_needed
    if action == "apply_now" and quick:
        return "today"
    if action in ("apply_now", "confirm_eligibility"):
        return "week"
    return "later"


def _is_open_access(program: Program) -> bool:
    return any(r.kind == "open_access" for r in program.requirements)


def _reach(program: Program) -> str:
    if program.contact:
        return f"contact them: {program.contact}"
    return "use the provider's page to get in touch"


def _next_step(program: Program, action: str, assessment: EligibilityAssessment, skipped: set[str]) -> str:
    # A program's own first step (sourced, written per program) is the clearest instruction
    # when the person can act now; the generic sentences below are the fallback.
    if action in ("apply_now", "confirm_eligibility") and program.first_step:
        return program.first_step.detail
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


def _sent_date(record: ApplicationRecord) -> str:
    return f"{record.updated_at:%B} {record.updated_at.day}, {record.updated_at.year}"


def _application_step(program: Program, record: ApplicationRecord | None) -> str | None:
    """The next step once the person has applied through the app, or None."""
    if record is None:
        return None
    if record.status == "submitted":
        return f"Sent on {_sent_date(record)}. Watch for a reply from {program.provider}."
    if record.status == "unclear":
        return f"Check whether your application went through: {_reach(program)}"
    return None  # in progress or stopped: the usual next step still applies


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
    applications: dict[str, ApplicationRecord] | None = None,
) -> list[ActionItem]:
    needs_fact = profile.facts.get("needs")
    needs = [n for n in (needs_fact.value if needs_fact else []) or [] if isinstance(n, str)]
    need_rank = {need: i for i, need in enumerate(dict.fromkeys(needs))}
    labels = _need_labels()
    skipped = set(skipped_fields or [])
    applications = applications or {}

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
        record = applications.get(program.id)
        sent = 1 if record is not None and record.status == "submitted" else 0
        key = (sent, TIER_ORDER[action], URGENCY_ORDER[urgency], rank_need, fast, program.name.lower())
        rows.append((key, program, assessment, action, urgency, matched))

    items: list[ActionItem] = []
    deadline_needs: set[str] = set()
    for key, program, assessment, action, urgency, matched in sorted(rows, key=lambda row: row[0]):
        # One deadline per urgent need: the first (best-ranked) high-urgency program that covers it.
        urgent_needs = urgent_categories(program, profile) if action != "get_more_information" else set()
        deadline = bool(urgent_needs - deadline_needs) and key[0] == 0  # not one already sent
        deadline_needs |= urgent_needs
        helps = ", ".join(labels.get(c, c).lower() for _, c in matched)
        rationale = (f"Helps with {helps}. " if helps else "") + STATUS_SENTENCE[action]
        items.append(
            ActionItem(
                rank=len(items) + 1,
                program_id=program.id,
                action_type=action,
                rationale=rationale,
                next_step=_application_step(program, applications.get(program.id))
                or _next_step(program, action, assessment, skipped),
                documents=program.documents_needed,
                link=program.apply_url or program.info_url,
                urgency=urgency,
                horizon=horizon_for(program, action, urgency),
                deadline=deadline,
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
        state.get("applications") or {},
    )
    # Template text only: optional rewording of rationale and next step happens
    # after the run (services/wording.py); order, links and documents never do.
    return {"action_plan": plan}
