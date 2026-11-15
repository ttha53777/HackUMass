// Form-Fill Agent v2 ("Filler") client: papers, consent and details.
// Routes: backend/app/api/filler_routes.py. Values come back only to this session and
// are never stored on the device; nothing is kept between sessions.
import { apiRequest, isApiError } from "./api";

export type FillerScope = "identity" | "contact" | "income" | "household" | "housing";
export const FILLER_SCOPES: { id: FillerScope; label: string }[] = [
  { id: "identity", label: "Your name and date of birth" },
  { id: "contact", label: "Your address, phone and email" },
  { id: "income", label: "Your pay and employer" },
  { id: "household", label: "Who lives with you" },
  { id: "housing", label: "Your rent and landlord" },
];
export const NOTICE_VERSION = "2026-11-15";

export type FillerPaperStatus = "waiting" | "queued" | "reading" | "done" | "failed";

export type FillerPaper = {
  paper_id: string;
  kind: string | null;
  kind_label: string | null;
  status: FillerPaperStatus;
  pages: number;
  can_read: boolean;
  scopes: FillerScope[];
  found: number;
  message: string | null;
};

export type FillerDetail = {
  key: string;
  label: string;
  value: string;
  status: "proposed" | "confirmed";
  source: "paper" | "typed";
  paper_id: string | null;
  paper_kind: string | null;
  source_label: string | null;
  page: number | null;
  snippet: string | null;
  box: number[] | null;
};

export type FillerState = {
  auto_read: { on: boolean; scopes: FillerScope[] };
  papers: FillerPaper[];
  details: FillerDetail[];
  unconfirmed: number;
  paper_id?: string;
};

const base = (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}/filler`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** The Filler's state, or null when this backend doesn't have the Filler (FILLER_ENABLED off). */
export async function getFillerState(sessionId: string): Promise<FillerState | null> {
  try {
    return await apiRequest<FillerState>(`${base(sessionId)}/state`);
  } catch (error) {
    // An unmounted route answers FastAPI's plain 404, which has no error code.
    if (isApiError(error) && error.status === 404 && error.code === "unknown") return null;
    throw error;
  }
}

export function setAutoRead(sessionId: string, on: boolean, scopes: FillerScope[]): Promise<FillerState> {
  return apiRequest(`${base(sessionId)}/auto-read`, json("PUT", { on, scopes, notice_version: NOTICE_VERSION }));
}

export function addFillerPaper(sessionId: string, file: Blob, name: string, kind: string | null): Promise<FillerState> {
  const body = new FormData();
  body.append("file", file, name);
  if (kind) body.append("kind", kind);
  return apiRequest(`${base(sessionId)}/papers`, { method: "POST", body });
}

export function removeFillerPaper(sessionId: string, paperId: string): Promise<FillerState> {
  return apiRequest(`${base(sessionId)}/papers/${encodeURIComponent(paperId)}`, { method: "DELETE" });
}

/** `scopes` null = every kind of detail. */
export function grantPaper(sessionId: string, paperId: string, scopes: FillerScope[] | null): Promise<FillerState> {
  return apiRequest(
    `${base(sessionId)}/consents/${encodeURIComponent(paperId)}`,
    json("PUT", { scopes, notice_version: NOTICE_VERSION }),
  );
}

export function revokePaper(sessionId: string, paperId: string): Promise<FillerState> {
  return apiRequest(`${base(sessionId)}/consents/${encodeURIComponent(paperId)}`, { method: "DELETE" });
}

/** `keys` omitted confirms every proposed detail (the one tap: "All correct"). */
export function confirmDetails(sessionId: string, keys?: string[], edits?: Record<string, string>): Promise<FillerState> {
  return apiRequest(`${base(sessionId)}/details/confirm`, json("POST", { keys: keys ?? null, edits: edits ?? {} }));
}

export function forgetDetail(sessionId: string, key: string): Promise<FillerState> {
  return apiRequest(`${base(sessionId)}/details/${encodeURIComponent(key)}`, { method: "DELETE" });
}

/** The Filler reads PDFs and photos; the wallet's kinds map to its paper kinds as a hint. */
export const FILLER_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const HINTS: Record<string, string> = {
  income: "pay_stub",
  member_income: "pay_stub",
  id: "state_id",
  dob: "household_list",
  lease: "lease",
  heat: "utility_bill",
  address: "address_letter",
};
export function kindHint(kinds: string[]): string | null {
  for (const k of kinds) if (HINTS[k]) return HINTS[k];
  return null;
}

// -- fill runs (phase 3-4) ------------------------------------------------------------

export type FillerRunStatus =
  | "preparing" | "ready" | "filling" | "needs_answer" | "paused" | "needs_you"
  | "review" | "verifying" | "done" | "stopped" | "failed";
export const RUN_ACTIVE: FillerRunStatus[] = ["preparing", "ready", "filling", "needs_answer", "paused", "needs_you", "review", "verifying"];
/** The person may click and type in the live view. */
export const RUN_INTERACTIVE: FillerRunStatus[] = ["needs_you", "review"];

export type PlanRow = { label: string; how: "fill" | "ask" | "skip" | "yours"; key?: string; source?: string | null };

export type FillerRun = {
  run_id: string;
  status: FillerRunStatus;
  message: string | null;
  question: { key: string; label: string; text: string } | null;
  handoff: { reason: string; text: string } | null;
  filled: { key: string; label: string }[];
  outcome: { status: "submitted" | "not_submitted" | "pdf_ready"; confirmation: string | null } | null;
  plan: PlanRow[] | null;
  first_type_seconds: number | null;
  used_model: boolean;
  program_id: string | null;
  mode: "practice" | "stop_before_submit" | "pdf";
  result_recorded: boolean;
  pdf_ready: boolean;
  seconds_left: number;
};

/** Events on the live WebSocket. */
export type LiveEvent =
  | { type: "frame"; data: string; width: number; height: number }
  | { type: "cursor"; x: number; y: number; kind: "move" | "click" }
  | { type: "step"; caption: string; field_key?: string }
  | { type: "status"; status: FillerRunStatus; message?: string }
  | { type: "checklist"; filled: string[] }
  | { type: "question"; key: string; label: string; text: string }
  | { type: "handoff"; reason: string; text: string }
  | { type: "plan"; rows: PlanRow[] }
  | { type: "end" };

const runs = (sessionId: string) => `${base(sessionId)}/runs`;

/** `programId` null: the plain practice form, tied to no program. `pdfFormId`: a fillable PDF instead. */
export function startFillerRun(sessionId: string, prepare = true, programId: string | null = null, pdfFormId: string | null = null): Promise<FillerRun> {
  return apiRequest(runs(sessionId), json("POST", { prepare, program_id: programId, pdf_form_id: pdfFormId }));
}

export type PdfFormOut = { pdf_form_id: string; title: string; fields: { name: string; kind: string; label: string }[] };

/** A blank fillable PDF form to fill (not a paper: nothing is read from it). */
export function addPdfForm(sessionId: string, file: File): Promise<PdfFormOut> {
  const body = new FormData();
  body.append("file", file, file.name);
  body.append("title", file.name.replace(/\.pdf$/i, ""));
  return apiRequest(`${base(sessionId)}/pdf-forms`, { method: "POST", body });
}

export function filledPdfUrl(sessionId: string, runId: string): string {
  return `/api${runs(sessionId)}/${encodeURIComponent(runId)}/pdf`;
}

export function getFillerRun(sessionId: string, runId: string): Promise<FillerRun> {
  return apiRequest(`${runs(sessionId)}/${encodeURIComponent(runId)}`);
}

export function answerFillerRun(sessionId: string, runId: string, body: { value?: string; skip?: boolean }): Promise<FillerRun> {
  return apiRequest(`${runs(sessionId)}/${encodeURIComponent(runId)}/answer`, json("POST", body));
}

export type RunControl = "go" | "pause" | "resume" | "take" | "return" | "done";
export function controlFillerRun(sessionId: string, runId: string, action: RunControl): Promise<FillerRun> {
  return apiRequest(`${runs(sessionId)}/${encodeURIComponent(runId)}/control`, json("POST", { action }));
}

export function stopFillerRun(sessionId: string, runId: string): Promise<FillerRun> {
  return apiRequest(`${runs(sessionId)}/${encodeURIComponent(runId)}/stop`, { method: "POST" });
}

/**
 * Locally, same origin: `next dev` forwards /api (WebSocket upgrades included) to the backend.
 * Vercel's rewrites don't proxy WebSockets, so a deployment sets NEXT_PUBLIC_BACKEND_WS_ORIGIN
 * (e.g. "wss://api.example.com") and the browser connects to the backend directly.
 */
const WS_ORIGIN = (process.env.NEXT_PUBLIC_BACKEND_WS_ORIGIN ?? "").replace(/\/+$/, "");

export function liveUrl(sessionId: string, runId: string): string {
  const path = `/api${runs(sessionId)}/${encodeURIComponent(runId)}/live`;
  if (WS_ORIGIN) return `${WS_ORIGIN}${path}`;
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}${path}`;
}
