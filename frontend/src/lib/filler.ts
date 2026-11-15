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
const HINTS: Record<string, string> = { income: "pay_stub", member_income: "pay_stub", id: "state_id", dob: "state_id", lease: "lease" };
export function kindHint(kinds: string[]): string | null {
  for (const k of kinds) if (HINTS[k]) return HINTS[k];
  return null;
}
