"""User Intelligence (ticket T7): turns answers and evidence into typed profile facts.

Rules
  * A user answer is authoritative. It replaces the field's fact, marks it
    confirmed, and resolves any open conflict on that field. Re-answering a
    question is an edit, never a conflict.
  * Evidence (Nessie sandbox, document extraction, inference) never overwrites
    a user-reported fact. If it disagrees, a `Conflict` is opened, the user's
    fact is kept but marked unconfirmed, and Eligibility treats it as such.
  * Evidence on its own is stored unconfirmed until the user confirms it.
    Two pieces of evidence that disagree (a paper and the bank, or two
    papers) open a conflict too; two that agree are still unconfirmed:
    agreement is never confirmation.
  * Papers come from the Document Agent through `document_queue`; review
    card answers arrive as `review_decisions`.
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
    BANK_SOURCE_PREFIX,
    CONFIRMATION_FOR,
    bank_review_fields,
    OTHER_OPTION_ID,
    QuestionSpec,
    evidence_from_source,
    get_spec,
    unconfirmed_evidence,
)
from app.graph.state import (
    AnswerIn,
    Conflict,
    DocumentExtraction,
    Fact,
    Profile,
    ReviewDecision,
    SafeError,
    SessionState,
)
from app.services.free_text import match_other
from app.services.nessie import NessieService, bank_facts

# Two money amounts within this fraction of each other are treated as the same
# fact (bank deposits rarely match a reported monthly income to the dollar).
MONEY_TOLERANCE = 0.10

EVIDENCE_PROVENANCES = frozenset({"nessie_sandbox", "document_extracted", "inferred"})

# Evidence values ranked so the stronger one stands without a question: a
# shut-off notice outranks "behind on a bill" from the bill itself.
STRENGTH: dict[str, dict[Any, int]] = {
    "utility_urgency": {"reduce": 0, "behind": 1, "shutoff": 2},
}

# Fields read from the same paper that settle together: confirming the
# household size from a household paper also confirms its age groups.
LINKED: dict[str, tuple[str, ...]] = {"household_size": ("household_who",)}


def _origin(fact: Fact) -> str:
    return fact.source or fact.provenance


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

    if previous is None:
        profile.facts[field] = incoming
        return [field]
    if previous.provenance != "user_reported":
        return _merge_evidence(profile, field, previous, incoming)

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


def _merge_evidence(profile: Profile, field: str, previous: Fact, incoming: Fact) -> list[str]:
    """Evidence meets evidence (nothing from the user yet)."""
    open_conflict = _conflict_for(profile, field)
    candidates = list(open_conflict.candidates) if open_conflict else [previous]
    # A newer reading from the same source replaces that source's old one.
    candidates = [c for c in candidates if _origin(c) != _origin(incoming)] + [incoming]
    if field in STRENGTH:
        rank = STRENGTH[field]
        strongest = max(candidates, key=lambda c: rank.get(c.value, -1))
        _drop_conflict(profile, field)
        profile.facts[field] = strongest
        return [] if _same_fact(previous, strongest) else [field]
    disagree = any(not values_agree(c.value, candidates[0].value) for c in candidates[1:])
    _drop_conflict(profile, field)
    if disagree:
        profile.conflicts.append(Conflict(field=field, candidates=candidates))
    # The newest reading is the stored value, unconfirmed either way. When the
    # readings agree, a paper's reading is kept over the bank's: it is the one
    # the person can review, and it survives disconnecting the bank.
    stored = incoming
    if not disagree and not (incoming.source or "").startswith("doc:"):
        stored = next((c for c in reversed(candidates) if (c.source or "").startswith("doc:")), incoming)
    profile.facts[field] = stored
    return [field] if disagree or open_conflict or not _same_fact(previous, stored) else []


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
        changed = apply_user_fact(profile, field, evidence.model_copy(update={"updated_at": now}))
        if evidence.source:
            for linked in LINKED.get(field, ()):
                other = evidence_from_source(profile, linked, evidence.source)
                if other is not None:
                    changed += apply_user_fact(profile, linked, other.model_copy(update={"updated_at": now}))
        return changed
    conflict = _conflict_for(profile, field)
    if conflict is not None:
        user = next((c for c in conflict.candidates if c.provenance == "user_reported"), None)
        if user is not None:
            return apply_user_fact(profile, field, user)
    profile.facts.pop(field, None)
    _drop_conflict(profile, field)
    return [field]


def reject_evidence(profile: Profile, field: str, source: str) -> list[str]:
    """The person said a paper's reading of `field` is wrong: forget that reading."""
    conflict = _conflict_for(profile, field)
    if conflict is not None:
        rest = [c for c in conflict.candidates if c.source != source]
        _drop_conflict(profile, field)
        user = next((c for c in rest if c.provenance == "user_reported"), None)
        if user is not None:
            apply_user_fact(profile, field, user)
        elif len(rest) > 1:
            profile.conflicts.append(Conflict(field=field, candidates=rest))
            profile.facts[field] = rest[-1].model_copy(update={"confirmed": False})
        elif rest:
            profile.facts[field] = rest[0].model_copy(update={"confirmed": False})
        else:
            profile.facts.pop(field, None)
        return [field]
    fact = profile.facts.get(field)
    if fact is not None and fact.source == source and not fact.confirmed:
        profile.facts.pop(field)
        return [field]
    return []


def apply_review(
    profile: Profile, decision: ReviewDecision, documents: list[DocumentExtraction], now: datetime
) -> list[str]:
    """One review card: ticked rows are confirmed, edited rows become the person's
    answer, and rows left unticked are dropped. Values were validated by the API.

    `document_id` "bank:<persona>" is the simulated bank profile's card: its rows
    are every bank reading still waiting for the person."""
    if decision.document_id.startswith(BANK_SOURCE_PREFIX):
        source = decision.document_id
        fields = bank_review_fields(profile, source)
    else:
        document = next((d for d in documents if d.document_id == decision.document_id), None)
        if document is None:
            return []
        source = f"doc:{document.document_id}"
        fields = list(document.extracted_facts)
    changed: list[str] = []
    for field in fields:
        evidence = evidence_from_source(profile, field, source)
        if evidence is None:
            continue
        if field in decision.edits:
            changed += apply_user_fact(profile, field, Fact(
                value=decision.edits[field], provenance="user_reported", updated_at=now,
                period=evidence.period, source="chat",
            ))
        elif field in decision.accept:
            changed += apply_user_fact(profile, field, evidence.model_copy(update={"updated_at": now}))
        else:
            changed += reject_evidence(profile, field, source)
    return changed


INCOME_KINDS = ("income", "member_income")


def household_income(extraction: DocumentExtraction, documents: list[DocumentExtraction]) -> tuple[Fact, set[str]]:
    """The household's monthly income from its papers: the newest wage or own-income
    paper plus every other member's income paper (a benefit letter).

    Returns the summed fact (sourced to `extraction`) and the sources it includes,
    whose own readings it replaces. Two wage papers are never added: the newer one
    stands and the other is compared as usual.
    """
    own = extraction.extracted_facts["monthly_income"]
    others = [d for d in documents if d.document_id != extraction.document_id and "monthly_income" in d.extracted_facts]
    # The same paper read again (same file) replaces its earlier reading; it is never added twice.
    latest: dict[str, DocumentExtraction] = {}
    for d in others:
        if d.kind == "member_income" and not (extraction.kind == "member_income" and d.filename == extraction.filename):
            latest[d.filename] = d
    included = list(latest.values())
    if extraction.kind == "member_income":
        wages = [d for d in others if d.kind == "income"]
        included += wages[-1:]
    if not included:
        return own, set()
    total = own.value + sum(d.extracted_facts["monthly_income"].value for d in included)
    return own.model_copy(update={"value": round(total, 2)}), {f"doc:{d.document_id}" for d in included}


def _supersede(profile: Profile, field: str, sources: set[str]) -> list[str]:
    """Drop unconfirmed readings from `sources`: a summed figure now includes them."""
    if not sources:
        return []
    changed = False
    conflict = _conflict_for(profile, field)
    if conflict is not None:
        rest = [c for c in conflict.candidates if c.source not in sources]
        if len(rest) != len(conflict.candidates):
            changed = True
            _drop_conflict(profile, field)
            if len(rest) > 1:
                profile.conflicts.append(Conflict(field=field, candidates=rest))
            elif rest:
                only = rest[0]
                profile.facts[field] = only.model_copy(update={"confirmed": only.provenance == "user_reported"})
    fact = profile.facts.get(field)
    if fact is not None and fact.source in sources and not fact.confirmed:
        profile.facts.pop(field)
        changed = True
    return [field] if changed else []


def forget_bank_evidence(profile: Profile) -> list[str]:
    """The person disconnected the simulated bank: drop everything read from it.

    An unconfirmed bank figure is removed. A figure the person confirmed is their
    own answer now (provenance "user_reported") and stays. A conflict loses its
    bank side. If two or more readings are left it stays open; if one is left it
    closes: the person's own answer is confirmed again, a paper's reading stays
    as unconfirmed evidence (still waiting on its review card).
    """
    changed: list[str] = []
    for name, fact in list(profile.facts.items()):
        if fact.provenance == "nessie_sandbox" and not fact.confirmed:
            del profile.facts[name]
            changed.append(name)
    for conflict in list(profile.conflicts):
        if not any(c.provenance == "nessie_sandbox" for c in conflict.candidates):
            continue
        field = conflict.field
        remaining = [c for c in conflict.candidates if c.provenance != "nessie_sandbox"]
        if len(remaining) > 1:
            conflict.candidates = remaining
            if field not in profile.facts:
                user = next((c for c in remaining if c.provenance == "user_reported"), None)
                profile.facts[field] = (user or remaining[-1]).model_copy(update={"confirmed": False})
        else:
            _drop_conflict(profile, field)
            if remaining:
                only = remaining[0]
                profile.facts[field] = only.model_copy(
                    update={"confirmed": only.provenance == "user_reported"})
        if field not in changed:
            changed.append(field)
    return changed


# --------------------------------------------------------------------------
# Graph node
# --------------------------------------------------------------------------


def _needs(profile: Profile) -> list[str]:
    fact = profile.facts.get("needs")
    return list(fact.value) if fact is not None and isinstance(fact.value, list) else []


def make_user_intelligence(nessie: NessieService | None = None, inbox: Any = None):
    """`nessie` supplies simulated bank summaries (None: seeded personas only).
    Papers arrive from the Document Agent via `document_queue`; `inbox` is unused
    and kept so older callers still work."""
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
            changed += apply_evidence_facts(profile, bank_facts(result.summary, _needs(profile), now))
            if result.notice:
                code, message = result.notice
                update["errors"] = list(state.get("errors") or []) + [
                    SafeError(code=code, message=message, agent="user_intelligence", at=now)
                ]

        if evidence is not None and evidence.kind == "nessie_disconnect":
            update["consents"] = {**(state.get("consents") or {}), "nessie": False}
            update["financial_summary"] = None
            changed += forget_bank_evidence(profile)

        documents = list(state.get("documents") or [])
        queue = state.get("document_queue") or []
        if queue:
            update["consents"] = {**(update.get("consents") or state.get("consents") or {}), "document": True}
            by_id = {d.document_id: d for d in documents}
            for document_id in queue:
                extraction = by_id.get(document_id)
                if extraction is not None:
                    # Facts only: the document's text never reaches state.
                    facts = dict(extraction.extracted_facts)
                    if extraction.kind in INCOME_KINDS and "monthly_income" in facts:
                        facts["monthly_income"], included = household_income(extraction, documents)
                        changed += _supersede(profile, "monthly_income", included)
                    changed += apply_evidence_facts(profile, facts)

        for decision in state.get("review_decisions") or []:
            changed += apply_review(profile, decision, documents, now)

        return {
            **update,
            "profile": profile,
            "changed_fields": _unique(changed),
            "user_answer": None,
            "pending_evidence": None,
            "document_queue": [],
            "review_decisions": [],
        }

    return user_intelligence


# Default node: seeded personas only (tests, and when no service is wired).
user_intelligence = make_user_intelligence()
