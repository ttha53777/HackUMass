"""Action Planning — STUB until ticket T11.

Lists one step per assessed program in discovery order. Real ranking, urgency
and document checklists come with T11. Links are always copied from the
program record.
"""

from __future__ import annotations

from typing import Any

from app.graph.state import ActionItem, SessionState


def action_planning(state: SessionState) -> dict[str, Any]:
    assessments = state.get("eligibility_assessments") or {}
    items: list[ActionItem] = []

    for program in state.get("programs") or []:
        assessment = assessments.get(program.id)
        if assessment is None or assessment.status == "likely_ineligible":
            continue
        if assessment.status == "insufficient_information":
            action_type = "get_more_information"
            next_step = "Answer the remaining questions, or contact the provider."
        else:
            action_type = "confirm_eligibility"
            next_step = "Review the requirements on the provider's page, then apply or call."
        items.append(
            ActionItem(
                rank=len(items) + 1,
                program_id=program.id,
                action_type=action_type,
                rationale=f"{program.name} serves your area and matches what you asked for.",
                next_step=next_step,
                documents=program.documents_needed,
                link=program.apply_url or program.info_url,
                uncertainty=assessment.explanation,
            )
        )
    return {"action_plan": items}
