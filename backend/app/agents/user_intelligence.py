"""User Intelligence: turns an answer into typed profile facts.

Minimal version for the first slice. Ticket T7 adds conflict detection,
free-text interpretation, Nessie and document evidence.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.graph.answers import normalize_answer
from app.graph.questions import OTHER_OPTION_ID, get_spec
from app.graph.state import Fact, Profile, SessionState


def user_intelligence(state: SessionState) -> dict[str, Any]:
    profile = (state.get("profile") or Profile()).model_copy(deep=True)
    answer = state.get("user_answer")
    changed: list[str] = []

    spec = get_spec(answer.question_id) if answer else None
    if answer is not None and spec is not None:
        target = spec.question.target_field
        note_field = f"{target}_note"
        now = datetime.now(timezone.utc)

        if answer.skipped:
            # Skipping a previously answered question withdraws the answer.
            if profile.facts.pop(target, None) is not None:
                changed.append(target)
            profile.facts.pop(note_field, None)
        else:
            value = normalize_answer(spec, answer)
            previous = profile.facts.get(target)
            if previous is None or previous.value != value:
                changed.append(target)
            profile.facts[target] = Fact(
                value=value,
                provenance="user_reported",
                updated_at=now,
                period="month" if spec.question.type == "currency" else None,
            )
            # Free text given with "Other" is kept verbatim as a note; T7 interprets it.
            note = (answer.text or "").strip()
            if note and OTHER_OPTION_ID in answer.selected_option_ids:
                profile.facts[note_field] = Fact(
                    value=note, provenance="user_reported", updated_at=now
                )
            else:
                profile.facts.pop(note_field, None)

    return {
        "profile": profile,
        "changed_fields": changed,
        "user_answer": None,
        "pending_evidence": None,
    }
