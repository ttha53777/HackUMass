"""Agent Administrator: deterministic routing (ticket T3).

`decide(state)` is a pure function. It never calls a model and never does
specialist work; it only looks at state and chooses exactly one of:

  1. user_intelligence   an answer or evidence request is waiting
  2. program_discovery   needs or location changed and both are known
  3. ask a core question (ends the run; phase "intake")
  4. eligibility         some assessments are out of date
  5. action_planning     the plan is out of date
  6. ask a confirmation, follow-up or evidence offer
                         (ends the run; phase "awaiting_user")
  7. complete            (ends the run)

Every dispatch either consumes an input or clears a dirty flag, and each
specialist may run at most MAX_RUNS_PER_SPECIALIST times per graph run, so a
run always terminates.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from langgraph.graph import END
from langgraph.types import Command

from app.graph.questions import (
    get_spec,
    next_awaiting_question,
    next_core_question,
    referenced_fields,
)
from app.graph.state import (
    AgentStatus,
    DirtyFlags,
    IntakeState,
    Profile,
    Question,
    SafeError,
    SessionState,
)

MAX_RUNS_PER_SPECIALIST = 2

USER_INTELLIGENCE = "user_intelligence"
DISCOVERY = "program_discovery"
ELIGIBILITY = "eligibility"
PLANNING = "action_planning"
SPECIALISTS = (USER_INTELLIGENCE, DISCOVERY, ELIGIBILITY, PLANNING)

# Fields whose change means the set of candidate programs may be different.
DISCOVERY_FIELDS = {"needs", "zip", "needs_matched"}
# Both must be known before Discovery can run.
REQUIRED_FOR_DISCOVERY = {"needs", "zip"}


@dataclass
class Decision:
    goto: str  # a specialist name, or END
    update: dict[str, Any] = field(default_factory=dict)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _absorb_return(state: SessionState, dirty: DirtyFlags, update: dict[str, Any]) -> None:
    """Apply the consequences of the specialist that just finished."""
    finished = state.get("dispatched")
    programs = state.get("programs") or []

    if finished == USER_INTELLIGENCE:
        changed = set(state.get("changed_fields") or [])
        if changed & DISCOVERY_FIELDS:
            dirty.discovery = True
        for program in programs:
            if referenced_fields(program) & changed and program.id not in dirty.eligibility_ids:
                dirty.eligibility_ids.append(program.id)
        update["changed_fields"] = []

    elif finished == DISCOVERY:
        dirty.discovery = False
        current_ids = [program.id for program in programs]
        # Results for programs that are no longer candidates must not linger.
        update["eligibility_assessments"] = {
            program_id: assessment
            for program_id, assessment in (state.get("eligibility_assessments") or {}).items()
            if program_id in current_ids
        }
        update["action_plan"] = [
            item for item in (state.get("action_plan") or []) if item.program_id in current_ids
        ]
        dirty.eligibility_ids = current_ids
        dirty.plan = True

    elif finished == ELIGIBILITY:
        dirty.eligibility_ids = []
        dirty.plan = True

    elif finished == PLANNING:
        dirty.plan = False

    if finished is not None:
        update["dispatched"] = None


def decide(state: SessionState) -> Decision:
    update: dict[str, Any] = {}
    dirty = (state.get("dirty") or DirtyFlags()).model_copy(deep=True)
    intake = (state.get("intake") or IntakeState()).model_copy(deep=True)
    profile = state.get("profile") or Profile()
    counts = dict(state.get("run_counts") or {})
    errors = list(state.get("errors") or [])

    _absorb_return(state, dirty, update)
    programs = state.get("programs") or []
    assessments = update.get(
        "eligibility_assessments", state.get("eligibility_assessments") or {}
    )

    def dispatch(name: str, phase: str | None) -> Decision | None:
        """Route to a specialist, or return None if its budget is spent."""
        if counts.get(name, 0) >= MAX_RUNS_PER_SPECIALIST:
            errors.append(
                SafeError(
                    code="run_budget_exceeded",
                    message="We couldn't finish updating your results. Please try again.",
                    agent=name,  # type: ignore[arg-type]
                    at=_now(),
                )
            )
            update["errors"] = errors
            return None
        counts[name] = counts.get(name, 0) + 1
        update.update(
            dispatched=name,
            run_counts=counts,
            dirty=dirty,
            intake=intake,
            pending_question=None,
            agent_statuses={name: AgentStatus(status="running", updated_at=_now())},
        )
        if phase:
            update["workflow_phase"] = phase
        return Decision(goto=name, update=update)

    def finish(phase: Literal["intake", "awaiting_user", "complete"], question: Question | None):
        if question and question.id not in intake.asked_question_ids:
            intake.asked_question_ids.append(question.id)
            if question.origin in ("conflict", "evidence_offer"):
                pass  # limited only by the session total
            elif phase == "awaiting_user":
                intake.followup_asked_count += 1
            else:
                intake.core_asked_count += 1
        update.update(
            dirty=dirty, intake=intake, pending_question=question, workflow_phase=phase
        )
        return Decision(goto=END, update=update)

    # 1. An answer or evidence request is waiting.
    answer = state.get("user_answer")
    if answer is not None or state.get("pending_evidence") is not None:
        if answer is not None:
            spec = get_spec(answer.question_id)
            if spec is not None:
                target = spec.question.target_field
                if answer.question_id not in intake.answered_question_ids:
                    intake.answered_question_ids.append(answer.question_id)
                if answer.skipped:
                    if target not in intake.skipped_fields:
                        intake.skipped_fields.append(target)
                elif target in intake.skipped_fields:
                    intake.skipped_fields.remove(target)
        decision = dispatch(USER_INTELLIGENCE, None)
        if decision:
            return decision
        # Budget spent: drop the input so the run can still end.
        update.update(user_answer=None, pending_evidence=None)

    # 2. Candidate programs are out of date and we know enough to look.
    if dirty.discovery and REQUIRED_FOR_DISCOVERY <= set(profile.facts):
        decision = dispatch(DISCOVERY, "discovering")
        if decision:
            return decision
        dirty.discovery = False

    # 3. A core intake question is still worth asking.
    question = next_core_question(profile, intake, programs)
    if question is not None:
        return finish("intake", question)

    # 4. Assessments are out of date.
    if dirty.eligibility_ids:
        decision = dispatch(ELIGIBILITY, "evaluating")
        if decision:
            return decision
        dirty.eligibility_ids = []

    # 5. The plan is out of date.
    if dirty.plan:
        decision = dispatch(PLANNING, "planning")
        if decision:
            return decision
        dirty.plan = False

    # 6. Confirm evidence, ask one targeted follow-up, or offer the simulated
    #    bank profile, in that order.
    question = next_awaiting_question(
        profile, intake, programs, assessments,
        has_summary=state.get("financial_summary") is not None,
    )
    if question is not None:
        return finish("awaiting_user", question)

    # 7. Nothing left to do.
    return finish("complete", None)


def administrator(state: SessionState) -> Command:
    decision = decide(state)
    return Command(goto=decision.goto, update=decision.update)
