"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useApp } from "@/components/session/session-provider";
import { emptyPlan, readPlan, savePlan, type AppStage, type PlanState } from "@/lib/device-state";

type PlanController = {
  plan: PlanState;
  /** Set or clear (null) where the person is with one application. */
  setStage: (programId: string, stage: AppStage | null) => void;
  toggleDone: (programId: string) => void;
  toggleDoc: (kind: string) => void;
};

const Ctx = createContext<PlanController | null>(null);

/**
 * The person's own progress (application stage, steps done, papers they have).
 * Saved on this device only, under the current session; a new session starts empty.
 */
export function PlanProvider({ children }: { children: ReactNode }) {
  const sessionId = useApp().snapshot?.session_id ?? null;
  const [plan, setPlan] = useState<PlanState>(() => emptyPlan(null));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    if (sessionId) setPlan(readPlan(sessionId));
  }, [sessionId]);

  const update = useCallback((change: (p: PlanState) => PlanState) => {
    setPlan((prev) => {
      const next = change(prev);
      if (next.sessionId) savePlan(next);
      return next;
    });
  }, []);

  const value = useMemo<PlanController>(
    () => ({
      plan,
      setStage: (id, stage) =>
        update((p) => {
          const apps = { ...p.apps };
          if (stage) apps[id] = { stage, date: new Date().toISOString() };
          else delete apps[id];
          return { ...p, apps };
        }),
      toggleDone: (id) =>
        update((p) => ({ ...p, done: p.done.includes(id) ? p.done.filter((x) => x !== id) : [...p.done, id] })),
      toggleDoc: (kind) =>
        update((p) => ({ ...p, docs: p.docs.includes(kind) ? p.docs.filter((x) => x !== kind) : [...p.docs, kind] })),
    }),
    [plan, update],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlan(): PlanController {
  const value = useContext(Ctx);
  if (!value) throw new Error("usePlan must be used inside PlanProvider");
  return value;
}
