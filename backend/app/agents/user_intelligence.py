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

Free-text interpretation ("Other" notes) is ticket T14; until then the note is
kept verbatim in `<field>_note`. Values are never logged.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Iterable

from app.graph.answers import normalize_answer
from app.graph.questions import OTHER_OPTION_ID, QuestionSpec, get_spec
from app.graph.state import AnswerIn, Conflict, Fact, Profile, SessionState

# Two money amounts within this fraction of each other are treated as the same
# fact (bank deposits rarely match a reported monthly income to the dollar).
MONEY_TOLERANCE = 0.10

EVIDENCE_PROVENANCES = frozenset({"nessie_sandbox", "document_extracted", "inferred"})


def note_field(field: str) -> str:
    return f"{field}_note"


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

    # Free text given with "Other" is kept verbatim as a note (T14 interprets it).
    # It is untrusted user text: stored and displayed, never executed or obeyed.
    note = " ".join((answer.text or "").split())
    if note and OTHER_OPTION_ID in answer.selected_option_ids:
        changed += apply_user_fact(profile, note_field(field), Fact(
            value=note, provenance="user_reported", updated_at=now
        ))
    elif profile.facts.pop(note_field(field), None) is not None:
        changed.append(note_field(field))
    return changed


def _unique(fields: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(fields))


# --------------------------------------------------------------------------
# Graph node
# --------------------------------------------------------------------------


def user_intelligence(state: SessionState) -> dict[str, Any]:
    profile = (state.get("profile") or Profile()).model_copy(deep=True)
    answer = state.get("user_answer")
    changed: list[str] = []

    spec = get_spec(answer.question_id) if answer else None
    if answer is not None and spec is not None:
        changed = apply_answer(profile, spec, answer, datetime.now(timezone.utc))

    return {
        "profile": profile,
        "changed_fields": _unique(changed),
        "user_answer": None,
        "pending_evidence": None,
    }
