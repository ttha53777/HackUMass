import type { AnswerIn, ErrorBody, ErrorCode, InterpretIn, InterpretOut, PersonaOut, RunView, SessionSnapshot, WebResourcesOut } from "./types";

/** An error response from the backend, with its machine-readable code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown, code?: ErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

async function request<T = SessionSnapshot>(path: string, init?: RequestInit): Promise<T> {
  // Same-origin: Next.js forwards /api/* to the backend (see next.config.ts).
  const response = await fetch(`/api${path}`, {
    ...init,
    // A FormData body sets its own multipart content type.
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (response.ok) {
    return (await response.json()) as T;
  }
  let body: Partial<ErrorBody> = {};
  try {
    body = (await response.json()) as Partial<ErrorBody>;
  } catch {
    // Not JSON (for example the proxy could not reach the backend).
  }
  throw new ApiError(
    response.status,
    body.error?.code ?? "unknown",
    body.error?.message ?? "Something went wrong. Please try again.",
  );
}

export function createSession(): Promise<SessionSnapshot> {
  return request("/sessions", { method: "POST" });
}

export function getSession(sessionId: string): Promise<SessionSnapshot> {
  return request(`/sessions/${encodeURIComponent(sessionId)}`);
}

/** Resolves for both 200 (finished) and 202 (still working: `busy` is true). */
export function submitAnswer(sessionId: string, answer: AnswerIn): Promise<SessionSnapshot> {
  return request(`/sessions/${encodeURIComponent(sessionId)}/answers`, {
    method: "POST",
    body: JSON.stringify(answer),
  });
}

/** Fictional demo bank profiles, each labelled "Simulated". */
export function getPersonas(): Promise<PersonaOut[]> {
  return request<PersonaOut[]>("/nessie/personas");
}

/** Use a simulated bank profile. Consent is sent as literally `true`. */
export function submitNessieEvidence(sessionId: string, personaId: string): Promise<SessionSnapshot> {
  return request(`/sessions/${encodeURIComponent(sessionId)}/evidence/nessie`, {
    method: "POST",
    body: JSON.stringify({ persona_id: personaId, consent: true }),
  });
}

/** Upload a PDF or text file to read household size and income from it. */
export function uploadDocument(sessionId: string, file: File): Promise<SessionSnapshot> {
  const form = new FormData();
  form.append("file", file);
  form.append("consent", "true");
  return request(`/sessions/${encodeURIComponent(sessionId)}/evidence/document`, {
    method: "POST",
    body: form,
  });
}

/** Read a message typed into the chat. Returns a proposal; the session is not changed. */
export function interpretMessage(sessionId: string, body: InterpretIn): Promise<InterpretOut> {
  return request<InterpretOut>(`/sessions/${encodeURIComponent(sessionId)}/interpret`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Browser execution agent. Poll getRun about once a second while it is active.
// ---------------------------------------------------------------------------

const runs = (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}/applications`;

/** Start the assistant on one program's form. Consent is sent as literally `true`. */
export function startRun(sessionId: string, programId: string): Promise<RunView> {
  return request<RunView>(runs(sessionId), {
    method: "POST",
    body: JSON.stringify({ program_id: programId, consent: true }),
  });
}

export function getRun(sessionId: string, runId: string): Promise<RunView> {
  return request<RunView>(`${runs(sessionId)}/${encodeURIComponent(runId)}`);
}

export function answerRun(sessionId: string, runId: string, answer: AnswerIn): Promise<RunView> {
  return request<RunView>(`${runs(sessionId)}/${encodeURIComponent(runId)}/answer`, {
    method: "POST",
    body: JSON.stringify(answer),
  });
}

/** "take": the person takes the browser; "return": they hand it back (I'm done). */
export function controlRun(sessionId: string, runId: string, action: "take" | "return"): Promise<RunView> {
  return request<RunView>(`${runs(sessionId)}/${encodeURIComponent(runId)}/control`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function stopRun(sessionId: string, runId: string): Promise<RunView> {
  return request<RunView>(`${runs(sessionId)}/${encodeURIComponent(runId)}/stop`, { method: "POST" });
}

/** Latest screenshot, for when the live view can't be embedded. */
export function runFrameUrl(sessionId: string, runId: string, tick: number): string {
  return `/api${runs(sessionId)}/${encodeURIComponent(runId)}/frame?t=${tick}`;
}

/** Unverified web results for needs no curated program covers (empty when search is off). */
export function getWebResources(sessionId: string): Promise<WebResourcesOut> {
  return request<WebResourcesOut>(`/sessions/${encodeURIComponent(sessionId)}/web-resources`);
}
