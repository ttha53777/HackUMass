"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createSession, getSession, isApiError, submitAnswer } from "@/lib/api";
import type { AnswerIn, SessionSnapshot } from "@/lib/types";

const STORAGE_KEY = "crn.session_id";
const POLL_MS = 1000;

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
  restart: () => Promise<void>;
  clearAnswerError: () => void;
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
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [sessionId, busy, pollAttempt, begin]);

  const submit = useCallback(
    async (answer: AnswerIn) => {
      if (!sessionId) return false;
      const mine = generation.current;
      setSubmitting(true);
      setAnswerError(null);
      try {
        const next = await submitAnswer(sessionId, answer);
        if (generation.current !== mine) return false;
        setSnapshot(next);
        setPollAttempt(0);
        return true;
      } catch (error) {
        if (generation.current !== mine) return false;
        if (isApiError(error, "session_not_found")) {
          await begin(null, true);
        } else if (isApiError(error, "stale_question") || isApiError(error, "session_busy")) {
          // Our view is out of date: reload it and let the person try again.
          setAnswerError(error.message);
          try {
            const fresh = await getSession(sessionId);
            if (generation.current === mine) setSnapshot(fresh);
          } catch {
            // The poll or the next action will surface a lasting problem.
          }
        } else if (isApiError(error)) {
          setAnswerError(error.message);
        } else {
          setAnswerError(OFFLINE_MESSAGE);
        }
        return false;
      } finally {
        if (generation.current === mine) setSubmitting(false);
      }
    },
    [sessionId, begin],
  );

  const restart = useCallback(async () => {
    storeId(null);
    setSnapshot(null);
    setSubmitting(false);
    await begin(null);
  }, [begin]);

  const clearAnswerError = useCallback(() => setAnswerError(null), []);

  return {
    snapshot,
    loadError,
    answerError,
    expired,
    working: submitting || busy,
    submit,
    restart,
    clearAnswerError,
  };
}
