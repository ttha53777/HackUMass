"""Builds the client-facing snapshot from graph state.

Only fields named here reach the browser. Internal state (hashes, budgets,
dirty flags, raw answers) is never dumped.
"""

from __future__ import annotations

from typing import Any, Callable

from app.agents.eligibility import inputs_hash
from app.api.schemas import (
    AnsweredItem,
    AssessmentView,
    FinancialSummaryView,
    Notice,
    ProfileSummaryItem,
    ProgramCard,
    RegionView,
    SessionSnapshot,
)
from app.graph.answers import display_value
from app.graph.questions import get_spec, spec_for_field
from app.graph.state import DirtyFlags, IntakeState, Profile
from app.services.session_store import SessionMeta

UNSUPPORTED_MESSAGE = (
    "We don't have verified programs for that ZIP code yet. "
    "This demo only covers a limited area. You can change your ZIP code."
)
NO_MATCH_MESSAGE = "We didn't find programs in our list for those needs in your area."
FIXTURE_MESSAGE = (
    "Development mode: these programs are fictional test data, not real services."
)


def build_snapshot(
    session_id: str,
    values: dict[str, Any],
    meta: SessionMeta,
    *,
    fixture_data: bool,
    region_for: Callable[[str], dict[str, str] | None] = lambda _zip: None,
) -> SessionSnapshot:
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
            shown, skipped = display_value(spec, profile.facts[target]), False
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
                assessment=AssessmentView(**assessment.model_dump(exclude={"program_id", "inputs_hash"}))
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
    return SessionSnapshot(
        session_id=session_id,
        phase=values.get("workflow_phase") or "intake",
        busy=meta.busy,
        pending_question=values.get("pending_question"),
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
        notices=notices,
        field_labels=field_labels,
    )
