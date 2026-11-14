"""Eligibility — STUB until ticket T10.

The stub does NOT evaluate any rule. It only reports which profile fields a
program's requirements need and whether we have them, so the follow-up loop and
selective recomputation can be built and tested. It never returns
`likely_eligible` or `likely_ineligible`.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.graph.questions import referenced_fields
from app.graph.state import (
    CriterionResult,
    DirtyFlags,
    EligibilityAssessment,
    Profile,
    Program,
    SessionState,
)


def _inputs_hash(program: Program, profile: Profile) -> str:
    used = {
        name: profile.facts[name].value
        for name in sorted(referenced_fields(program))
        if name in profile.facts
    }
    return hashlib.sha256(json.dumps(used, sort_keys=True, default=str).encode()).hexdigest()[:16]


def assess(program: Program, profile: Profile) -> EligibilityAssessment:
    missing = sorted(name for name in referenced_fields(program) if name not in profile.facts)
    if missing:
        status = "insufficient_information"
        explanation = "We need a little more information before we can check this program."
    else:
        status = "possibly_eligible"
        explanation = (
            "We have the information this program asks about, but its rules have not been "
            "checked yet. Confirm with the provider."
        )
    return EligibilityAssessment(
        program_id=program.id,
        status=status,
        criteria=[
            CriterionResult(requirement_id=requirement.id, result="unknown")
            for requirement in program.requirements
        ],
        missing_fields=missing,
        explanation=explanation,
        source_urls=sorted({requirement.source_url for requirement in program.requirements})
        or [program.info_url],
        inputs_hash=_inputs_hash(program, profile),
    )


def eligibility(state: SessionState) -> dict[str, Any]:
    profile = state.get("profile") or Profile()
    dirty = state.get("dirty") or DirtyFlags()
    programs = {program.id: program for program in state.get("programs") or []}

    # Recompute only what the Administrator marked out of date.
    assessments = dict(state.get("eligibility_assessments") or {})
    for program_id in dirty.eligibility_ids:
        if program_id in programs:
            assessments[program_id] = assess(programs[program_id], profile)
    return {"eligibility_assessments": assessments}
