"""Builds the client-facing snapshot from graph state.

Only fields named here reach the browser. Internal state (hashes, budgets,
dirty flags, raw answers) is never dumped.
"""

from __future__ import annotations

from typing import Any, Callable

from app.agents.eligibility import inputs_hash
from app.api.bank import bank_suggestions
from app.api.schemas import (
    AnsweredItem,
    AssessmentView,
    CheckView,
    FinancialSummaryView,
    LastChange,
    Notice,
    OpenQuestionView,
    PendingReview,
    ProfileSummaryItem,
    ReviewRow,
    TraceEventView,
    ProgramCard,
    RegionView,
    SessionSnapshot,
)
from app.graph.answers import display_value
from app.graph.questions import (
    BANK_SOURCE_PREFIX,
    bank_card_shown,
    bank_review_fields,
    evidence_from_source,
    get_spec,
    income_is_summed,
    open_questions,
    paper_title,
    priority_question_ids,
    question_for_field,
    spec_for_field,
)
from app.graph.state import (
    DirtyFlags,
    DocumentExtraction,
    EligibilityAssessment,
    FinancialSummary,
    IntakeState,
    Profile,
    Program,
)
from app.services.session_store import SessionMeta
from app.services.wording import apply_wording

UNSUPPORTED_MESSAGE = (
    "We don't have verified programs for that ZIP code yet. "
    "This demo only covers a limited area. You can change your ZIP code."
)
NO_MATCH_MESSAGE = "We didn't find programs in our list for those needs in your area."
FIXTURE_MESSAGE = (
    "Development mode: these programs are fictional test data, not real services."
)


def _shown_with_note(spec, profile: Profile) -> str:
    """The answer as shown, with any "Other" note and the options it was matched to."""
    target = spec.question.target_field
    shown = display_value(spec, profile.facts[target])
    note = profile.facts.get(f"{target}_note")
    if note is not None and str(note.value).strip():
        shown = shown.replace("Other", f"Other: “{note.value}”", 1)
    matched = profile.facts.get(f"{target}_matched")
    if matched is not None and matched.value:
        labels = {option.id: option.label for option in spec.question.options}
        names = ", ".join(labels.get(i, i) for i in matched.value)
        shown += f" (we also matched this to {names})"
    return shown


TRACE_SHOWN = 60

NOTE_TEXT = {
    "ssn_line_dropped": "A line that looked like a Social Security number was skipped. We never read those.",
    "household_count_mismatch": "The household size didn't match the people listed, so we left it out.",
    "kind_not_read": "We keep this paper for you, but don't read details from this kind yet.",
    "income_adds_to_household": "This is added to the income on your other papers, so the amount is your household's total.",
    "model_read": "Some of this was read by AI from a hard-to-read layout. Check it carefully.",
    "kind_mismatch": "This paper looks like a different kind than the one picked, so we didn't read it.",
}


def _notes(document: DocumentExtraction, carries_summed_income: bool) -> list[str]:
    """The paper's own notes, plus "added up" on whichever card carries the summed income."""
    notes = list(document.notes)
    if carries_summed_income and "income_adds_to_household" not in notes:
        notes.append("income_adds_to_household")
    return notes


def _review_rows(profile: Profile, fields, source: str) -> list[ReviewRow]:
    """The readings from `source` still waiting for the person, one row each."""
    disputed = {c.field for c in profile.conflicts}
    rows: list[ReviewRow] = []
    for field in fields:
        fact = evidence_from_source(profile, field, source)
        if fact is None:
            continue
        spec = spec_for_field(field)
        display = display_value(spec, fact) if spec is not None else str(fact.value)
        rows.append(ReviewRow(
            field=field,
            label=spec.label if spec is not None else field.replace("_", " ").capitalize(),
            value=fact.value,
            display=display,
            in_conflict=field in disputed,
        ))
    return rows


BANK_NOTE = (
    "Simulated demo data from a bank sandbox, not a real account. "
    "Bills can show you're behind, never that a shut-off notice was sent."
)


def bank_review(summary: FinancialSummary | None, profile: Profile) -> list[PendingReview]:
    """One card for everything the simulated bank profile suggests, once it says more
    than the income alone (income on its own is confirmed with a single question)."""
    if summary is None:
        return []
    source = f"{BANK_SOURCE_PREFIX}{summary.persona_id}"
    if not bank_card_shown(profile, source):
        return []
    return [PendingReview(
        document_id=source,
        kind="bank",
        title="the simulated bank profile",
        rows=_review_rows(profile, bank_review_fields(profile, source), source),
        notes=[BANK_NOTE],
        simulated=True,
    )]


def pending_reviews(documents: list[DocumentExtraction], profile: Profile) -> list[PendingReview]:
    """One card per paper that still has readings waiting for the person."""
    summed = income_is_summed(documents)
    reviews: list[PendingReview] = []
    for document in documents:
        rows = _review_rows(profile, document.extracted_facts, f"doc:{document.document_id}")
        if rows:
            reviews.append(PendingReview(
                document_id=document.document_id,
                kind=document.kind,
                title=paper_title(document.kind),
                rows=rows,
                notes=[NOTE_TEXT[n] for n in _notes(document, summed and any(r.field == "monthly_income" for r in rows))
                       if n in NOTE_TEXT],
            ))
    return reviews


def check_views(
    assessment: EligibilityAssessment, profile: Profile, programs: list[Program]
) -> list[CheckView]:
    """Eligibility's "why" lines, with each missing field turned into the question that settles it."""
    views: list[CheckView] = []
    for line in assessment.checks:
        question = (
            question_for_field(line.missing_field, profile, programs) if line.missing_field else None
        )
        kind = line.kind if line.kind != "ask" or question else "unsure"
        views.append(
            CheckView(
                kind=kind,
                text=line.text,
                evidence=line.evidence,
                question_id=question.id if question and kind == "ask" else None,
            )
        )
    return views


def build_snapshot(
    session_id: str,
    values: dict[str, Any],
    meta: SessionMeta,
    *,
    fixture_data: bool,
    region_for: Callable[[str], dict[str, str] | None] = lambda _zip: None,
    automation_modes: dict[str, str] | None = None,
) -> SessionSnapshot:
    # Plain-language rewrites (live mode), only where one exists for the exact text in state.
    values = apply_wording(values, meta.wording)
    intake: IntakeState = values.get("intake") or IntakeState()
    profile: Profile = values.get("profile") or Profile()
    dirty: DirtyFlags = values.get("dirty") or DirtyFlags()
    programs = values.get("programs") or []
    assessments = values.get("eligibility_assessments") or {}
    coverage = values.get("coverage") or "unknown"

    answered: list[AnsweredItem] = []
    for question_id in intake.asked_question_ids:
        spec = get_spec(question_id)
        if spec is None:
            continue
        target = spec.question.target_field
        if target in profile.facts:
            shown, skipped = _shown_with_note(spec, profile), False
        elif target in intake.skipped_fields:
            shown, skipped = "Skipped", True
        else:
            continue  # asked but not answered yet: it is the pending question
        answered.append(
            AnsweredItem(
                question_id=question_id,
                prompt=spec.question.prompt,
                display_value=shown,
                skipped=skipped,
                question=spec.question,
            )
        )

    profile_summary = [
        ProfileSummaryItem(
            field=name,
            label=spec.label,
            display_value=display_value(spec, fact),
            provenance=fact.provenance,
        )
        for name, fact in profile.facts.items()
        if (spec := spec_for_field(name)) is not None
    ]

    cards: list[ProgramCard] = []
    for program in programs:
        assessment = assessments.get(program.id)
        cards.append(
            ProgramCard(
                program=program,
                assessment=AssessmentView(
                    **assessment.model_dump(exclude={"program_id", "inputs_hash", "checks"}),
                    checks=check_views(assessment, profile, programs),
                )
                if assessment
                else None,
                # Second guard (plan B.3): an assessment computed from different
                # answers than the current ones is never shown as current.
                stale=dirty.discovery
                or program.id in dirty.eligibility_ids
                or (assessment is not None and assessment.inputs_hash != inputs_hash(program, profile)),
            )
        )

    notices: list[Notice] = []
    if coverage == "unsupported":
        notices.append(Notice(code="unsupported_region", message=UNSUPPORTED_MESSAGE))
    elif coverage == "supported" and not programs:
        notices.append(Notice(code="no_matches", message=NO_MATCH_MESSAGE))
    if fixture_data and programs:
        notices.append(Notice(code="fixture_data", message=FIXTURE_MESSAGE))
    seen = {notice.code for notice in notices}
    for code, message in [(e.code, e.message) for e in values.get("errors") or []] + meta.run_notices:
        if code not in seen:
            seen.add(code)
            notices.append(Notice(code=code, message=message))

    region = None
    zip_fact = profile.facts.get("zip")
    if coverage == "supported" and zip_fact is not None:
        found = region_for(str(zip_fact.value))
        if found:
            region = RegionView(zip=str(zip_fact.value), **{k: found[k] for k in ("city", "county", "state")})

    field_labels = {
        name: spec.label
        for card in cards
        if card.assessment
        for name in card.assessment.missing_fields
        if (spec := spec_for_field(name)) is not None
    }

    summary = values.get("financial_summary")
    open_items = open_questions(profile, intake, programs, assessments, priority_question_ids(summary))
    return SessionSnapshot(
        session_id=session_id,
        phase=values.get("workflow_phase") or "intake",
        busy=meta.busy,
        wording_pending=meta.wording_pending,
        pending_question=values.get("pending_question"),
        open_questions=[OpenQuestionView(question=item.question, affects=item.affects) for item in open_items],
        last_change=LastChange(**meta.last_change) if meta.last_change else None,
        answered=answered,
        profile_summary=profile_summary,
        coverage=coverage,
        region=region,
        programs=cards,
        action_plan=values.get("action_plan") or [],
        plan_stale=dirty.discovery
        or bool(dirty.eligibility_ids)
        or dirty.plan
        or any(card.stale for card in cards),
        agent_statuses=values.get("agent_statuses") or {},
        financial_summary=FinancialSummaryView(**summary.model_dump(exclude={"total_deposits", "balance_snapshot"}))
        if summary
        else None,
        bank_suggestions=bank_suggestions(summary, [item.question for item in open_items]),
        notices=notices,
        field_labels=field_labels,
        applications=values.get("applications") or {},
        # Only programs that are on this person's list.
        automatable_program_ids=[p.id for p in programs if p.id in (automation_modes or {})],
        automation_modes={p.id: (automation_modes or {})[p.id] for p in programs if p.id in (automation_modes or {})},
        pending_reviews=bank_review(summary, profile) + pending_reviews(values.get("documents") or [], profile),
        trace=[TraceEventView(**event.model_dump()) for event in (values.get("trace") or [])[-TRACE_SHOWN:]],
    )
