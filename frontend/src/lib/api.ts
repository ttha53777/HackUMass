import type { AnswerIn, ErrorBody, ErrorCode, SessionSnapshot } from "./types";

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

async function request(path: string, init?: RequestInit): Promise<SessionSnapshot> {
  // Same-origin: Next.js forwards /api/* to the backend (see next.config.ts).
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (response.ok) {
    return (await response.json()) as SessionSnapshot;
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
