"use client";

import { motion } from "motion/react";
import { ArrowUpRight, Check, Database, Loader2, Route, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CHIP } from "@/components/loop/loop-trace";
import type { TraceEventView } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Each step stays on screen at least this long, so the flow can be followed. */
const STEP_MS = 900;

type Stage = {
  key: string;
  chip: string; // CHIP key, or "api" / "nessie"
  who: string;
  icon: typeof Route;
  title: string;
  detail: (r: RunCounts) => string;
  /** Only ticks once the backend has really finished. */
  needsBackend: boolean;
};

type RunCounts = { facts: number | null; programs: number | null; plan: number | null };

const STAGES: Stage[] = [
  {
    key: "api",
    chip: "api",
    who: "API",
    icon: ArrowUpRight,
    title: "Your consent goes to the server",
    detail: () => "POST /evidence/nessie · nothing is read without it",
    needsBackend: false,
  },
  {
    key: "route",
    chip: "administrator",
    who: "Administrator",
    icon: Route,
    title: "Routes the new bank evidence",
    detail: () => "Hands it to the Profile Agent, the only agent that edits your profile",
    needsBackend: false,
  },
  {
    key: "nessie",
    chip: "nessie",
    who: "Profile Agent → Nessie",
    icon: Database,
    title: "Reads the simulated bank account",
    detail: () => "Deposits, bills and spending · keeps monthly totals only",
    needsBackend: false,
  },
  {
    key: "facts",
    chip: "user_intelligence",
    who: "Profile Agent",
    icon: Sparkles,
    title: "Turns the totals into suggestions",
    detail: (r) =>
      `${r.facts != null ? `${r.facts} ${r.facts === 1 ? "fact" : "facts"}` : "Facts"} like income, rent and utilities · all unconfirmed`,
    needsBackend: true,
  },
  {
    key: "eligibility",
    chip: "eligibility",
    who: "Eligibility Agent",
    icon: ShieldCheck,
    title: "Re-checks your programs",
    detail: (r) =>
      `${r.programs != null ? `${r.programs} programs` : "Programs"} · bank facts count as "possibly" until you confirm`,
    needsBackend: true,
  },
  {
    key: "plan",
    chip: "action_planning",
    who: "Administrator",
    icon: Check,
    title: "Updates your plan and asks you to confirm",
    detail: () => "A card labelled Simulated waits on your Home page",
    needsBackend: true,
  },
];

const CHIP_EXTRA: Record<string, string> = {
  api: "bg-surface-2 text-ink",
  nessie: "bg-lav text-lav-ink",
};

/** Counts from the latest run that read the bank (codes and counts only, never values). */
function bankRunCounts(trace: TraceEventView[]): RunCounts {
  const start = [...trace].reverse().find((e) => e.reason === "evidence_bank");
  if (!start) return { facts: null, programs: null, plan: null };
  const run = trace.filter((e) => e.invoke === start.invoke && e.step === "completed");
  const count = (node: string) => run.filter((e) => e.node === node).at(-1)?.count ?? null;
  return { facts: count("user_intelligence"), programs: count("eligibility"), plan: count("action_planning") };
}

/**
 * "Linking your bank": the agent loop behind connecting the simulated bank,
 * one step at a time. Steps tick on a timer so the flow is readable even when
 * the backend answers instantly, but the later steps never tick before the
 * backend has really finished. Calls `onComplete` once every step is done.
 */
export function BankLinkFlow({
  finished,
  trace,
  onComplete,
}: {
  finished: boolean;
  trace: TraceEventView[];
  onComplete: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const t = window.setInterval(() => setElapsed(performance.now() - started), 100);
    return () => window.clearInterval(t);
  }, []);

  const firstBackendStage = STAGES.findIndex((s) => s.needsBackend);
  const byTime = Math.min(STAGES.length, Math.floor(elapsed / STEP_MS));
  const done = finished ? byTime : Math.min(byTime, firstBackendStage);
  const counts = useMemo(() => (finished ? bankRunCounts(trace) : { facts: null, programs: null, plan: null }), [finished, trace]);

  useEffect(() => {
    if (done < STAGES.length) return;
    const t = window.setTimeout(onComplete, 600);
    return () => window.clearTimeout(t);
  }, [done, onComplete]);

  return (
    <div>
      <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
        Here&apos;s what the agents are doing with the demo account right now.
      </p>
      <ol className="flex flex-col gap-1.5" aria-live="polite">
        {STAGES.map((stage, i) => {
          if (i > done) return null;
          const complete = i < done;
          const Icon = stage.icon;
          return (
            <motion.li
              key={stage.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="flex items-start gap-3 rounded-[14px] border border-line px-3 py-2.5"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px]",
                  CHIP[stage.chip] ?? CHIP_EXTRA[stage.chip],
                )}
              >
                <Icon aria-hidden className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold uppercase tracking-[1px] text-muted-foreground">{stage.who}</span>
                <span className="block text-[13.5px] font-bold">{stage.title}</span>
                <span className="block text-[12px] leading-snug text-muted-foreground">{stage.detail(counts)}</span>
              </span>
              <span className="mt-1 shrink-0">
                {complete ? (
                  <Check aria-label="Done" className="size-4 text-brand-text" />
                ) : (
                  <Loader2 aria-label="Working" className="size-4 animate-spin text-muted-foreground" />
                )}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
