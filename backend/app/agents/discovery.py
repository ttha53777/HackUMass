"""Program Discovery (ticket T9): candidate programs for the user's needs and ZIP.

A deterministic filter over the programs repository. It never generates,
edits or fills in program facts: every program it returns is a curated record
exactly as loaded. Outside coverage it says so and returns nothing rather than
falling back to programs from elsewhere.
"""

from __future__ import annotations

from typing import Any, Callable

from app.graph.questions import OTHER_OPTION_ID
from app.graph.state import Profile, SessionState
from app.services.programs_repo import ProgramsRepository


def make_discovery(repository: ProgramsRepository) -> Callable[[SessionState], dict[str, Any]]:
    def discovery(state: SessionState) -> dict[str, Any]:
        facts = (state.get("profile") or Profile()).facts
        zip_fact, needs_fact = facts.get("zip"), facts.get("needs")
        if zip_fact is None or needs_fact is None:
            # The Administrator only dispatches once both are known; be safe anyway.
            return {"programs": [], "coverage": "unknown"}

        zip_code = str(zip_fact.value)
        if not repository.is_supported(zip_code):
            return {"programs": [], "coverage": "unsupported"}

        # "Other" is a note, not a category: it matches nothing on its own.
        needs = [n for n in needs_fact.value or [] if n != OTHER_OPTION_ID]
        return {"programs": repository.list(zip_code, needs), "coverage": "supported"}

    return discovery
