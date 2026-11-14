"use client";

import { useEffect, useState } from "react";
import { Check, HelpCircle, Landmark, MapPin, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { isLive } from "@/lib/derive";
import type { AgentName, RunStatus, SessionSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: LucideIcon[] = [Search, MapPin, Landmark, HelpCircle];

/**
 * A short staged checklist. It never outlasts the backend: the parent leaves this
 * screen only when the run is finished AND the minimum display time has passed.
 */
export function Building({
  name,
  snapshot,
  onMinimumTime,
}: {
  name: string;
  snapshot: SessionSnapshot | null;
  onMinimumTime: () => void;
}) {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gap = reduced ? 60 : 420;
  const [shown, setShown] = useState(0);

  const programs = snapshot?.programs ?? [];
  const gov = programs.filter((c) => c.program.track === "benefit" && isLive(c)).length;
  const loc = programs.filter((c) => c.program.track === "local" && isLive(c)).length;
  const questions = snapshot?.open_questions.length ?? 0;
  const touched = new Set(snapshot?.open_questions.flatMap((q) => q.affects)).size;
  const zip = snapshot?.profile_summary.find((p) => p.field === "zip")?.display_value;

  // One row per agent; each is checked off only when the backend says that agent finished.
  const rows: [string, string, AgentName, string][] = [
    ["Reading your answers", "Your needs, ZIP and household.", "user_intelligence", "User Intelligence"],
    [`Checking ZIP ${zip ?? ""} against service areas`, snapshot?.region ? `You are in ${snapshot.region.city}, ${snapshot.region.county} County. Every fact comes from a provider page.` : "Looking up your area.", "program_discovery", "Program Discovery"],
    ["Comparing with each program's published rules", `${gov} ${gov === 1 ? "benefit" : "benefits"} to apply for, ${loc} local ${loc === 1 ? "option" : "options"} nearby.`, "eligibility", "Eligibility"],
    ["Putting your next steps in order", questions ? `${questions} short ${questions === 1 ? "question" : "questions"} could firm up ${touched} programs.` : "Nothing else to ask right now.", "action_planning", "Action Planning"],
  ];
  const statusOf = (agent: AgentName): RunStatus | undefined => snapshot?.agent_statuses[agent]?.status;
  const finished = (agent: AgentName) => {
    const status = statusOf(agent);
    return status === "completed" || status === "skipped";
  };

  useEffect(() => {
    const timers = rows.map((_, i) => window.setTimeout(() => setShown(i + 1), i * gap));
    const done = window.setTimeout(onMinimumTime, rows.length * gap + 300);
    return () => [...timers, done].forEach(window.clearTimeout);
    // The schedule starts once; row text updates as the snapshot does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-[min(540px,100%)] rounded-3xl border border-line bg-surface p-[34px] shadow-card">
        <p className="text-[11px] font-extrabold uppercase tracking-[2px] text-muted-foreground">One moment</p>
        <h1 className="mb-2 mt-2.5 font-display text-[30px] font-extrabold tracking-[-0.04em]" aria-live="polite">
          {name ? `Checking programs for ${name}` : "Checking programs"}
        </h1>
        <p className="mb-[22px] leading-[1.7] text-muted-foreground">Matching what you told us to what each program asks for.</p>
        {rows.map(([title, detail, agent, label], i) => {
          const Icon = ICONS[i];
          const on = shown > i;
          const done = on && finished(agent);
          const state = statusOf(agent) === "running" ? "Working" : done ? "Done" : on ? "Waiting" : "";
          return (
            <div key={i} className={cn("flex items-start gap-[13px] border-t border-line py-[13px] transition-opacity", on ? "opacity-100" : "opacity-35")}>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", done ? "bg-brand text-on-brand" : "bg-surface-2 text-muted-foreground")}>
                {done ? <Check aria-hidden className="size-4" /> : <Icon aria-hidden className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block text-[13px]">{title}</strong>
                <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                <p className="mt-0.5 text-[11px] font-bold text-faint">{label}</p>
              </div>
              {state ? <span className={cn("shrink-0 text-[11px] font-extrabold", done ? "text-brand-text" : "text-muted-foreground")}>{state}</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
