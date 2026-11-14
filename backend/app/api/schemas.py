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
    BillLine,
    IncomeSource,
    SpendLine,
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
    "BankSuggestion",
    "CheckView",
    "LastChange",
    "OpenQuestionView",
    "ErrorBody",
    "ErrorDetail",
    "FinancialSummaryView",
    "HealthOut",
    "InterpretIn",
    "WebResourcesOut",
    "InterpretOut",
    "NotedFacts",
    "NessieEvidenceIn",
    "Notice",
    "PersonaOut",
    "ProfileSummaryItem",
    "RegionView",
    "ProgramCard",
    "SessionSnapshot",
    "DocumentReadOut",
    "IdentityReading",
    "PendingReview",
    "ReadinessOut",
    "ReviewIn",
    "ReviewRow",
    "TraceEventView",
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
    # A field the form needs is disputed; settle it before starting.
    "facts_in_conflict",
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
    income_sources: list[IncomeSource] = Field(default_factory=list)
    bills: list[BillLine] = Field(default_factory=list)
    spending: list[SpendLine] = Field(default_factory=list)
    benefit_signals: list[str] = Field(default_factory=list)


class BankSuggestion(BaseModel):
    """An answer the (simulated) bank data points to. Applied only when the person confirms it,
    through the normal answers endpoint."""

    question_id: str
    answer: AnswerIn
    shown: str  # the answer as the person would see it
    reason: str  # why, in plain words, from the totals only


class Notice(BaseModel):
    code: str
    message: str


class RegionView(BaseModel):
    """The supported area the user's ZIP code belongs to, for headings."""

    zip: str
    city: str
    county: str
    state: str


class ReviewRow(BaseModel):
    """One fact read from a paper, shown for the person to confirm or edit."""

    field: str
    label: str
    value: bool | int | float | str | list[str] | None
    display: str  # human wording, e.g. "$1,240 a month"
    in_conflict: bool = False


class PendingReview(BaseModel):
    document_id: str
    kind: str | None = None
    title: str  # e.g. "your pay stub": from the kind, never the file name
    rows: list[ReviewRow] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class TraceEventView(BaseModel):
    seq: int
    invoke: int
    step: Literal["routed", "completed", "failed", "asked", "skipped"]
    node: str
    reason: str | None = None
    fields: list[str] = Field(default_factory=list)
    count: int | None = None
    question_id: str | None = None


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
    # From a connected sandbox bank: answers to confirm. Empty when not connected.
    bank_suggestions: list[BankSuggestion] = Field(default_factory=list)
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
    # One card per read paper with facts still to confirm (Phase 3 fills it).
    pending_reviews: list[PendingReview] = Field(default_factory=list)
    # The last steps of the agent loop, oldest first (codes and field names only).
    trace: list[TraceEventView] = Field(default_factory=list)


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


class SafetyContact(BaseModel):
    """A crisis or safety line copied from a curated program record, shown with the safety message."""

    name: str
    contact: str
    info_url: str


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
    # When urgent: verified crisis and safety lines from the curated data (never generated).
    safety_contacts: list[SafetyContact] = Field(default_factory=list)
    # The message was not about getting help (or tried to give the app instructions).
    off_topic: bool = False


# --- Web-search backup (Gemini Google Search) --------------------------------
# Only for needs with no curated program in the person's area. These links are
# NOT verified: shown apart from the plan, never given an eligibility status.


class WebResult(BaseModel):
    title: str
    url: str  # https, the final page Google's grounding pointed to
    domain: str


class WebResourceGroup(BaseModel):
    need: str  # a needs option id
    label: str  # that option's label
    results: list[WebResult] = Field(default_factory=list)


class WebResourcesOut(BaseModel):
    # False when web search is off (LLM_MODE=off, no key, or not allowed for the key).
    available: bool
    groups: list[WebResourceGroup] = Field(default_factory=list)


class ReviewIn(BaseModel):
    """POST /sessions/{id}/evidence/review: the person's answer to one review card."""

    document_id: str = Field(max_length=64)
    accept: list[str] = Field(default_factory=list, max_length=20)
    # field -> corrected value: an option id (or ids) for a choice, a number otherwise.
    edits: dict[str, float | int | str | list[str]] = Field(default_factory=dict, max_length=20)


IdentityKey = Literal[
    "first_name", "last_name", "full_name", "date_of_birth",
    "street_address", "city", "state", "zip", "phone", "email",
]


class IdentityReading(BaseModel):
    """An identity detail read from a paper. Returned once, kept only on the device."""

    key: IdentityKey
    value: str = Field(max_length=200)
    source: str  # "doc:<document id>"


class DocumentReadOut(SessionSnapshot):
    """POST /sessions/{id}/evidence/document: the snapshot, plus identity details read
    from the paper. Those are for the person's device only: returned this once, with
    Cache-Control: no-store, and never kept on the server."""

    identity: list[IdentityReading] = Field(default_factory=list)


class ReadinessOut(BaseModel):
    """GET /sessions/{id}/applications/readiness: fill-sheet keys only, never values."""

    program_id: str
    from_profile: list[str] = Field(default_factory=list)
    from_device_needed: list[str] = Field(default_factory=list)
    will_ask: list[str] = Field(default_factory=list)
    unconfirmed: list[str] = Field(default_factory=list)
    blocked_by: list[str] = Field(default_factory=list)  # fields in conflict
