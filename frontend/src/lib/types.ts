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
  | "insufficient_information";

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
    | "age_min"
    | "age_max"
    | "residency"
    | "household"
    | "categorical"
    | "open_access"
    | "text_only";
  field: string | null;
  op: "lte" | "gte" | "eq" | "in" | null;
  value: unknown;
  period: string | null;
  text: string;
  source_url: string;
  verified: boolean;
};

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
};

export type CriterionResult = {
  requirement_id: string;
  result: "met" | "not_met" | "unknown";
  evidence: string | null;
};

export type AssessmentView = {
  status: EligibilityStatus;
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
  caveats: string[];
};

export type Notice = { code: string; message: string };

export type SessionSnapshot = {
  session_id: string;
  phase: WorkflowPhase;
  /** A graph run is active; keep polling. */
  busy: boolean;
  pending_question: Question | null;
  answered: AnsweredItem[];
  profile_summary: ProfileSummaryItem[];
  coverage: Coverage;
  programs: ProgramCard[];
  action_plan: ActionItem[];
  plan_stale: boolean;
  agent_statuses: Partial<Record<AgentName, AgentStatus>>;
  financial_summary: FinancialSummaryView | null;
  notices: Notice[];
};

export type ErrorCode =
  | "session_not_found"
  | "stale_question"
  | "session_busy"
  | "validation_error"
  | "consent_required"
  | "unsupported_file";

export type ErrorBody = { error: { code: ErrorCode; message: string } };

export type HealthOut = {
  status: "ok";
  llm_mode: "live" | "off";
  nessie_configured: boolean;
};

export type NessieEvidenceIn = { persona_id: string; consent: true };

export type PersonaOut = { id: string; label: string; description: string };
