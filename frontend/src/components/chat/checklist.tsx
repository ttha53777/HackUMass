"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Check, HelpCircle, Landmark, Loader2, MapPin, Search, type LucideIcon } from "lucide-react";

import { isLive } from "@/lib/derive";
import type { AgentName, RunStatus, SessionSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: LucideIcon[] = [Search, MapPin, Landmark, HelpCircle];

/**
 * The navigator's "working on it" message. Rows appear one by one and each is
 * ticked only when the backend says that agent finished, so it never runs ahead.
 */
export function Checklist({
  snapshot,
  reduced,
  onMinimumTime,
}: {
  snapshot: SessionSnapshot | null;
  reduced: boolean;
  onMinimumTime: () => void;
}) {
  const gap = reduced ? 60 : 480;
  const [shown, setShown] = useState(0);

  const programs = snapshot?.programs ?? [];
  const gov = programs.filter((c) => c.program.track === "benefit" && isLive(c)).length;
  const loc = programs.filter((c) => c.program.track === "local" && isLive(c)).length;
  const zip = snapshot?.profile_summary.find((p) => p.field === "zip")?.display_value;

  const rows: [string, string, AgentName][] = [
    ["Reading your answers", "Your needs, ZIP and household.", "user_intelligence"],
    [
      `Checking ZIP ${zip ?? ""} against service areas`,
      snapshot?.region ? `${snapshot.region.city}, ${snapshot.region.county}. Every fact comes from a provider page.` : "Looking up your area.",
      "program_discovery",
    ],
    ["Comparing with each program's published rules", `${gov} ${gov === 1 ? "benefit" : "benefits"}, ${loc} local ${loc === 1 ? "option" : "options"}.`, "eligibility"],
    ["Putting your next steps in order", "Most useful first.", "action_planning"],
  ];
  const statusOf = (agent: AgentName): RunStatus | undefined => snapshot?.agent_statuses[agent]?.status;
  const finished = (agent: AgentName) => ["completed", "skipped"].includes(statusOf(agent) ?? "");

  useEffect(() => {
    const timers = rows.map((_, i) => window.setTimeout(() => setShown(i + 1), i * gap));
    const done = window.setTimeout(onMinimumTime, rows.length * gap + 250);
    return () => [...timers, done].forEach(window.clearTimeout);
    // The schedule starts once; row text follows the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ml-11 max-w-[520px] overflow-hidden rounded-[18px] border border-line bg-surface shadow-card">
      {rows.map(([title, detail, agent], i) => {
        if (shown <= i) return null;
        const Icon = ICONS[i];
        const done = finished(agent);
        return (
          <motion.div
            key={agent}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-line")}
          >
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] transition-colors", done ? "bg-brand text-on-brand" : "bg-surface-2 text-muted-foreground")}>
              {done ? (
                <motion.span initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                  <Check aria-hidden className="size-4" />
                </motion.span>
              ) : statusOf(agent) === "running" ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Icon aria-hidden className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block text-[13.5px]">{title}</strong>
              <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
            </div>
            <span className="sr-only">{done ? "Done" : "Working"}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
