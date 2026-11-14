"""Eligibility (ticket T10): compares the profile with each program's sourced criteria.

Every status here is decided by code; nothing is guessed. In live mode a model
may reword `explanation` (services/wording.py, guarded) but never a status.

Per requirement the result is `met`, `not_met` or `unknown`:

  open_access   met: the provider says it is open to everyone in its area.
  residency     met: Discovery only returns programs whose service area covers
                the user's ZIP, and it re-runs before Eligibility whenever the
                ZIP changes, so a candidate program is in area by construction.
  income_max /  monthly income converted to the requirement's period and
  income_min    compared with its limit; a table is looked up by household
                size and never extrapolated beyond the sizes it lists.
  categorical,  the fact is compared with `op` and `value`.
  age_*, household
  text_only     unknown: a condition the provider states that we cannot check.

Status, first match wins (foundation plan B.4):

  1. a verified requirement is not met, judged on a confirmed fact
                                               -> likely_ineligible
  2. a structured requirement needs a fact we do not have
                                               -> insufficient_information
  3. anything left uncertain: a text-only or unverified requirement, an
     unknown that more answers cannot fix, or a fact that is unconfirmed or
     came from evidence (simulated bank data, a document)
                                               -> possibly_eligible
  4. every requirement verified and met        -> likely_eligible
  5. no requirements recorded                  -> insufficient_information

Unknown stays unknown: a missing fact is never assumed either way.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Literal

from app.graph.answers import display_value
from app.graph.questions import INCOME_KINDS, referenced_fields, spec_for_field
from app.graph.state import (
    CriterionResult,
    DirtyFlags,
    EligibilityAssessment,
    Fact,
    IntakeState,
    Profile,
    Program,
    Requirement,
    SessionState,
)
from app.services.wording import reword_assessments

Result = Literal["met", "not_met", "unknown"]

NO_REQUIREMENTS_EXPLANATION = (
    "We could not verify this program's requirements; confirm with the provider."
)

# Income is stored per month; requirement periods say what a limit is measured in.
PERIOD_PER_MONTH = {"month": 1.0, "year": 12.0, "week": 12 / 52}

# How a missing or decisive fact is described in a sentence ("We need ...").
FIELD_PHRASE = {
    "monthly_income": "your household income",
    "household_size": "how many people live in your household",
    "housing_status": "your housing situation",
    "utility_urgency": "your utility bill situation",
    "age_60_plus": "whether you are 60 or older",
    "heat_included_in_rent": "whether heat is included in your rent",
    "situation": "your current situation",
    "zip": "your ZIP code",
}

EVIDENCE_PROVENANCES = frozenset({"nessie_sandbox", "document_extracted", "inferred"})

PROVENANCE_PHRASE = {
    "user_reported": "you told us",
    "nessie_sandbox": "from the simulated bank profile, not yet confirmed",
    "document_extracted": "from your document, not yet confirmed",
    "inferred": "estimated, not yet confirmed",
}


def field_phrase(name: str) -> str:
    if name in FIELD_PHRASE:
        return FIELD_PHRASE[name]
    spec = spec_for_field(name)
    return f"your {spec.label.lower()}" if spec else name.replace("_", " ")


def _join(phrases: list[str]) -> str:
    if len(phrases) <= 2:
        return " and ".join(phrases)
    return ", ".join(phrases[:-1]) + f", and {phrases[-1]}"


def _money(amount: float) -> str:
    return f"${amount:,.0f}"


def _is_weak(fact: Fact) -> bool:
    """A fact that cannot support a confident result on its own."""
    return not fact.confirmed or fact.provenance in EVIDENCE_PROVENANCES


def _source(fact: Fact) -> str:
    phrase = PROVENANCE_PHRASE.get(fact.provenance, fact.provenance)
    if not fact.confirmed and "not yet confirmed" not in phrase:
        phrase += ", not yet confirmed"
    return phrase


# --------------------------------------------------------------------------
# One requirement
# --------------------------------------------------------------------------


@dataclass
class Check:
    result: Result
    evidence: str | None = None
    missing: list[str] = field(default_factory=list)  # facts that would decide it
    uncertain: bool = False  # cannot support a "likely" status
    weak_fact: bool = False  # judged on unconfirmed or evidence-derived data


def _compare(actual: Any, op: str | None, expected: Any) -> bool | None:
    """None when the values cannot be compared (bad record or odd fact)."""
    try:
        if op == "in":
            options = expected if isinstance(expected, list) else [expected]
            if isinstance(actual, list):
                return any(item in options for item in actual)
            return actual in options
        if op == "eq":
            if isinstance(expected, bool) or isinstance(actual, bool):
                return actual is expected
            return actual == expected
        if op in ("lte", "gte"):
            if isinstance(actual, bool) or isinstance(expected, bool):
                return None
            a, e = float(actual), float(expected)
            return a <= e if op == "lte" else a >= e
    except (TypeError, ValueError):
        return None
    return None


def _check_income(requirement: Requirement, facts: dict[str, Fact]) -> Check:
    table = requirement.value if isinstance(requirement.value, dict) else None
    needed = ["monthly_income"] + (["household_size"] if table is not None else [])
    missing = [name for name in needed if name not in facts]
    if missing:
        return Check("unknown", missing=missing)

    income = facts["monthly_income"]
    used = [income]
    period = requirement.period or "month"
    factor = PERIOD_PER_MONTH.get(period)
    if factor is None:
        return Check("unknown", "We can't read the period this limit is measured in.", uncertain=True)

    size_note = ""
    if table is not None:
        household = facts["household_size"]
        used.append(household)
        try:
            size = int(household.value)
        except (TypeError, ValueError):
            return Check("unknown", uncertain=True)
        limit = table.get(str(size))
        if limit is None:
            return Check(
                "unknown",
                f"The provider's table does not list households of {size}.",
                uncertain=True,
            )
        size_note = f" for a household of {size}"
    else:
        limit = requirement.value

    op = requirement.op or ("lte" if requirement.kind == "income_max" else "gte")
    try:
        monthly = float(income.value)
        amount = monthly * factor
    except (TypeError, ValueError):
        return Check("unknown", uncertain=True)
    outcome = _compare(amount, op, limit)
    if outcome is None:
        return Check("unknown", uncertain=True)

    yours = f"{_money(monthly)} a month"
    if period != "month":
        yours += f", about {_money(amount)} a {period}"
    bound = "limit" if op == "lte" else "minimum"
    evidence = (
        f"Your household income: {yours} ({_source(income)}). "
        f"The {bound}{size_note} is {_money(float(limit))} a {period}."
    )
    weak = any(_is_weak(fact) for fact in used)
    return Check("met" if outcome else "not_met", evidence, uncertain=weak, weak_fact=weak)


def _check_field(requirement: Requirement, facts: dict[str, Fact]) -> Check:
    name = requirement.field
    if not name:
        return Check("unknown", uncertain=True)
    fact = facts.get(name)
    if fact is None:
        return Check("unknown", missing=[name])
    outcome = _compare(fact.value, requirement.op, requirement.value)
    if outcome is None:
        return Check("unknown", uncertain=True)
    spec = spec_for_field(name)
    shown = display_value(spec, fact) if spec else str(fact.value)
    label = spec.label if spec else name.replace("_", " ")
    weak = _is_weak(fact)
    return Check(
        "met" if outcome else "not_met",
        f"{label}: {shown} ({_source(fact)}).",
        uncertain=weak,
        weak_fact=weak,
    )


def check_requirement(requirement: Requirement, profile: Profile) -> Check:
    facts = profile.facts
    kind = requirement.kind

    if kind == "open_access":
        check = Check("met", "The provider says this is open to everyone in its area.")
    elif kind == "residency" and not requirement.field:
        zip_fact = facts.get("zip")
        if zip_fact is None:
            check = Check("unknown", missing=["zip"])
        else:
            check = Check(
                "met",
                f"Your ZIP code {zip_fact.value} is in the area this program serves.",
                uncertain=_is_weak(zip_fact),
            )
    elif kind in INCOME_KINDS and requirement.field in (None, "monthly_income"):
        check = _check_income(requirement, facts)
    elif kind == "text_only":
        check = Check("unknown", uncertain=True)
    else:
        check = _check_field(requirement, facts)

    if not requirement.verified:
        check.uncertain = True
    return check


# --------------------------------------------------------------------------
# One program
# --------------------------------------------------------------------------


def hashed_fields(program: Program) -> list[str]:
    fields = set(referenced_fields(program))
    if any(r.kind == "residency" and not r.field for r in program.requirements):
        fields.add("zip")
    return sorted(fields)


def inputs_hash(program: Program, profile: Profile) -> str:
    """Fingerprint of everything an assessment used. A mismatch means it is stale."""
    used = {
        name: [fact.value, fact.provenance, fact.confirmed, fact.period]
        for name in hashed_fields(program)
        if (fact := profile.facts.get(name)) is not None
    }
    return hashlib.sha256(json.dumps(used, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _explain(
    program: Program,
    status: str,
    checks: list[tuple[Requirement, Check]],
    missing: list[str],
    skipped: set[str],
) -> str:
    if status == "likely_ineligible":
        requirement, check = next(
            (r, c)
            for r, c in checks
            if c.result == "not_met" and r.verified and not c.weak_fact
        )
        about = field_phrase(requirement.field or "monthly_income")
        # Income tables are long; the evidence already states the limit plainly.
        rule = "" if requirement.kind in INCOME_KINDS else f" The provider says: {requirement.text}"
        return (
            f"Based on {about}, this program may not fit.{rule} {check.evidence} "
            "If we have that wrong, or your situation changes, edit your answer."
        )

    if status == "insufficient_information":
        skipped_now = [name for name in missing if name in skipped]
        if skipped_now:
            return (
                f"You skipped the question about {_join([field_phrase(n) for n in skipped_now])}. "
                "Add it if you'd like us to check this program, or ask the provider."
            )
        return f"We need {_join([field_phrase(n) for n in missing])} to check this program."

    if status == "likely_eligible":
        if all(r.kind in ("open_access", "residency") for r, _ in checks):
            return "This program is open to people in the area it serves, which includes your ZIP code."
        return "Based on your answers, you meet every requirement this program lists."

    # possibly_eligible
    checked = [c for r, c in checks if c.result == "met"]
    to_confirm = [r for r, c in checks if c.result == "unknown" and not c.missing]
    parts: list[str] = []
    if not checked:
        parts.append(
            "We can't check this program's requirements here. "
            "Review them below and confirm with the provider."
        )
    elif to_confirm:
        noun = "condition" if len(to_confirm) == 1 else "conditions"
        parts.append(
            f"You meet the requirements we could check. The provider lists {len(to_confirm)} "
            f"more {noun} to confirm with them."
        )
    else:
        parts.append("You appear to meet the requirements we could check.")
    if any(c.weak_fact for _, c in checks):
        parts.append("Part of this uses information you haven't confirmed yet.")
    if any(not r.verified for r, _ in checks):
        parts.append("Some of these rules have not been verified against the provider's page.")
    parts += [
        c.evidence
        for _, c in checks
        if c.result == "unknown" and c.uncertain and not c.missing and c.evidence
    ]
    return " ".join(parts)


def assess(
    program: Program, profile: Profile, *, skipped_fields: list[str] | None = None
) -> EligibilityAssessment:
    checks = [(r, check_requirement(r, profile)) for r in program.requirements]
    missing = list(dict.fromkeys(name for _, c in checks for name in c.missing))

    if not checks:
        status = "insufficient_information"
    elif any(c.result == "not_met" and r.verified and not c.weak_fact for r, c in checks):
        status = "likely_ineligible"
    elif missing:
        status = "insufficient_information"
    elif any(c.uncertain or c.result != "met" for _, c in checks):
        status = "possibly_eligible"
    else:
        status = "likely_eligible"

    explanation = (
        NO_REQUIREMENTS_EXPLANATION
        if not checks
        else _explain(program, status, checks, missing, set(skipped_fields or []))
    )
    return EligibilityAssessment(
        program_id=program.id,
        status=status,
        criteria=[
            CriterionResult(requirement_id=r.id, result=c.result, evidence=c.evidence)
            for r, c in checks
        ],
        missing_fields=missing if status == "insufficient_information" else [],
        explanation=explanation,
        source_urls=list(dict.fromkeys(r.source_url for r in program.requirements))
        or [program.info_url],
        inputs_hash=inputs_hash(program, profile),
    )


# --------------------------------------------------------------------------
# Graph node
# --------------------------------------------------------------------------


def eligibility(state: SessionState) -> dict[str, Any]:
    profile = state.get("profile") or Profile()
    dirty = state.get("dirty") or DirtyFlags()
    skipped = (state.get("intake") or IntakeState()).skipped_fields
    programs = {program.id: program for program in state.get("programs") or []}

    # Recompute only what the Administrator marked out of date.
    assessments = dict(state.get("eligibility_assessments") or {})
    recomputed = [pid for pid in dirty.eligibility_ids if pid in programs]
    for program_id in recomputed:
        assessments[program_id] = assess(programs[program_id], profile, skipped_fields=skipped)
    # Live mode only: rephrase the new explanations. Statuses never change here.
    assessments = reword_assessments(assessments, programs, recomputed)
    return {"eligibility_assessments": assessments}
