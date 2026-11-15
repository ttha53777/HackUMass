"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSession,
  getSession,
  isApiError,
  submitAnswer,
  submitNessieEvidence,
  disconnectBank as disconnectBankApi,
  submitReview as submitReviewApi,
  uploadDocument,
} from "@/lib/api";
import type { AnswerIn, IdentityReading, ReviewIn, SessionSnapshot } from "@/lib/types";

const STORAGE_KEY = "crn.session_id";
// Poll quickly at first (most runs finish in well under a second), then back off.
const POLL_MIN_MS = 400;
const POLL_MAX_MS = 3000;
const pollDelay = (attempt: number) => Math.min(POLL_MIN_MS * 1.6 ** attempt, POLL_MAX_MS);
// Background rewording (live mode) usually takes a few seconds.
const WORDING_POLL_MS = 1500;

const OFFLINE_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

// The session id lives in localStorage, so new tabs and a closed browser pick
// up the same session (the name and plan are already kept there). Storage can
// be unavailable (private mode, blocked storage); the app still works, and a
// reload then simply starts a new session.
function readStoredId(): string | null {
  try {
    const id = window.localStorage.getItem(STORAGE_KEY);
    if (id) return id;
    // Carry over a session from when the id was kept per tab.
    const legacy = window.sessionStorage.getItem(STORAGE_KEY);
    if (legacy) window.localStorage.setItem(STORAGE_KEY, legacy);
    return legacy;
  } catch {
    return null;
  }
}

function storeId(sessionId: string | null) {
  try {
    if (sessionId) window.localStorage.setItem(STORAGE_KEY, sessionId);
    else window.localStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
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
  /**
   * The Document Agent reads one paper of a known kind (consent given). Identity
   * details come back once, for the device only; they are never kept in the snapshot.
   */
  readPaper: (file: File, kind: string) => Promise<PaperReadResult>;
  /** Answer one paper's review card. Returns an error message, or null. */
  submitReview: (review: ReviewIn) => Promise<string | null>;
  restart: () => Promise<void>;
  clearAnswerError: () => void;
  /** Resolves once the backend has finished the current run (or after `timeoutMs`). */
  whenIdle: (timeoutMs?: number) => Promise<void>;
  /** Re-read the snapshot after a change made outside an answer (the browser assistant's result). */
  refresh: () => Promise<void>;
  /** "Watch demo" is running on a throwaway session: nothing about it is kept on this device. */
  demo: boolean;
  /**
   * Swap in a throwaway session the caller already set up (never stored, so a reload or the end
   * of the demo returns to the person's own). Set it up first: the dashboard gate sends an
   * unfinished session to /start.
   */
  beginDemo: (prepared: SessionSnapshot) => void;
  /** Swap the person's own session back in. */
  endDemo: () => Promise<void>;
};

export type PaperReadResult = {
  error: string | null;
  identity: IdentityReading[];
  /** How the snapshot names the paper just read ("your lease"), when it has a review card. */
  title: string | null;
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
  const [demo, setDemo] = useState(false);
  // The person's own session id while a demo session is swapped in.
  const realId = useRef<string | null>(null);
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
      if (!realId.current) storeId(next.session_id);
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

  // Live mode: wording is rewritten in the background after a run. Re-read the
  // snapshot until it lands. This never counts as "working": answering stays open.
  const wordingPending = snapshot?.wording_pending ?? false;
  const [wordingPoll, setWordingPoll] = useState(0);
  useEffect(() => {
    if (!sessionId || busy || !wordingPending) return;
    const mine = generation.current;
    const timer = window.setTimeout(async () => {
      try {
        const next = await getSession(sessionId);
        if (generation.current !== mine) return;
        setSnapshot(next);
        if (next.wording_pending && !next.busy) setWordingPoll((n) => n + 1);
      } catch {
        // Cosmetic only: the busy poll or the next action surfaces lasting problems.
      }
    }, WORDING_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [sessionId, busy, wordingPending, wordingPoll]);

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

  const readPaper = useCallback(
    async (file: File, kind: string): Promise<PaperReadResult> => {
      let identity: IdentityReading[] = [];
      let title: string | null = null;
      const result = await send(async (id) => {
        // Identity is handed to the caller and kept out of the stored snapshot.
        const { identity: read, ...snap } = await uploadDocument(id, file, kind);
        identity = read ?? [];
        const docId = identity[0]?.source.replace(/^doc:/, "");
        title = snap.pending_reviews?.find((r) => r.document_id === docId)?.title ?? null;
        return snap;
      });
      return { error: result === false ? null : result, identity, title };
    },
    [send],
  );

  const submitReview = useCallback(
    async (review: ReviewIn) => {
      const result = await send((id) => submitReviewApi(id, review));
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

  const beginDemo = useCallback(
    (prepared: SessionSnapshot) => {
      if (realId.current || !sessionId) return;
      generation.current++; // responses for the person's session that are still in flight are dropped
      realId.current = sessionId;
      setDemo(true);
      setAnswerError(null);
      setSubmitting(false);
      setSnapshot(prepared);
      setPollAttempt(0);
    },
    [sessionId],
  );

  const endDemo = useCallback(async () => {
    const back = realId.current;
    if (!back) return;
    realId.current = null;
    setDemo(false);
    setSubmitting(false);
    await begin(back);
  }, [begin]);

  return {
    demo,
    beginDemo,
    endDemo,
    snapshot,
    loadError,
    answerError,
    expired,
    working: submitting || busy,
    submit,
    submitEvidence,
    disconnectBank,
    submitDocument,
    readPaper,
    submitReview,
    restart,
    clearAnswerError,
    whenIdle,
    refresh,
  };
}
