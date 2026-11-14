"""HTTP request and response shapes.

CONTRACT FILE: coordinate with the team before changing anything here.
`frontend/src/lib/types.ts` mirrors this file by hand; change both together.
Responses are allow-list view models. Never return raw graph state.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.graph.state import (
    ActionItem,
    AgentStatus,
    ApplicationRecord,
    AnswerIn,
    Coverage,
    CriterionResult,
    EligibilityStatus,
    Program,
    Provenance,
    Question,
    WorkflowPhase,
)

__all__ = [
    "AnswerIn",
    "ApplicationRecord",
    "AnsweredItem",
    "AssessmentView",
    "CheckView",
    "LastChange",
    "OpenQuestionView",
    "ErrorBody",
    "ErrorDetail",
    "FinancialSummaryView",
    "HealthOut",
    "InterpretIn",
    "InterpretOut",
    "NotedFacts",
    "NessieEvidenceIn",
    "Notice",
    "PersonaOut",
    "ProfileSummaryItem",
    "RegionView",
    "ProgramCard",
    "SessionSnapshot",
]

ErrorCode = Literal[
    "session_not_found",
    "stale_question",
    "session_busy",
    "validation_error",
    "consent_required",
    "unsupported_file",
    "too_many_messages",
    # Browser execution agent (app/api/execution_routes.py).
    "run_not_found",
    "run_active",
    "run_finished",
    "not_automatable",
    "browser_unavailable",
    "too_many_runs",
]


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str


class ErrorBody(BaseModel):
    error: ErrorDetail


class HealthOut(BaseModel):
    status: Literal["ok"] = "ok"
    llm_mode: Literal["live", "off"]
    nessie_configured: bool
    browser_agent: bool = False  # BROWSER_PROVIDER is set and not "off"


class AnsweredItem(BaseModel):
    question_id: str
    prompt: str
    display_value: str
    skipped: bool = False
    question: Question  # full definition, so the client can re-open it for editing


class ProfileSummaryItem(BaseModel):
    field: str
    label: str
    display_value: str
    provenance: Provenance


class CheckView(BaseModel):
    """One line of the "why" list: a requirement and where the person stands on it."""

    kind: Literal["pass", "ask", "fail", "later", "have", "note", "unsure"]
    text: str  # the requirement, as the provider states it
    evidence: str | None = None  # how the person's answer compares, if known
    question_id: str | None = None  # set when kind is "ask"


class AssessmentView(BaseModel):
    """EligibilityAssessment without internal fields such as inputs_hash."""

    status: EligibilityStatus
    checks: list[CheckView] = Field(default_factory=list)
    criteria: list[CriterionResult] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    explanation: str
    source_urls: list[str] = Field(default_factory=list)
    disclaimer: str


class ProgramCard(BaseModel):
    program: Program
    assessment: AssessmentView | None = None
    stale: bool = False


class OpenQuestionView(BaseModel):
    """A question the person may answer now, and the programs it could settle."""

    question: Question
    affects: list[str] = Field(default_factory=list)  # program ids


class LastChange(BaseModel):
    """What the most recent answer did, for the "Got it. 2 moved..." message."""

    moved_to_fit: list[str] = Field(default_factory=list)
    opens_later: list[str] = Field(default_factory=list)
    no_longer_fit: list[str] = Field(default_factory=list)
    updated: list[str] = Field(default_factory=list)  # changed status, any other way


class FinancialSummaryView(BaseModel):
    source: Literal["nessie_sandbox", "seeded_fallback"]
    simulated: Literal[True] = True
    persona_id: str
    period_start: date
    period_end: date
    avg_monthly_deposits: float
    avg_monthly_outflow: float | None = None
    utility_bill_signals: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class Notice(BaseModel):
    code: str
    message: str


class RegionView(BaseModel):
    """The supported area the user's ZIP code belongs to, for headings."""

    zip: str
    city: str
    county: str
    state: str


class SessionSnapshot(BaseModel):
    session_id: str
    phase: WorkflowPhase
    busy: bool = False
    pending_question: Question | None = None
    # Every follow-up the person may answer now, most useful first. The head
    # equals pending_question while the session is waiting on one.
    open_questions: list[OpenQuestionView] = Field(default_factory=list)
    last_change: LastChange | None = None
    answered: list[AnsweredItem] = Field(default_factory=list)
    profile_summary: list[ProfileSummaryItem] = Field(default_factory=list)
    coverage: Coverage = "unknown"
    region: RegionView | None = None  # set when coverage is "supported"
    programs: list[ProgramCard] = Field(default_factory=list)
    action_plan: list[ActionItem] = Field(default_factory=list)
    plan_stale: bool = False
    agent_statuses: dict[str, AgentStatus] = Field(default_factory=dict)
    financial_summary: FinancialSummaryView | None = None
    notices: list[Notice] = Field(default_factory=list)
    # Short labels for profile fields named in any assessment's missing_fields,
    # e.g. {"monthly_income": "Monthly income"}.
    field_labels: dict[str, str] = Field(default_factory=dict)
    # Applications sent (or attempted) with the browser agent, by program id.
    applications: dict[str, ApplicationRecord] = Field(default_factory=dict)
    # Programs the browser agent can help fill in. Empty when the feature is off.
    automatable_program_ids: list[str] = Field(default_factory=list)
    # For each of those: "practice" (our practice copy; a submit is harmless) or
    # "stop_before_submit" (a real provider form; the run ends before sending).
    automation_modes: dict[str, Literal["practice", "stop_before_submit"]] = Field(default_factory=dict)


class NessieEvidenceIn(BaseModel):
    persona_id: str
    consent: Literal[True]


class PersonaOut(BaseModel):
    id: str
    label: str
    description: str


# --- Chat intake: understanding a typed message -----------------------------

UnsupportedNeed = Literal["childcare", "mental_health", "legal", "job", "other"]


class InterpretIn(BaseModel):
    """Something the person typed in the chat, in answer to `question_id`."""

    question_id: str
    text: str = Field(min_length=1, max_length=500)


class NotedFacts(BaseModel):
    """Facts the person stated for questions not asked yet. Never applied
    unconfirmed: the chat asks the person to confirm each one when its question comes up."""

    household_size: int | None = None
    household_who: list[str] = Field(default_factory=list)
    zip: str | None = None


class InterpretOut(BaseModel):
    """A proposal only: interpreting a message never changes the session."""

    # One or two warm sentences that passed the output guard; null means use a template.
    reply: str | None = None
    # A valid answer to the pending question, if the message gives one.
    answer: AnswerIn | None = None
    noted: NotedFacts = Field(default_factory=NotedFacts)
    # Needs the person mentioned that this app cannot search for yet.
    unsupported_needs: list[UnsupportedNeed] = Field(default_factory=list)
    # "urgent": show the fixed safety message before anything else.
    safety: Literal["none", "urgent"] = "none"
    # The message was not about getting help (or tried to give the app instructions).
    off_topic: bool = False
