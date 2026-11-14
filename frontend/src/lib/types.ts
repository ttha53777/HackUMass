// CONTRACT FILE: mirrors backend/app/api/schemas.py and backend/app/graph/state.py.
// Coordinate with the team before changing it, and change both sides together.

export type Provenance =
  | "user_reported"
  | "document_extracted"
  | "nessie_sandbox"
  | "inferred";

export type WorkflowPhase =
  | "intake"
  | "discovering"
  | "evaluating"
  | "awaiting_user"
  | "planning"
  | "complete"
  | "error";

export type AgentName =
  | "user_intelligence"
  | "document_analysis"
  | "program_discovery"
  | "eligibility"
  | "action_planning";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "skipped";

export type Coverage = "unknown" | "supported" | "unsupported";

export type QuestionType =
  | "single_select"
  | "multi_select"
  | "text"
  | "number"
  | "currency"
  | "zip";

export type QuestionOrigin =
  | "core"
  | "eligibility_followup"
  | "conflict"
  | "evidence_offer";

export type EligibilityStatus =
  | "likely_eligible"
  | "possibly_eligible"
  | "likely_ineligible"
  | "insufficient_information"
  /** The person said they already get this benefit. */
  | "already_receiving"
  /** Opens once the person has another benefit. */
  | "opens_later";

export type Option = { id: string; label: string };

export type Question = {
  id: string;
  prompt: string;
  reason: string | null;
  type: QuestionType;
  options: Option[];
  allow_other: boolean;
  skippable: boolean;
  target_field: string;
  origin: QuestionOrigin;
  /** Bounds for number and currency inputs. */
  min: number | null;
  max: number | null;
};

/** Body of POST /api/sessions/{id}/answers. Also used for edits and skips. */
export type AnswerIn = {
  question_id: string;
  selected_option_ids?: string[];
  value?: number | string | null;
  period?: "week" | "month" | "year" | null;
  text?: string | null;
  skipped?: boolean;
};

export type ServiceArea = {
  statewide: boolean;
  state: string | null;
  counties: string[];
  zips: string[];
};

export type Requirement = {
  id: string;
  kind:
    | "income_max"
    | "income_min"
    | "age_min"
    | "age_max"
    | "residency"
    | "household"
    | "categorical"
    | "open_access"
    | "text_only"
    /** Shown, but never decides a status. */
    | "info";
  field: string | null;
  op: "lte" | "gte" | "eq" | "in" | "nin" | null;
  value: unknown;
  period: string | null;
  text: string;
  source_url: string;
  verified: boolean;
  /** Requirements sharing a group are alternatives: any one met is enough. */
  group: string | null;
  on_unmet: "fail" | "later" | "note";
  /** Only applies when the person chose one of these needs. */
  needs_any: string[];
};

export type HoursEntry = {
  label: string;
  /** 0 = Monday ... 6 = Sunday. */
  days: number[];
  /** With one day: the nth such weekday of the month. */
  nth_weekday: number | null;
  time: string;
  source_url: string;
};

export type GuideWay = {
  kind: "online" | "phone" | "in_person" | "mail" | "walk_in" | "email";
  title: string;
  detail: string;
  url: string | null;
  phone: string | null;
  best: boolean;
};

export type GuideNote = { field: string; any_of: string[]; text: string };

export type Guide = {
  slug: string;
  short_name: string;
  what: string;
  decided_by: string;
  when: string;
  cost: string;
  ways: GuideWay[];
  ask_them: string[];
  unlocks: string[];
  if_denied: string[];
  /** Question ids whose answers tailor this guide. */
  tailor_questions: string[];
  conditional_notes: GuideNote[];
  no_documents_note: string | null;
  safety_note: string | null;
  source_url: string;
};

export type FirstStep = { title: string; detail: string };

export type ProgramTrack = "benefit" | "local";
export type LocalAccess = "walk_in" | "register" | "call" | "apply";

export type Program = {
  id: string;
  name: string;
  provider: string;
  type: "government" | "community";
  categories: string[];
  service_area: ServiceArea;
  description: string;
  info_url: string;
  apply_url: string | null;
  contact: string | null;
  /** null means unknown, not "none needed". */
  documents_needed: string[] | null;
  requirements: Requirement[];
  unknowns: string[];
  /** ISO date the record was last checked against the provider's page. */
  verified_on: string;
  program_period: string | null;
  /** How the app presents it: a benefit to apply for, or local help to visit. */
  track: ProgramTrack;
  access: LocalAccess | null;
  /** null means unknown, not "always open". */
  hours: HoursEntry[] | null;
  guide: Guide | null;
  first_step: FirstStep | null;
  /** Kind of paper for each documents_needed entry, same order. */
  document_kinds: string[];
  /** Benefit id (as in the benefits_held answer) that means "you already get this". */
  held_benefit: string | null;
};

export type CriterionResult = {
  requirement_id: string;
  result: "met" | "not_met" | "unknown" | "later";
  evidence: string | null;
  /** Profile fields whose answer would decide this criterion. */
  missing: string[];
};

/** One line of the "why" list. */
export type CheckKind = "pass" | "ask" | "fail" | "later" | "have" | "note" | "unsure";

export type CheckView = {
  kind: CheckKind;
  text: string;
  evidence: string | null;
  /** Set when kind is "ask": the open question that settles it. */
  question_id: string | null;
};

export type AssessmentView = {
  status: EligibilityStatus;
  checks: CheckView[];
  criteria: CriterionResult[];
  missing_fields: string[];
  explanation: string;
  source_urls: string[];
  disclaimer: string;
};

export type ProgramCard = {
  program: Program;
  assessment: AssessmentView | null;
  stale: boolean;
};

export type ActionItem = {
  rank: number;
  program_id: string;
  action_type: "apply_now" | "confirm_eligibility" | "get_more_information";
  rationale: string;
  next_step: string;
  /** null means unknown. */
  documents: string[] | null;
  link: string;
  urgency: "high" | "medium" | "low" | "unknown";
  depends_on: string[];
  uncertainty: string | null;
};

export type AnsweredItem = {
  question_id: string;
  prompt: string;
  display_value: string;
  skipped: boolean;
  /** Full definition, so the question can be re-opened for editing. */
  question: Question;
};

export type ProfileSummaryItem = {
  field: string;
  label: string;
  display_value: string;
  provenance: Provenance;
};

export type AgentStatus = { status: RunStatus; updated_at: string };

export type FinancialSummaryView = {
  source: "nessie_sandbox" | "seeded_fallback";
  simulated: true;
  persona_id: string;
  period_start: string;
  period_end: string;
  avg_monthly_deposits: number;
  avg_monthly_outflow: number | null;
  utility_bill_signals: string[];
  caveats: string[];  income_sources: IncomeSource[];
  bills: BillLine[];
  spending: SpendLine[];
  /** Kinds of benefit deposits seen ("social_security", "unemployment"); suggestions only. */
  benefit_signals: string[];
};

/** Money coming in, grouped by kind (monthly averages; simulated). */
export type IncomeSource = { label: string; kind: "wages" | "benefit" | "other"; avg_monthly: number };

/** A recurring bill by payee; status is the most recent one. */
export type BillLine = {
  payee: string;
  category: "rent" | "utilities" | "phone_internet" | "other";
  avg_monthly: number;
  status: "paid" | "pending" | "overdue";
  day_of_month: number | null;
};

export type SpendLine = { category: "groceries" | "transport" | "household" | "other"; avg_monthly: number };

/** An answer the (simulated) bank data points to; applied only once the person confirms it. */
export type BankSuggestion = { question_id: string; answer: AnswerIn; shown: string; reason: string };

export type Notice = { code: string; message: string };

export type RegionView = { zip: string; city: string; county: string; state: string };

/** A question the person may answer now, and the programs it could settle. */
export type OpenQuestionView = { question: Question; affects: string[] };

/** What the latest input changed, as program ids. */
export type LastChange = {
  moved_to_fit: string[];
  opens_later: string[];
  no_longer_fit: string[];
  updated: string[];
};

export type SessionSnapshot = {
  session_id: string;
  phase: WorkflowPhase;
  /** A graph run is active; keep polling. */
  busy: boolean;
  pending_question: Question | null;
  /** Every follow-up that may be answered now, most useful first. Head equals pending_question. */
  open_questions: OpenQuestionView[];
  last_change: LastChange | null;
  answered: AnsweredItem[];
  profile_summary: ProfileSummaryItem[];
  coverage: Coverage;
  /** Set when coverage is "supported". */
  region: RegionView | null;
  programs: ProgramCard[];
  action_plan: ActionItem[];
  plan_stale: boolean;
  agent_statuses: Partial<Record<AgentName, AgentStatus>>;
  financial_summary: FinancialSummaryView | null;
  /** From a connected sandbox bank: answers to confirm. Empty when not connected. */
  bank_suggestions: BankSuggestion[];
  notices: Notice[];
  /** Short labels for fields named in any assessment's missing_fields. */
  field_labels: Record<string, string>;
  /** Applications sent (or attempted) with the browser assistant, by program id. */
  applications: Record<string, ApplicationRecord>;
  /** Programs the browser assistant can help fill in. Empty when the feature is off. */
  automatable_program_ids: string[];
  /** For each of those: our practice copy, or a real form where the assistant stops before sending. */
  automation_modes: Record<string, "practice" | "stop_before_submit">;
  /** One card per read paper with facts still to confirm. */
  pending_reviews: PendingReview[];
  /** The last steps of the agent loop, oldest first (codes and field names only). */
  trace: TraceEventView[];
};

export type ReviewRow = {
  field: string;
  label: string;
  value: number | string | string[] | null;
  /** Human wording, e.g. "$1,240 a month". */
  display: string;
  in_conflict: boolean;
};

export type PendingReview = {
  document_id: string;
  kind: string | null;
  /** e.g. "your pay stub": from the kind, never the file name. */
  title: string;
  rows: ReviewRow[];
  notes: string[];
};

export type TraceStep = "routed" | "completed" | "failed" | "asked" | "skipped";

export type TraceEventView = {
  seq: number;
  invoke: number;
  step: TraceStep;
  node: string;
  reason: string | null;
  fields: string[];
  count: number | null;
  question_id: string | null;
};

/** POST /sessions/{id}/evidence/review */
export type ReviewIn = {
  document_id: string;
  accept: string[];
  edits: Record<string, number | string>;
};

export type IdentityKey =
  | "first_name"
  | "last_name"
  | "full_name"
  | "date_of_birth"
  | "street_address"
  | "city"
  | "state"
  | "zip"
  | "phone"
  | "email";

/** An identity detail read from a paper. Returned once; kept only on the device. */
export type IdentityReading = { key: IdentityKey; value: string; source: string };

/** POST /sessions/{id}/evidence/document (from Phase 3). */
export type DocumentReadOut = { snapshot: SessionSnapshot; identity: IdentityReading[] };

/** GET /sessions/{id}/applications/readiness: fill-sheet keys only, never values. */
export type ReadinessOut = {
  program_id: string;
  from_profile: string[];
  from_device_needed: string[];
  will_ask: string[];
  unconfirmed: string[];
  blocked_by: string[];
};

// ---------------------------------------------------------------------------
// Browser execution agent (backend/app/execution/models.py)
// ---------------------------------------------------------------------------

export type ApplicationStatus = "in_progress" | "submitted" | "stopped" | "unclear";

export type ApplicationRecord = {
  program_id: string;
  status: ApplicationStatus;
  updated_at: string;
  /** The provider page's own confirmation text, when it showed one. */
  confirmation: string | null;
};

/** Browser run state (`RunStatus` in backend/app/execution/models.py). */
export type BrowserRunStatus =
  | "starting"
  | "working"
  | "needs_answer"
  | "needs_you"
  | "verifying"
  | "done"
  | "stopped"
  | "failed";

export type HandoffReason =
  | "submit"
  | "attestation"
  | "sign_in"
  | "captcha"
  | "sensitive_field"
  | "file_upload"
  | "safety_confirmation"
  | "unknown_field"
  | "choice"
  | "stop_point"
  | "stuck"
  | "person_requested";

export type StepLog = {
  at: string;
  kind: "action" | "blocked" | "question" | "handoff" | "note";
  /** Never contains a typed value. */
  text: string;
};

export type Outcome = {
  status: "submitted" | "not_submitted" | "unclear";
  confirmation_text: string | null;
};

export type RunView = {
  run_id: string;
  program_id: string;
  mode: "practice" | "stop_before_submit";
  status: BrowserRunStatus;
  steps: StepLog[];
  /** Set while status is needs_answer. */
  question: Question | null;
  /** Set while status is needs_you. */
  handoff: { reason: HandoffReason; message: string } | null;
  /** The provider's live view. A credential: never log or share it. */
  live_view_url: string | null;
  interactive: boolean;
  /** GET .../frame has a screenshot (fallback when there is no live view). */
  has_frame: boolean;
  seconds_left: number | null;
  outcome: Outcome | null;
  message: string | null;
  /** The outcome is in the main graph: refresh the session snapshot. */
  result_recorded: boolean;
};

export type ErrorCode =
  | "session_not_found"
  | "stale_question"
  | "session_busy"
  | "validation_error"
  | "consent_required"
  | "unsupported_file"
  | "too_many_messages"
  | "run_not_found"
  | "run_active"
  | "run_finished"
  | "not_automatable"
  | "browser_unavailable"
  | "too_many_runs"
  | "facts_in_conflict";

export type ErrorBody = { error: { code: ErrorCode; message: string } };

export type HealthOut = {
  status: "ok";
  llm_mode: "live" | "off";
  nessie_configured: boolean;
  browser_agent: boolean;
};

export type NessieEvidenceIn = { persona_id: string; consent: true };

export type PersonaOut = { id: string; label: string; description: string };

// --- Chat intake: understanding a typed message (POST /sessions/{id}/interpret) ---

export type UnsupportedNeed = "childcare" | "mental_health" | "legal" | "job" | "other";

export type InterpretIn = { question_id: string; text: string };

/** Facts stated for questions not asked yet. Confirmed by the person before use. */
export type NotedFacts = {
  household_size: number | null;
  household_who: string[];
  zip: string | null;
};

/** A crisis or safety line copied from a curated program record. */
export type SafetyContact = { name: string; contact: string; info_url: string };

/** A proposal only: interpreting a message never changes the session. */
export type InterpretOut = {
  /** One or two warm sentences that passed the output guard; null means use a template. */
  reply: string | null;
  /** A valid answer to the pending question, if the message gives one. */
  answer: AnswerIn | null;
  noted: NotedFacts;
  /** Needs mentioned that the app cannot search for yet. */
  unsupported_needs: UnsupportedNeed[];
  /** "urgent": show the fixed safety message first. */
  safety: "none" | "urgent";
  /** When urgent: verified crisis and safety lines from the curated data. */
  safety_contacts: SafetyContact[];
  /** Not about getting help, or an attempt to instruct the app. */
  off_topic: boolean;
};

// --- Web-search backup (GET /sessions/{id}/web-resources) ---
// Only for needs with no curated program nearby. NOT verified: shown apart from
// the plan, never with an eligibility status.

export type WebResult = { title: string; url: string; domain: string };

export type WebResourceGroup = { need: string; label: string; results: WebResult[] };

export type WebResourcesOut = {
  /** False when web search is off (LLM mode off, no key, or not allowed for the key). */
  available: boolean;
  groups: WebResourceGroup[];
};
