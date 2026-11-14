"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSession,
  getSession,
  isApiError,
  submitAnswer,
  submitNessieEvidence,
  disconnectBank as disconnectBankApi,
  uploadDocument,
} from "@/lib/api";
import type { AnswerIn, SessionSnapshot } from "@/lib/types";

const STORAGE_KEY = "crn.session_id";
// Poll quickly at first (most runs finish in well under a second), then back off.
const POLL_MIN_MS = 400;
const POLL_MAX_MS = 3000;
const pollDelay = (attempt: number) => Math.min(POLL_MIN_MS * 1.6 ** attempt, POLL_MAX_MS);

const OFFLINE_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

// sessionStorage can be unavailable (private mode, blocked storage). The app
// still works without it; a page reload then simply starts a new session.
function readStoredId(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeId(sessionId: string | null) {
  try {
    if (sessionId) window.sessionStorage.setItem(STORAGE_KEY, sessionId);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export type SessionController = {
  /** null until the first snapshot arrives. */
  snapshot: SessionSnapshot | null;
  /** Could not load or create a session at all. */
  loadError: string | null;
  /** Problem with the most recent answer; safe to show next to the question. */
  answerError: string | null;
  /** The previous session was lost (backend restart or idle expiry). */
  expired: boolean;
  /** An answer is being sent, or the backend is still working on one. */
  working: boolean;
  /** Returns true when the answer was accepted. */
  submit: (answer: AnswerIn) => Promise<boolean>;
  /** Use a simulated bank profile (consent given). Returns an error message, or null. */
  submitEvidence: (personaId: string) => Promise<string | null>;
  /** Forget the connected (simulated) bank. Returns an error message, or null. */
  disconnectBank: () => Promise<string | null>;
  /** Upload a document (consent given). Returns an error message, or null. */
  submitDocument: (file: File) => Promise<string | null>;
  restart: () => Promise<void>;
  clearAnswerError: () => void;
  /** Resolves once the backend has finished the current run (or after `timeoutMs`). */
  whenIdle: (timeoutMs?: number) => Promise<void>;
  /** Re-read the snapshot after a change made outside an answer (the browser assistant's result). */
  refresh: () => Promise<void>;
};

/**
 * Owns the guided-intake session: creates or resumes it, sends answers, and
 * polls while the backend is still working.
 */
export function useSession(): SessionController {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  // Ignore responses that arrive after a newer session has replaced this one.
  const generation = useRef(0);

  const begin = useCallback(async (resumeId: string | null, lostSession = false) => {
    const mine = ++generation.current;
    const current = () => generation.current === mine;
    try {
      let next: SessionSnapshot | null = null;
      if (resumeId) {
        try {
          next = await getSession(resumeId);
        } catch (error) {
          if (!isApiError(error, "session_not_found")) throw error;
          lostSession = true;
        }
      }
      next ??= await createSession();
      if (!current()) return;
      storeId(next.session_id);
      setExpired(lostSession);
      setLoadError(null);
      setAnswerError(null);
      setSnapshot(next);
    } catch {
      if (current()) setLoadError(OFFLINE_MESSAGE);
    }
  }, []);

  useEffect(() => {
    // Resume the stored session if there is one; otherwise start fresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set only after the request resolves
    void begin(readStoredId());
    return () => {
      // Deliberate: bumping the counter makes the in-flight request above stale.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter, not a DOM ref
      generation.current++;
    };
  }, [begin]);

  const sessionId = snapshot?.session_id ?? null;
  const busy = snapshot?.busy ?? false;

  useEffect(() => {
    if (!sessionId || !busy) return;
    const mine = generation.current;
    const timer = window.setTimeout(async () => {
        try {
          const next = await getSession(sessionId);
          if (generation.current !== mine) return;
          setSnapshot(next);
          // Still busy: the effect only re-runs when its inputs change, so nudge it.
          if (next.busy) setPollAttempt((n) => n + 1);
        } catch (error) {
          if (generation.current !== mine) return;
          if (isApiError(error, "session_not_found")) void begin(null, true);
          else setPollAttempt((n) => n + 1);
        }
    }, pollDelay(pollAttempt));
    return () => window.clearTimeout(timer);
  }, [sessionId, busy, pollAttempt, begin]);

  /** Sends one change to the session; shared by answers and evidence. */
  const send = useCallback(
    async (run: (id: string) => Promise<SessionSnapshot>): Promise<string | null | false> => {
      if (!sessionId) return false;
      const mine = generation.current;
      setSubmitting(true);
      setAnswerError(null);
      try {
        const next = await run(sessionId);
        if (generation.current !== mine) return false;
        setSnapshot(next);
        setPollAttempt(0);
        return null;
      } catch (error) {
        if (generation.current !== mine) return false;
        if (isApiError(error, "session_not_found")) {
          await begin(null, true);
          return false;
        }
        if (isApiError(error, "stale_question") || isApiError(error, "session_busy")) {
          // Our view is out of date: reload it and let the person try again.
          try {
            const fresh = await getSession(sessionId);
            if (generation.current === mine) setSnapshot(fresh);
          } catch {
            // The poll or the next action will surface a lasting problem.
          }
          return error.message;
        }
        return isApiError(error) ? error.message : OFFLINE_MESSAGE;
      } finally {
        if (generation.current === mine) setSubmitting(false);
      }
    },
    [sessionId, begin],
  );

  const submit = useCallback(
    async (answer: AnswerIn) => {
      const result = await send((id) => submitAnswer(id, answer));
      if (typeof result === "string") setAnswerError(result);
      return result === null;
    },
    [send],
  );

  const submitEvidence = useCallback(
    async (personaId: string) => {
      const result = await send((id) => submitNessieEvidence(id, personaId));
      return result === false ? null : result;
    },
    [send],
  );

  const disconnectBank = useCallback(async () => {
    const result = await send((id) => disconnectBankApi(id));
    return result === false ? null : result;
  }, [send]);

  const submitDocument = useCallback(
    async (file: File) => {
      const result = await send((id) => uploadDocument(id, file));
      return result === false ? null : result;
    },
    [send],
  );

  const restart = useCallback(async () => {
    storeId(null);
    setSnapshot(null);
    setSubmitting(false);
    await begin(null);
  }, [begin]);

  const clearAnswerError = useCallback(() => setAnswerError(null), []);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const mine = generation.current;
    try {
      const next = await getSession(sessionId);
      if (generation.current !== mine) return;
      setSnapshot(next);
      setPollAttempt(0); // keeps polling if the backend is still working
    } catch (error) {
      if (generation.current === mine && isApiError(error, "session_not_found")) void begin(null, true);
    }
  }, [sessionId, begin]);

  // Latest "working" flag, readable from async sequences without re-rendering them.
  const workingRef = useRef(false);
  useEffect(() => {
    workingRef.current = submitting || busy;
  }, [submitting, busy]);

  const whenIdle = useCallback(async (timeoutMs = 20_000) => {
    const deadline = Date.now() + timeoutMs;
    // Let React commit the latest snapshot first, so a 202 ("still working") is seen as busy.
    await new Promise((resolve) => setTimeout(resolve, 50));
    while (workingRef.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, []);

  return {
    snapshot,
    loadError,
    answerError,
    expired,
    working: submitting || busy,
    submit,
    submitEvidence,
    disconnectBank,
    submitDocument,
    restart,
    clearAnswerError,
    whenIdle,
    refresh,
  };
}
