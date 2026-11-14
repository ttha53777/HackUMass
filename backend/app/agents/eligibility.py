"""Eligibility (ticket T10): compares the profile with each program's sourced criteria.

Every status here is decided by code; nothing is guessed. In live mode a model
may reword `explanation` after the run (services/wording.py, guarded) but never
a status.

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

Additions for the app shell (all additive; the table above still holds):

  * `info` requirements are shown but never decide a status.
  * Requirements sharing a `group` are alternatives: met if any is met, not met
    only if all are. Only the first undecided member's field is reported
    missing, so one question settles the group.
  * `on_unmet="later"` makes an unmet requirement mean `opens_later` (the
    program opens once the person has another benefit); `"note"` turns it
    into a note that never lowers the status.
  * `needs_any` limits a requirement to people who chose one of those needs.
  * A "not sure" answer is neither met nor missing: it keeps the status at
    `possibly_eligible` and is never asked again.
  * `held_benefit` plus a matching `benefits_held` answer is `already_receiving`.
  * Yearly income can come from an `income_band` range instead of an amount;
    a limit that falls inside the range stays undecided.

Unknown stays unknown: a missing fact is never assumed either way.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Literal

from app.graph.answers import band_text, display_value
from app.graph.questions import INCOME_KINDS, referenced_fields, spec_for_field
from app.graph.state import (
    CheckLine,
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
    "income_band": "your household income",
    "household_who": "who lives with you",
    "benefits_held": "which benefits you already get",
    "utility_issues": "what is going on with your heat or utilities",
    "housing_need": "your housing situation",
    "eversource_customer": "whether Eversource is your utility company",
    "umass_affiliation": "whether you are part of the UMass Amherst community",
    "disability_bus": "whether a disability makes it hard to ride the bus",
    "near_bus_route": "whether you live near a city bus route",
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
    info: bool = False  # shown, but never decides a status


def _compare(actual: Any, op: str | None, expected: Any) -> bool | None:
    """None when the values cannot be compared (bad record or odd fact)."""
    try:
        if op in ("in", "nin"):
            options = expected if isinstance(expected, list) else [expected]
            if isinstance(actual, list):
                hit = any(item in options for item in actual)
            else:
                hit = actual in options
            return hit if op == "in" else not hit
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


def _income_fact(facts: dict[str, Fact]) -> tuple[str, Fact] | None:
    """Which income answer to judge on: a confirmed amount, else the band, else evidence."""
    amount, band = facts.get("monthly_income"), facts.get("income_band")
    if amount is not None and not _is_weak(amount):
        return "amount", amount
    if band is not None:
        return "band", band
    if amount is not None:
        return "amount", amount
    return None


def _check_income(requirement: Requirement, facts: dict[str, Fact]) -> Check:
    table = requirement.value if isinstance(requirement.value, dict) else None
    chosen = _income_fact(facts)
    needed = ["monthly_income"] + (["household_size"] if table is not None else [])
    missing = [name for name in needed if name not in facts]
    if chosen is not None:  # an income band stands in for the amount
        missing = [name for name in missing if name != "monthly_income"]
    if missing or chosen is None:
        return Check("unknown", missing=missing or ["monthly_income"])
    kind, income = chosen
    if kind == "band" and income.value == "unsure":
        return Check("unknown", "You weren't sure about income, so we can't compare it.", uncertain=True)

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
    bound = "limit" if op == "lte" else "minimum"
    limit_text = f"The {bound}{size_note} is {_money(float(limit))} a {period}."

    if kind == "band":
        return _check_band(income, factor, float(limit), op, limit_text)

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
    evidence = f"Your household income: {yours} ({_source(income)}). {limit_text}"
    weak = any(_is_weak(fact) for fact in used)
    return Check("met" if outcome else "not_met", evidence, uncertain=weak, weak_fact=weak)


def _check_band(income: Fact, factor: float, limit: float, op: str, limit_text: str) -> Check:
    """Compare a yearly income range with a limit: decided only if the whole range is on one side."""
    value = income.value
    if not isinstance(value, dict):
        return Check("unknown", uncertain=True)
    # Band edges are yearly dollars; convert to the limit's period.
    low = float(value.get("lo") or 0) / 12 * factor
    high = None if value.get("hi") is None else float(value["hi"]) / 12 * factor
    tolerance = 1.0  # one program's ceiling is often another's floor, a dollar apart
    if op == "lte":
        met = high is not None and high <= limit + tolerance
        unmet = low >= limit
    else:
        met = low >= limit - tolerance
        unmet = high is not None and high <= limit
    yours = band_text(value)
    evidence = f"Your household income range: {yours} ({_source(income)}). {limit_text}"
    if met:
        return Check("met", evidence)
    if unmet:
        return Check("not_met", evidence)
    return Check(
        "unknown",
        f"{limit_text} That limit falls inside your income range ({yours}), so we can't tell.",
        uncertain=True,
    )


def _check_field(requirement: Requirement, facts: dict[str, Fact]) -> Check:
    name = requirement.field
    if not name:
        return Check("unknown", uncertain=True)
    fact = facts.get(name)
    if fact is None:
        return Check("unknown", missing=[name])
    spec = spec_for_field(name)
    label = spec.label if spec else name.replace("_", " ")
    if fact.value == "unsure":
        # Said "not sure": undecided, but not worth asking again.
        return Check("unknown", f"{label}: you weren't sure.", uncertain=True)
    outcome = _compare(fact.value, requirement.op, requirement.value)
    if outcome is None:
        return Check("unknown", uncertain=True)
    shown = display_value(spec, fact) if spec else str(fact.value)
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

    if kind == "info":
        return Check("unknown", info=True)
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
    if check.result == "not_met":
        if requirement.on_unmet == "later" and requirement.verified and not check.weak_fact:
            check.result = "later"
        elif requirement.on_unmet == "note":
            check.result, check.uncertain, check.info = "unknown", False, True
    return check


def _applies(requirement: Requirement, needs: set[str]) -> bool:
    return not requirement.needs_any or bool(needs & set(requirement.needs_any))


def collapse(checks: list[tuple[Requirement, Check]]) -> list[tuple[Requirement, Check]]:
    """One effective check per requirement, or per group of alternatives.

    A group keeps its first member's position. Its representative requirement is
    the member that decided it (the met one, else the one still asking), so the
    "why" line shows the rule that actually applies.
    """
    groups: dict[str, list[tuple[Requirement, Check]]] = {}
    order: list[tuple[Requirement, Check] | str] = []
    for requirement, check in checks:
        if requirement.group:
            if requirement.group not in groups:
                order.append(requirement.group)
            groups.setdefault(requirement.group, []).append((requirement, check))
        else:
            order.append((requirement, check))
    return [entry if not isinstance(entry, str) else _merge(groups[entry]) for entry in order]


def _merge(members: list[tuple[Requirement, Check]]) -> tuple[Requirement, Check]:
    met = next(((r, c) for r, c in members if c.result == "met"), None)
    if met is not None:
        requirement, check = met
        return requirement, Check("met", check.evidence, uncertain=check.uncertain, weak_fact=check.weak_fact)
    if all(c.result in ("not_met", "later") for _, c in members):
        requirement, first = members[0]
        return requirement, Check(
            first.result, first.evidence, uncertain=first.uncertain, weak_fact=first.weak_fact
        )
    undecided = [(r, c) for r, c in members if c.result == "unknown" and not c.info]
    asking = next(((r, c) for r, c in undecided if c.missing), None)
    requirement, shown = asking or (undecided[0] if undecided else members[0])
    return requirement, Check(
        "unknown",
        shown.evidence,
        # One question at a time: only the first undecided member's field.
        missing=asking[1].missing[:1] if asking else [],
        uncertain=any(c.uncertain for _, c in undecided) or asking is None,
        weak_fact=any(c.weak_fact for _, c in undecided),
    )


def check_lines(effective: list[tuple[Requirement, Check]], receiving: bool) -> list[CheckLine]:
    """The "why" list, one line per effective check."""
    if receiving:
        return [CheckLine(kind="have", text="You already get this benefit.")]
    lines: list[CheckLine] = []
    for requirement, check in effective:
        missing = None
        if check.info:
            kind = "note"
        elif check.result == "met":
            kind = "pass"
        elif check.result == "not_met":
            kind = "fail"
        elif check.result == "later":
            kind = "later"
        elif check.missing:
            kind, missing = "ask", check.missing[0]
        else:
            kind = "unsure"
        lines.append(
            CheckLine(
                kind=kind,
                requirement_id=requirement.id,
                text=requirement.text,
                evidence=check.evidence,
                missing_field=missing,
            )
        )
    return lines


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
    if status == "already_receiving":
        return "You told us you already get this benefit."

    if status == "opens_later":
        requirement = next(r for r, c in checks if c.result == "later")
        return (
            "This program opens up once another benefit is in place. "
            f"The provider says: {requirement.text}"
        )

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
    needs_fact = profile.facts.get("needs")
    needs = set(needs_fact.value) if needs_fact and isinstance(needs_fact.value, list) else set()
    applicable = [r for r in program.requirements if _applies(r, needs)]
    checks = [(r, check_requirement(r, profile)) for r in applicable]
    effective = collapse(checks)
    deciding = [(r, c) for r, c in effective if not c.info]
    missing = list(dict.fromkeys(name for _, c in deciding for name in c.missing))

    held = profile.facts.get("benefits_held")
    receiving = (
        program.held_benefit is not None
        and held is not None
        and isinstance(held.value, list)
        and program.held_benefit in held.value
    )

    if receiving:
        status = "already_receiving"
    elif not program.requirements:
        status = "insufficient_information"
    elif any(c.result == "not_met" and r.verified and not c.weak_fact for r, c in deciding):
        status = "likely_ineligible"
    elif any(c.result == "later" for _, c in deciding):
        status = "opens_later"
    elif missing:
        status = "insufficient_information"
    elif not deciding or any(c.uncertain or c.result != "met" for _, c in deciding):
        status = "possibly_eligible"
    else:
        status = "likely_eligible"

    explanation = (
        NO_REQUIREMENTS_EXPLANATION
        if not program.requirements
        else _explain(program, status, deciding, missing, set(skipped_fields or []))
    )
    return EligibilityAssessment(
        program_id=program.id,
        status=status,
        checks=check_lines(effective, receiving),
        criteria=[
            CriterionResult(
                requirement_id=r.id, result=c.result, evidence=c.evidence, missing=c.missing
            )
            for r, c in checks
        ],
        missing_fields=missing if status in ("insufficient_information", "opens_later") else [],
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
    # Template text only: optional rewording happens after the run (services/wording.py).
    return {"eligibility_assessments": assessments}
