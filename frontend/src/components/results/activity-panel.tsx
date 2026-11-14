import { CircleCheck, CircleDashed, CircleMinus, CircleX, LoaderCircle, type LucideIcon } from "lucide-react";

import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentName, RunStatus, SessionSnapshot } from "@/lib/types";

const RUN: Record<RunStatus, { label: string; icon: LucideIcon; tone: string; spin?: boolean }> = {
  queued: { label: "Waiting", icon: CircleDashed, tone: "text-muted-foreground" },
  running: { label: "Working", icon: LoaderCircle, tone: "text-foreground", spin: true },
  completed: { label: "Done", icon: CircleCheck, tone: "text-emerald-800 dark:text-emerald-300" },
  failed: { label: "Couldn’t finish", icon: CircleX, tone: "text-red-800 dark:text-red-300" },
  skipped: { label: "Not needed", icon: CircleMinus, tone: "text-muted-foreground" },
};

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

type Step = { agent: AgentName; title: string; detail: (s: SessionSnapshot) => string };

/**
 * What each specialist did, in words built only from the snapshot: statuses and
 * counts. No model-written or invented "reasoning" is shown.
 */
const STEPS: Step[] = [
  {
    agent: "user_intelligence",
    title: "Understood your answers",
    detail: (s) => {
      const given = s.answered.filter((a) => !a.skipped).length;
      const skipped = s.answered.length - given;
      return `${plural(given, "answer")} recorded${skipped ? `, ${skipped} skipped` : ""}.`;
    },
  },
  {
    agent: "program_discovery",
    title: "Found programs near you",
    detail: (s) =>
      s.coverage === "unsupported"
        ? "Your ZIP code is outside the area we have checked programs for."
        : `${plural(s.programs.length, "program")} from our hand-checked list serve${s.programs.length === 1 ? "s" : ""} ${s.region ? s.region.city : "your area"} and match your needs.`,
  },
  {
    agent: "eligibility",
    title: "Checked each program’s requirements",
    detail: (s) => {
      const checked = s.programs.filter((c) => c.assessment).length;
      return `${plural(checked, "program")} compared with your answers, rule by rule.`;
    },
  },
  {
    agent: "action_planning",
    title: "Built your plan",
    detail: (s) => `${plural(s.action_plan.length, "next step")}, in order.`,
  },
];

export function ActivityPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  if (Object.keys(snapshot.agent_statuses).length === 0) return null;
  const failed = snapshot.notices.find((n) => n.code === "specialist_failed" || n.code === "run_failed");

  return (
    <details className="rounded-xl border border-border print:hidden">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50">
        How we put this together
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-4">
        <p className="text-sm text-muted-foreground">
          Four steps build your results. Each uses only your answers and our hand-checked list of
          programs, and the rules are checked by code, not guessed.
        </p>
        <ol className="flex flex-col gap-3">
          {STEPS.map(({ agent, title, detail }) => {
            const run = snapshot.agent_statuses[agent];
            const meta = run ? RUN[run.status] : null;
            const Icon = meta?.icon ?? CircleDashed;
            return (
              <li key={agent} className="flex gap-3">
                <Icon
                  aria-hidden
                  className={cn("mt-0.5 size-5 shrink-0", meta?.tone ?? "text-muted-foreground", meta?.spin && "motion-safe:animate-spin")}
                />
                <div className="flex flex-col gap-0.5 text-sm">
                  <p className="font-medium">
                    {title}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      — {meta ? meta.label : "Not started yet"}
                      {run && run.status !== "running" && ` at ${TIME.format(new Date(run.updated_at))}`}
                    </span>
                  </p>
                  {run?.status === "completed" && <p className="text-muted-foreground">{detail(snapshot)}</p>}
                  {run?.status === "failed" && (
                    <p className="text-muted-foreground">{failed?.message ?? "This step will run again with your next answer."}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}
