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
    "likely_eligible",
    "possibly_eligible",
    "likely_ineligible",
    "insufficient_information",
    # Added for the app shell: the person already gets the benefit, or the
    # program opens once they have another benefit.
    "already_receiving",
    "opens_later",
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


class IncomeSource(BaseModel):
    """Money coming in, grouped by kind. Monthly averages only; never single transactions."""

    label: str
    kind: Literal["wages", "benefit", "other"]
    avg_monthly: float


class BillLine(BaseModel):
    """A recurring bill, by payee. `status` is the most recent one: paid, pending or overdue."""

    payee: str
    category: Literal["rent", "utilities", "phone_internet", "other"]
    avg_monthly: float
    status: Literal["paid", "pending", "overdue"] = "paid"
    day_of_month: int | None = None


class SpendLine(BaseModel):
    category: Literal["groceries", "transport", "household", "other"]
    avg_monthly: float


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
    # The richer picture behind the totals (bank connector). All simulated.
    income_sources: list[IncomeSource] = Field(default_factory=list)
    bills: list[BillLine] = Field(default_factory=list)
    spending: list[SpendLine] = Field(default_factory=list)
    # Kinds of benefit deposits seen ("social_security", "unemployment"); suggestions only.
    benefit_signals: list[str] = Field(default_factory=list)


class EvidenceRequest(BaseModel):
    # "nessie_disconnect" withdraws the simulated bank: User Intelligence forgets
    # what it read, so the Administrator re-checks what depended on it.
    kind: Literal["nessie", "document", "nessie_disconnect"]
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
        "income_min",
        "age_min",
        "age_max",
        "residency",
        "household",
        "categorical",
        "open_access",
        "text_only",
        # Provider-stated context that is shown but never decides a status.
        "info",
    ]
    field: str | None = None
    op: Literal["lte", "gte", "eq", "in", "nin"] | None = None
    value: Any | None = None
    period: str | None = None
    text: str
    source_url: str
    verified: bool
    # Requirements sharing a group id are alternatives: met if any one is met,
    # not met only if every one is not met.
    group: str | None = None
    # What an unmet requirement means: ends the match ("fail"), means the
    # program opens later ("later"), or is only worth mentioning ("note").
    on_unmet: Literal["fail", "later", "note"] = "fail"
    # Only applies when the person chose one of these needs. Empty = always.
    needs_any: list[str] = Field(default_factory=list)


class HoursEntry(BaseModel):
    """When a place is open. Absent hours mean unknown, never "always"."""

    label: str
    days: list[int] = Field(default_factory=list)  # 0 = Monday ... 6 = Sunday
    nth_weekday: int | None = None  # with one day: the nth such weekday of the month
    time: str
    source_url: str


class GuideWay(BaseModel):
    kind: Literal["online", "phone", "in_person", "mail", "walk_in", "email"]
    title: str
    detail: str
    url: str | None = None
    phone: str | None = None
    best: bool = False


class GuideNote(BaseModel):
    """A sentence from the provider that applies only to people who gave a certain answer."""

    field: str  # profile field, e.g. "utility_issues"
    any_of: list[str]  # shown when the answer includes one of these
    text: str


class Guide(BaseModel):
    """Step-by-step help for applying. Every line is copied from provider pages."""

    slug: str
    short_name: str
    what: str
    decided_by: str
    when: str
    cost: str
    ways: list[GuideWay] = Field(default_factory=list)
    ask_them: list[str] = Field(default_factory=list)
    unlocks: list[str] = Field(default_factory=list)
    if_denied: list[str] = Field(default_factory=list)
    tailor_questions: list[str] = Field(default_factory=list)
    conditional_notes: list[GuideNote] = Field(default_factory=list)
    no_documents_note: str | None = None
    safety_note: str | None = None
    source_url: str


class FirstStep(BaseModel):
    """The one thing to do first, in plain words, built from the provider's own contact details."""

    title: str
    detail: str


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
    # How the app presents it: a benefit to apply for, or local help to visit.
    track: Literal["benefit", "local"] = "local"
    # Local help only: how a person gets started.
    access: Literal["walk_in", "register", "call", "apply"] | None = None
    hours: list[HoursEntry] | None = None  # None means unknown
    guide: Guide | None = None
    first_step: FirstStep | None = None
    # Kind of paper for each entry of documents_needed, same order.
    document_kinds: list[str] = Field(default_factory=list)
    # Benefit id (as in the benefits_held answer) that means "you already get this".
    held_benefit: str | None = None


# --------------------------------------------------------------------------
# Eligibility (owned by Eligibility)
# --------------------------------------------------------------------------


class CriterionResult(BaseModel):
    requirement_id: str
    result: Literal["met", "not_met", "unknown", "later"]
    evidence: str | None = None
    # Profile fields whose answer would decide this criterion.
    missing: list[str] = Field(default_factory=list)


class CheckLine(BaseModel):
    """One line of the "why" list: a requirement, or a group of alternatives, and its result.

    Built by Eligibility (the only place that knows how groups combine); the API
    only turns `missing_field` into the question that would settle it.
    """

    kind: Literal["pass", "ask", "fail", "later", "have", "note", "unsure"]
    requirement_id: str | None = None
    text: str
    evidence: str | None = None
    missing_field: str | None = None  # set when kind is "ask"


class EligibilityAssessment(BaseModel):
    program_id: str
    status: EligibilityStatus
    checks: list[CheckLine] = Field(default_factory=list)
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
# Applications (written by the browser execution agent, stored by the Administrator)
# --------------------------------------------------------------------------

ApplicationStatus = Literal["in_progress", "submitted", "stopped", "unclear"]


class ApplicationRecord(BaseModel):
    """What happened when the person applied with the browser agent's help.

    Only an outcome the provider's page states is "submitted"; anything else stays
    "unclear". It never holds a typed value, only the page's own confirmation text.
    """

    program_id: str
    status: ApplicationStatus
    updated_at: datetime
    confirmation: str | None = Field(default=None, max_length=200)


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
                         dispatched, run_counts, applications; clears
                         changed_fields and application_result; prunes
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
    # Input from the browser execution agent. The Administrator stores it in
    # `applications` (keyed by program id) and clears it.
    application_result: ApplicationRecord | None
    applications: dict[str, ApplicationRecord]
    dirty: DirtyFlags
    agent_statuses: Annotated[dict[str, AgentStatus], merge_statuses]
    errors: list[SafeError]
    # Per-run execution metadata. The API resets run_counts on every invoke.
    dispatched: str | None  # specialist the Administrator is waiting on
    run_counts: dict[str, int]  # specialist name -> runs in the current invoke
