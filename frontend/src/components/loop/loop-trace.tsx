"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, CornerDownLeft, Route } from "lucide-react";
import { useState } from "react";

import { Panel } from "@/components/od/ui";
import type { TraceEventView } from "@/lib/types";
import { cn } from "@/lib/utils";

import { agentLabel, describe, loopsBack, runs, speaker, trigger } from "./templates";

const SHOWN_RUNS = 3;

const CHIP: Record<string, string> = {
  administrator: "bg-ink text-surface",
  document_analysis: "bg-sky text-sky-ink",
  user_intelligence: "bg-brand-soft text-brand-text",
  program_discovery: "bg-surface-2 text-ink",
  eligibility: "bg-amber text-amber-ink",
  action_planning: "bg-brand text-on-brand",
};

/**
 * "How we got here": every routing step the Administrator took and what each
 * agent did, grouped by run, newest first. A run that ends by asking the person
 * again is marked as looping back to them. Renders nothing before the first run.
 */
export function LoopTrace({ trace, className }: { trace: TraceEventView[]; className?: string }) {
  const [all, setAll] = useState(false);
  const grouped = runs(trace).reverse();
  if (!grouped.length) return null;
  const shown = all ? grouped : grouped.slice(0, SHOWN_RUNS);

  return (
    <Panel className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
          <Route aria-hidden className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-[15px] font-extrabold">How we got here</h2>
          <p className="text-[12px] text-muted-foreground">Each step the agents took, newest first. No answers are shown here.</p>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {shown.map((run, i) => (
            <motion.li
              key={run.invoke}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[14px] border border-line p-3"
            >
              <p className="mb-2 text-[12px] font-extrabold text-muted-foreground">
                {i === 0 ? "Latest" : `Earlier`} · {trigger(run.events)}
              </p>
              <ul className="flex flex-col gap-1.5">
                {run.events.map((e) => (
                  <Step key={e.seq} event={e} />
                ))}
              </ul>
              {loopsBack(run.events) ? (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] font-bold text-brand-text">
                  <CornerDownLeft aria-hidden className="size-3.5" /> Back to you for one answer, then the loop runs again.
                </p>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      {grouped.length > SHOWN_RUNS ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="flex items-center gap-1.5 self-start text-[12.5px] font-bold text-brand-text"
        >
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", all && "rotate-180")} />
          {all ? "Show fewer" : `Show ${grouped.length - SHOWN_RUNS} earlier`}
        </button>
      ) : null}
    </Panel>
  );
}

function Step({ event }: { event: TraceEventView }) {
  const who = speaker(event);
  return (
    <motion.li initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2 text-[12.5px] leading-snug">
      <span className={cn("mt-px shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold", CHIP[who] ?? "bg-surface-2 text-ink")}>
        {agentLabel(who)}
      </span>
      <span className={cn(event.step === "failed" || event.step === "skipped" ? "text-amber-ink" : "text-ink")}>{describe(event)}</span>
    </motion.li>
  );
}
