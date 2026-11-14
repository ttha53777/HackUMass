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
    "AnsweredItem",
    "AssessmentView",
    "CheckView",
    "LastChange",
    "OpenQuestionView",
    "ErrorBody",
    "ErrorDetail",
    "FinancialSummaryView",
    "HealthOut",
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


class NessieEvidenceIn(BaseModel):
    persona_id: str
    consent: Literal[True]


class PersonaOut(BaseModel):
    id: str
    label: str
    description: str
