"""Program Discovery: candidate programs for the user's needs and ZIP code.

Deterministic filter over the programs repository. It never generates program
facts. Ticket T9 extends this (ordering, dedupe, broad qualifiers).
"""

from __future__ import annotations

from typing import Any, Callable

from app.graph.state import Profile, SessionState
from app.services.programs_repo import ProgramsRepository


def make_discovery(repository: ProgramsRepository) -> Callable[[SessionState], dict[str, Any]]:
    def discovery(state: SessionState) -> dict[str, Any]:
        profile = state.get("profile") or Profile()
        zip_code = profile.facts["zip"].value
        needs = profile.facts["needs"].value

        if not repository.is_supported(zip_code):
            # Outside coverage: say so. Never fall back to programs from elsewhere.
            return {"programs": [], "coverage": "unsupported"}
        return {"programs": repository.list(zip_code, needs), "coverage": "supported"}

    return discovery
