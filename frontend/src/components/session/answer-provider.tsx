"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import type { AnswerIn, LastChange } from "@/lib/types";

type AnswerController = {
  /** Send one answer (or skip), wait for the backend, then say what moved. Returns true when accepted. */
  answer: (body: AnswerIn, options?: { tailoring?: boolean; quiet?: boolean }) => Promise<boolean>;
  /** Program ids that just changed status; highlighted for a moment. */
  moved: Set<string>;
  /** An answer is on its way or the backend is still working. */
  working: boolean;
};

const Ctx = createContext<AnswerController | null>(null);

const MOVED_MS = 2600;

/** "Got it. 2 moved to likely fit, 1 no longer fits." Built only from the backend's last_change. */
export function changeMessage(change: LastChange | null, tailoring = false): string {
  const ups = change?.moved_to_fit.length ?? 0;
  const laters = change?.opens_later.length ?? 0;
  const outs = change?.no_longer_fit.length ?? 0;
  const parts: string[] = [];
  if (ups) parts.push(`${ups} moved to likely fit`);
  if (laters) parts.push(`${laters} ${laters === 1 ? "opens" : "open"} later`);
  if (outs) parts.push(`${outs} no longer ${outs === 1 ? "fits" : "fit"}`);
  if (parts.length) return `Got it. ${parts.join(", ")}.`;
  if (change?.updated.length) return "Got it. Your matches are updated.";
  if (tailoring) return "Got it. Your guide is tailored to you.";
  return "Got it. Nothing changed, and that is useful to know too.";
}

/** One shared way to answer any open question, from Home, a card, a guide or the drawer. */
export function AnswerProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const { submit, whenIdle, answerError, clearAnswerError } = app;
  const toast = useToast();
  const [moved, setMoved] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Latest snapshot, readable after awaiting the backend.
  const latest = useRef(app);
  useEffect(() => {
    latest.current = app;
  });

  // Any rejected answer is said once, wherever it came from.
  useEffect(() => {
    if (!answerError) return;
    toast(answerError);
    clearAnswerError();
  }, [answerError, toast, clearAnswerError]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const answer = useCallback<AnswerController["answer"]>(
    async (body, options = {}) => {
      setSending(true);
      try {
        await whenIdle();
        const ok = await submit(body);
        if (!ok) return false;
        await whenIdle();
        const change = latest.current.snapshot?.last_change ?? null;
        if (!options.quiet) toast(body.skipped ? "Skipped. You can answer it any time on About you." : changeMessage(change, options.tailoring));
        const ids = change ? [...change.moved_to_fit, ...change.opens_later, ...change.no_longer_fit, ...change.updated] : [];
        setMoved(new Set(ids));
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setMoved(new Set()), MOVED_MS);
        return true;
      } finally {
        setSending(false);
      }
    },
    [submit, whenIdle, toast],
  );

  const value = useMemo(() => ({ answer, moved, working: sending || app.working }), [answer, moved, sending, app.working]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnswer(): AnswerController {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAnswer must be used inside AnswerProvider");
  return value;
}
