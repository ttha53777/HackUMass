"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isApiError } from "@/lib/api";
import {
  RUN_ACTIVE,
  answerFillerRun,
  controlFillerRun,
  getFillerRun,
  liveUrl,
  startFillerRun,
  stopFillerRun,
  type FillerRun,
  type LiveEvent,
  type RunControl,
} from "@/lib/filler";

const BACKUP_POLL_MS = 3000;
const RECONNECT_MS = 1000;
const MAX_STEPS = 60;
const runKey = (sessionId: string) => `od-filler-run:${sessionId}`;

function readRunId(sessionId: string): string | null {
  try {
    return window.sessionStorage.getItem(runKey(sessionId));
  } catch {
    return null;
  }
}

function writeRunId(sessionId: string, runId: string | null) {
  try {
    if (runId) window.sessionStorage.setItem(runKey(sessionId), runId);
    else window.sessionStorage.removeItem(runKey(sessionId));
  } catch {
    // ignore: the run still works, it just won't resume after a reload
  }
}

export type Frame = { src: string; width: number; height: number };
export type Cursor = { x: number; y: number; kind: "move" | "click"; at: number };
type FrameListener = (frame: Frame) => void;

/**
 * One fill run for this session: start (prepared, so the pre-flight card shows the plan),
 * the live WebSocket (frames, cursor, captions; reconnects while the run is active), a fresh
 * snapshot whenever the status changes, and the person's controls. Frames go straight to
 * listeners (the viewer's <img>), not through React state, so 8 fps costs no re-renders.
 */
export function useFillerRun(sessionId: string, programId: string | null = null, pdfFormId: string | null = null) {
  const [run, setRun] = useState<FillerRun | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<FrameListener>());
  const lastFrame = useRef<Frame | null>(null);

  const runId = run?.run_id ?? null;
  const active = !!run && RUN_ACTIVE.includes(run.status);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
  }, []);

  const refresh = useCallback(
    async (id: string) => {
      try {
        setRun(await getFillerRun(sessionId, id));
      } catch (e) {
        if (isApiError(e, "run_not_found") || isApiError(e, "session_not_found")) {
          writeRunId(sessionId, null);
          setRun(null);
          return;
        }
        fail(e);
      }
    },
    [sessionId, fail],
  );

  // Resume a run from earlier in this tab.
  useEffect(() => {
    const saved = readRunId(sessionId);
    if (!saved) return;
    let live = true;
    getFillerRun(sessionId, saved)
      .then((next) => live && setRun(next))
      .catch(() => writeRunId(sessionId, null));
    return () => {
      live = false;
    };
  }, [sessionId]);

  // The live stream, while the run is active.
  useEffect(() => {
    if (!runId || !active) return;
    let closed = false;
    let retry: number | undefined;
    const open = () => {
      const ws = new WebSocket(liveUrl(sessionId, runId));
      socket.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (message) => {
        const event = JSON.parse(message.data as string) as LiveEvent;
        if (event.type === "frame") {
          const frame = { src: `data:image/jpeg;base64,${event.data}`, width: event.width, height: event.height };
          lastFrame.current = frame;
          for (const listener of listeners.current) listener(frame);
        } else if (event.type === "cursor") {
          setCursor({ x: event.x, y: event.y, kind: event.kind, at: performance.now() });
        } else if (event.type === "step") {
          setSteps((cur) => [...cur, event.caption].slice(-MAX_STEPS));
        } else if (event.type === "end") {
          void refresh(runId);
        } else {
          // status, question, handoff, checklist, plan: the snapshot has them all
          void refresh(runId);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        socket.current = null;
        if (!closed) retry = window.setTimeout(open, RECONNECT_MS);
      };
    };
    open();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      socket.current?.close();
      socket.current = null;
    };
  }, [sessionId, runId, active, refresh]);

  // Backup poll (the countdown, and anything a dropped socket missed). After a program's run
  // ends, keep polling until its result is in the plan.
  const awaitingResult = !!run && !active && !!run.program_id && !run.result_recorded && run.status !== "failed";
  useEffect(() => {
    if (!runId || !(active || awaitingResult)) return;
    const timer = window.setInterval(() => void refresh(runId), BACKUP_POLL_MS);
    return () => window.clearInterval(timer);
  }, [runId, active, awaitingResult, refresh]);

  const act = useCallback(
    async (call: () => Promise<FillerRun>) => {
      setBusy(true);
      setError(null);
      try {
        setRun(await call());
        return true;
      } catch (e) {
        fail(e);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [fail],
  );

  const start = useCallback(async () => {
    setSteps([]);
    lastFrame.current = null;
    return act(async () => {
      const next = await startFillerRun(sessionId, true, programId, pdfFormId);
      writeRunId(sessionId, next.run_id);
      return next;
    });
  }, [act, sessionId, programId, pdfFormId]);

  const control = useCallback(
    (action: RunControl) => (runId ? act(() => controlFillerRun(sessionId, runId, action)) : Promise.resolve(false)),
    [act, sessionId, runId],
  );

  const answer = useCallback(
    (body: { value?: string; skip?: boolean }) => (runId ? act(() => answerFillerRun(sessionId, runId, body)) : Promise.resolve(false)),
    [act, sessionId, runId],
  );

  const stop = useCallback(() => (runId ? act(() => stopFillerRun(sessionId, runId)) : Promise.resolve(false)), [act, sessionId, runId]);

  const forget = useCallback(() => {
    writeRunId(sessionId, null);
    setRun(null);
    setSteps([]);
    lastFrame.current = null;
  }, [sessionId]);

  /** The person's click, scroll or key, during a hand-off or the review. */
  const send = useCallback((event: Record<string, unknown>) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(event));
  }, []);

  const onFrame = useCallback((listener: FrameListener) => {
    listeners.current.add(listener);
    if (lastFrame.current) listener(lastFrame.current);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return { run, steps, cursor, error, busy, connected, active, start, control, answer, stop, forget, send, onFrame };
}

export type FillerRunController = ReturnType<typeof useFillerRun>;
