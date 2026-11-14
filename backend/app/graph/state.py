"""Canonical typed state shared by the Administrator and the four specialists.

CONTRACT FILE: coordinate with the team before changing anything here.
Mirrors docs/foundation-plan.md section B.2 and B.3.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal, TypedDict

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Shared literals
# --------------------------------------------------------------------------

Provenance = Literal["user_reported", "document_extracted", "nessie_sandbox", "inferred"]

WorkflowPhase = Literal[
    "intake", "discovering", "evaluating", "awaiting_user", "planning", "complete", "error"
]

AgentName = Literal["user_intelligence", "program_discovery", "eligibility", "action_planning"]

RunStatus = Literal["queued", "running", "completed", "failed", "skipped"]

Coverage = Literal["unknown", "supported", "unsupported"]

QuestionType = Literal["single_select", "multi_select", "text", "number", "currency", "zip"]

QuestionOrigin = Literal["core", "eligibility_followup", "conflict", "evidence_offer"]

EligibilityStatus = Literal[
    "likely_eligible", "possibly_eligible", "likely_ineligible", "insufficient_information"
]

DISCLAIMER = (
    "This is a preliminary, informational assessment. "
    "Only the program's provider can determine eligibility."
)

# --------------------------------------------------------------------------
# Questions and answers
# --------------------------------------------------------------------------


class Option(BaseModel):
    id: str
    label: str


class Question(BaseModel):
    id: str
    prompt: str
    reason: str | None = None
    type: QuestionType
    options: list[Option] = Field(default_factory=list)
    allow_other: bool = False
    skippable: bool = True
    target_field: str
    origin: QuestionOrigin = "core"
    min: float | None = None  # bounds for number / currency inputs
    max: float | None = None


class AnswerIn(BaseModel):
    question_id: str
    selected_option_ids: list[str] = Field(default_factory=list)
    value: float | str | None = None
    period: Literal["week", "month", "year"] | None = None
    text: str | None = Field(default=None, max_length=500)
    skipped: bool = False


class IntakeState(BaseModel):
    asked_question_ids: list[str] = Field(default_factory=list)
    answered_question_ids: list[str] = Field(default_factory=list)
    skipped_fields: list[str] = Field(default_factory=list)
    core_asked_count: int = 0
    followup_asked_count: int = 0


# --------------------------------------------------------------------------
# Profile (owned by User Intelligence)
# --------------------------------------------------------------------------


class Fact(BaseModel):
    value: Any
    provenance: Provenance
    updated_at: datetime
    period: str | None = None
    confirmed: bool = True


class Conflict(BaseModel):
    field: str
    candidates: list[Fact]


class Profile(BaseModel):
    facts: dict[str, Fact] = Field(default_factory=dict)
    conflicts: list[Conflict] = Field(default_factory=list)


class FinancialSummary(BaseModel):
    source: Literal["nessie_sandbox", "seeded_fallback"]
    simulated: Literal[True] = True
    persona_id: str
    period_start: date
    period_end: date
    total_deposits: float
    avg_monthly_deposits: float
    avg_monthly_outflow: float | None = None
    utility_bill_signals: list[str] = Field(default_factory=list)
    balance_snapshot: float | None = None
    caveats: list[str] = Field(default_factory=list)


class EvidenceRequest(BaseModel):
    kind: Literal["nessie", "document"]
    persona_id: str | None = None
    document_ref: str | None = None


class DocumentExtraction(BaseModel):
    document_id: str
    filename: str
    status: Literal["extracted", "failed"]
    extracted_facts: dict[str, Fact] = Field(default_factory=dict)


# --------------------------------------------------------------------------
# Programs (owned by Program Discovery)
# --------------------------------------------------------------------------


class ServiceArea(BaseModel):
    statewide: bool = False
    state: str | None = None
    counties: list[str] = Field(default_factory=list)
    zips: list[str] = Field(default_factory=list)


class Requirement(BaseModel):
    id: str
    kind: Literal[
        "income_max",
        "age_min",
        "age_max",
        "residency",
        "household",
        "categorical",
        "open_access",
        "text_only",
    ]
    field: str | None = None
    op: Literal["lte", "gte", "eq", "in"] | None = None
    value: Any | None = None
    period: str | None = None
    text: str
    source_url: str
    verified: bool


class Program(BaseModel):
    id: str
    name: str
    provider: str
    type: Literal["government", "community"]
    categories: list[str]
    service_area: ServiceArea
    description: str
    info_url: str
    apply_url: str | None = None
    contact: str | None = None
    documents_needed: list[str] | None = None  # None means unknown
    requirements: list[Requirement] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    verified_on: date
    program_period: str | None = None


# --------------------------------------------------------------------------
# Eligibility (owned by Eligibility)
# --------------------------------------------------------------------------


class CriterionResult(BaseModel):
    requirement_id: str
    result: Literal["met", "not_met", "unknown"]
    evidence: str | None = None


class EligibilityAssessment(BaseModel):
    program_id: str
    status: EligibilityStatus
    criteria: list[CriterionResult] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    explanation: str
    source_urls: list[str] = Field(default_factory=list)
    disclaimer: str = DISCLAIMER
    inputs_hash: str


# --------------------------------------------------------------------------
# Action plan (owned by Action Planning)
# --------------------------------------------------------------------------


class ActionItem(BaseModel):
    rank: int
    program_id: str
    action_type: Literal["apply_now", "confirm_eligibility", "get_more_information"]
    rationale: str
    next_step: str
    documents: list[str] | None = None  # None means unknown
    link: str  # copied from the Program record, never generated
    urgency: Literal["high", "medium", "low", "unknown"] = "unknown"
    depends_on: list[str] = Field(default_factory=list)
    uncertainty: str | None = None


# --------------------------------------------------------------------------
# Execution metadata (owned by the Administrator)
# --------------------------------------------------------------------------


class DirtyFlags(BaseModel):
    discovery: bool = False
    eligibility_ids: list[str] = Field(default_factory=list)
    plan: bool = False


class AgentStatus(BaseModel):
    status: RunStatus
    updated_at: datetime


class SafeError(BaseModel):
    code: str
    message: str  # safe to show to the user
    agent: AgentName | None = None
    at: datetime


def merge_statuses(
    left: dict[str, AgentStatus] | None, right: dict[str, AgentStatus] | None
) -> dict[str, AgentStatus]:
    """Reducer: every node may report its own status without clobbering others."""
    return {**(left or {}), **(right or {})}


class SessionState(TypedDict, total=False):
    """LangGraph state. Each node returns only the keys it owns.

    Writers:
      Administrator      workflow_phase, pending_question, intake, dirty,
                         dispatched, run_counts; clears changed_fields; prunes
                         assessments and plan items whose program is gone
      User Intelligence  profile, changed_fields, consents, financial_summary,
                         documents; clears user_answer and pending_evidence
      Program Discovery  programs, coverage
      Eligibility        eligibility_assessments
      Action Planning    action_plan
      Any node           agent_statuses (merged), errors
    """

    session_id: str
    workflow_phase: WorkflowPhase
    intake: IntakeState
    pending_question: Question | None
    user_answer: AnswerIn | None
    pending_evidence: EvidenceRequest | None
    profile: Profile
    changed_fields: list[str]
    consents: dict[str, bool]
    financial_summary: FinancialSummary | None
    documents: list[DocumentExtraction]
    coverage: Coverage
    programs: list[Program]
    eligibility_assessments: dict[str, EligibilityAssessment]
    action_plan: list[ActionItem]
    dirty: DirtyFlags
    agent_statuses: Annotated[dict[str, AgentStatus], merge_statuses]
    errors: list[SafeError]
    # Per-run execution metadata. The API resets run_counts on every invoke.
    dispatched: str | None  # specialist the Administrator is waiting on
    run_counts: dict[str, int]  # specialist name -> runs in the current invoke
