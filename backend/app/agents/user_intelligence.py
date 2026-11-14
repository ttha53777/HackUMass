"""User Intelligence (ticket T7): turns answers and evidence into typed profile facts.

Rules
  * A user answer is authoritative. It replaces the field's fact, marks it
    confirmed, and resolves any open conflict on that field. Re-answering a
    question is an edit, never a conflict.
  * Evidence (Nessie sandbox, document extraction, inference) never overwrites
    a user-reported fact. If it disagrees, a `Conflict` is opened, the user's
    fact is kept but marked unconfirmed, and Eligibility treats it as such.
  * Evidence on its own is stored unconfirmed until the user confirms it.
  * `changed_fields` lists every field whose value, provenance or confirmation
    changed, so the Administrator re-assesses exactly what depends on it.

"Other" free text is kept verbatim in `<field>_note`; options it clearly names
are stored in `<field>_matched` with provenance "inferred" (services/free_text).
Values are never logged.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Iterable

from app.graph.answers import normalize_answer
from app.graph.questions import (
    CONFIRMATION_FOR,
    OTHER_OPTION_ID,
    QuestionSpec,
    get_spec,
    unconfirmed_evidence,
)
from app.graph.state import (
    AnswerIn,
    Conflict,
    Fact,
    FinancialSummary,
    Profile,
    SafeError,
    SessionState,
)
from app.services.free_text import match_other
from app.services.nessie import NessieService

# Two money amounts within this fraction of each other are treated as the same
# fact (bank deposits rarely match a reported monthly income to the dollar).
MONEY_TOLERANCE = 0.10

EVIDENCE_PROVENANCES = frozenset({"nessie_sandbox", "document_extracted", "inferred"})


def note_field(field: str) -> str:
    return f"{field}_note"


def matched_field(field: str) -> str:
    """Options inferred from an "Other" note, kept apart from what the user chose."""
    return f"{field}_matched"


# --------------------------------------------------------------------------
# Comparison
# --------------------------------------------------------------------------


def values_agree(a: Any, b: Any) -> bool:
    """Same fact for conflict purposes. Numbers compare with a tolerance."""
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if a == b:
            return True
        scale = max(abs(a), abs(b))
        return math.isfinite(scale) and abs(a - b) <= MONEY_TOLERANCE * scale
    return a == b


def _same_fact(a: Fact | None, b: Fact | None) -> bool:
    """No observable change for downstream agents."""
    if a is None or b is None:
        return a is b
    return (
        a.value == b.value
        and a.provenance == b.provenance
        and a.confirmed == b.confirmed
        and a.period == b.period
    )


def _conflict_for(profile: Profile, field: str) -> Conflict | None:
    return next((c for c in profile.conflicts if c.field == field), None)


def _drop_conflict(profile: Profile, field: str) -> Conflict | None:
    existing = _conflict_for(profile, field)
    if existing is not None:
        profile.conflicts = [c for c in profile.conflicts if c.field != field]
    return existing


# --------------------------------------------------------------------------
# Profile updates (pure on the given profile copy; return changed fields)
# --------------------------------------------------------------------------


def apply_user_fact(profile: Profile, field: str, fact: Fact) -> list[str]:
    """Store a user-reported fact; it wins over everything and closes conflicts."""
    previous = profile.facts.get(field)
    resolved = _drop_conflict(profile, field) is not None
    stored = fact.model_copy(update={"provenance": "user_reported", "confirmed": True})
    profile.facts[field] = stored
    return [field] if resolved or not _same_fact(previous, stored) else []


def withdraw_user_fact(profile: Profile, field: str) -> list[str]:
    """The user skipped a question they had answered: forget their answer.

    If evidence had been contradicting it, that evidence becomes the field's
    (still unconfirmed) fact rather than being lost.
    """
    previous = profile.facts.pop(field, None)
    profile.facts.pop(note_field(field), None)
    conflict = _drop_conflict(profile, field)
    if conflict is not None:
        evidence = [c for c in conflict.candidates if c.provenance in EVIDENCE_PROVENANCES]
        if evidence:
            profile.facts[field] = evidence[-1].model_copy(update={"confirmed": False})
    return [] if previous is None and conflict is None else [field]


def apply_evidence_fact(profile: Profile, field: str, fact: Fact) -> list[str]:
    """Merge one fact from Nessie, a document or inference. Never overwrites the user."""
    if fact.provenance not in EVIDENCE_PROVENANCES:
        raise ValueError(f"not an evidence provenance: {fact.provenance}")
    incoming = fact.model_copy(update={"confirmed": False})
    previous = profile.facts.get(field)

    if previous is None or previous.provenance != "user_reported":
        # Nothing from the user yet: newest evidence stands, unconfirmed.
        profile.facts[field] = incoming
        return [] if _same_fact(previous, incoming) else [field]

    # While a conflict is open the stored fact is flagged; compare against the
    # user's own candidate so repeated evidence is judged against what they said.
    open_conflict = _conflict_for(profile, field)
    user_fact = previous
    if open_conflict is not None:
        user_fact = next(
            (c for c in open_conflict.candidates if c.provenance == "user_reported"), previous
        )
    if values_agree(user_fact.value, incoming.value):
        # Evidence corroborates the user: any conflict on this field is over.
        if _drop_conflict(profile, field) is None and previous.confirmed:
            return []
        profile.facts[field] = user_fact.model_copy(update={"confirmed": True})
        return [field]

    # Disagreement: keep the user's value, flag it, record both candidates.
    _drop_conflict(profile, field)
    profile.conflicts.append(
        Conflict(field=field, candidates=[user_fact.model_copy(update={"confirmed": True}), incoming])
    )
    flagged = user_fact.model_copy(update={"confirmed": False})
    profile.facts[field] = flagged
    return [] if _same_fact(previous, flagged) else [field]


def apply_evidence_facts(profile: Profile, facts: dict[str, Fact]) -> list[str]:
    """Entry point for Nessie (T15) and document extraction (T17)."""
    changed: list[str] = []
    for field, fact in facts.items():
        changed += apply_evidence_fact(profile, field, fact)
    return changed


def apply_answer(profile: Profile, spec: QuestionSpec, answer: AnswerIn, now: datetime) -> list[str]:
    """Apply one registry answer (already validated by the API)."""
    question = spec.question
    field = question.target_field

    if answer.skipped:
        return withdraw_user_fact(profile, field)

    fact = Fact(
        value=normalize_answer(spec, answer),
        provenance="user_reported",
        updated_at=now,
        period="month" if question.type == "currency" else None,
    )
    changed = apply_user_fact(profile, field, fact)

    # Free text given with "Other" is kept verbatim as a note. It is untrusted
    # user text: stored, matched to known options and displayed, never obeyed.
    note = " ".join((answer.text or "").split())
    matched: list[str] = []
    if note and OTHER_OPTION_ID in answer.selected_option_ids:
        changed += apply_user_fact(profile, note_field(field), Fact(
            value=note, provenance="user_reported", updated_at=now
        ))
        matched = match_other(spec, note, answer.selected_option_ids)
    elif profile.facts.pop(note_field(field), None) is not None:
        changed.append(note_field(field))

    # Inferred options are stored separately and marked "inferred", so the
    # person's own choice is never rewritten; the UI shows the match.
    previous = profile.facts.get(matched_field(field))
    if matched:
        if previous is None or previous.value != matched:
            profile.facts[matched_field(field)] = Fact(
                value=matched, provenance="inferred", updated_at=now, confirmed=False
            )
            changed.append(matched_field(field))
    elif profile.facts.pop(matched_field(field), None) is not None:
        changed.append(matched_field(field))
    return changed


def _unique(fields: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(fields))


# --------------------------------------------------------------------------
# Evidence confirmation (T15, T17)
# --------------------------------------------------------------------------

# Confirmation question id -> the profile field it settles.
CONFIRMS = {question_id: field for field, question_id in CONFIRMATION_FOR.items()}


def apply_confirmation(profile: Profile, field: str, confirmed: bool, now: datetime) -> list[str]:
    """The person said whether evidence about `field` is right.

    Yes: the evidence value becomes their own, confirmed answer.
    No:  their earlier answer stands; with no earlier answer, the evidence is
         dropped so the field is unknown again (and can be asked or added).
    """
    evidence = unconfirmed_evidence(profile, field)
    if evidence is None:
        return []
    if confirmed:
        return apply_user_fact(profile, field, evidence.model_copy(update={"updated_at": now}))
    conflict = _conflict_for(profile, field)
    if conflict is not None:
        user = next((c for c in conflict.candidates if c.provenance == "user_reported"), None)
        if user is not None:
            return apply_user_fact(profile, field, user)
    profile.facts.pop(field, None)
    _drop_conflict(profile, field)
    return [field]


# --------------------------------------------------------------------------
# Graph node
# --------------------------------------------------------------------------


def _income_fact(summary: FinancialSummary, now: datetime) -> Fact:
    return Fact(
        value=summary.avg_monthly_deposits,
        provenance="nessie_sandbox",
        updated_at=now,
        period="month",
        confirmed=False,
    )


def make_user_intelligence(nessie: NessieService | None = None):
    """`nessie` supplies simulated bank summaries; None means seeded personas only."""
    service = nessie

    def user_intelligence(state: SessionState) -> dict[str, Any]:
        nonlocal service
        profile = (state.get("profile") or Profile()).model_copy(deep=True)
        answer = state.get("user_answer")
        evidence = state.get("pending_evidence")
        now = datetime.now(timezone.utc)
        changed: list[str] = []
        update: dict[str, Any] = {}

        spec = get_spec(answer.question_id) if answer else None
        if answer is not None and spec is not None:
            if answer.question_id in CONFIRMS and not answer.skipped:
                yes = normalize_answer(spec, answer) is True
                changed = apply_confirmation(profile, CONFIRMS[answer.question_id], yes, now)
            elif answer.question_id not in CONFIRMS:
                changed = apply_answer(profile, spec, answer, now)

        if evidence is not None and evidence.kind == "nessie" and evidence.persona_id:
            # Consent was checked by the API; record it before any call is made.
            update["consents"] = {**(state.get("consents") or {}), "nessie": True}
            if service is None:
                service = NessieService(None)
            result = service.summarize(evidence.persona_id)
            update["financial_summary"] = result.summary
            changed += apply_evidence_facts(profile, {"monthly_income": _income_fact(result.summary, now)})
            if result.notice:
                code, message = result.notice
                update["errors"] = list(state.get("errors") or []) + [
                    SafeError(code=code, message=message, agent="user_intelligence", at=now)
                ]

        return {
            **update,
            "profile": profile,
            "changed_fields": _unique(changed),
            "user_answer": None,
            "pending_evidence": None,
        }

    return user_intelligence


# Default node: seeded personas only (tests, and when no service is wired).
user_intelligence = make_user_intelligence()
