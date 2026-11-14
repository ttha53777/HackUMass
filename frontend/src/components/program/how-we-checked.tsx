"use client";

import { Check, CircleHelp, Loader, Minus } from "lucide-react";

import { actionFor, asksFor, openIds } from "@/lib/derive";
import { plural } from "@/lib/format";
import type { AgentName, ProgramCard, RunStatus, SessionSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

const AGENTS: { name: AgentName; title: string; label: string }[] = [
  { name: "user_intelligence", title: "Read your answers", label: "User Intelligence" },
  { name: "program_discovery", title: "Found programs for your area", label: "Program Discovery" },
  { name: "eligibility", title: "Compared with the published rules", label: "Eligibility" },
  { name: "action_planning", title: "Put your next steps in order", label: "Action Planning" },
];

const STATE: Record<RunStatus, string> = {
  queued: "Waiting",
  running: "Working",
  completed: "Done",
  skipped: "Skipped",
  failed: "Didn't finish",
};

/**
 * The agent steps behind one program's result, from agent_statuses plus counts.
 * Steps and counts only: never an answer, a document or sandbox data.
 */
export function HowWeChecked({ snapshot, card }: { snapshot: SessionSnapshot; card: ProgramCard }) {
  const answers = snapshot.answered.filter((a) => !a.skipped).length;
  const fromEvidence = snapshot.profile_summary.filter((p) => p.provenance !== "user_reported").length;
  const asks = asksFor(card, openIds(snapshot)).length;
  const rank = actionFor(snapshot, card.program.id)?.rank;
  const zip = snapshot.region?.zip;

  const detail: Partial<Record<AgentName, string>> = {
    user_intelligence: `${plural(answers, "answer")}${fromEvidence ? `, ${fromEvidence} from a document or sandbox profile` : ", all from you"}`,
    program_discovery: `${plural(snapshot.programs.length, "program")} serve${snapshot.programs.length === 1 ? "s" : ""} ${zip ? `ZIP ${zip}` : "your area"} and your needs`,
    eligibility: asks
      ? `${plural(asks, "rule")} here still ${asks === 1 ? "needs" : "need"} an answer`
      : `${plural(card.assessment?.checks.length ?? 0, "rule")} checked for this program`,
    action_planning: rank ? `This is step ${rank} of ${snapshot.action_plan.length}` : `${plural(snapshot.action_plan.length, "step")} ranked; this one isn't among them`,
  };

  return (
    <details className="group">
      <summary className="cursor-pointer font-display text-sm font-extrabold tracking-[-0.2px]">How we checked this</summary>
      <ol className="mt-3 flex flex-col gap-2.5">
        {AGENTS.map(({ name, title, label }) => {
          const status = snapshot.agent_statuses[name]?.status;
          const done = status === "completed";
          const waiting = name === "eligibility" && done && asks > 0;
          const Icon = waiting ? CircleHelp : done ? Check : status === "skipped" ? Minus : Loader;
          return (
            <li key={name} className="flex items-start gap-[11px]">
              <span
                className={cn(
                  "grid size-[26px] shrink-0 place-items-center rounded-[9px]",
                  waiting ? "bg-amber text-amber-ink" : done ? "bg-brand text-on-brand" : "bg-surface-2 text-muted-foreground",
                )}
              >
                <Icon aria-hidden className="size-3.5" />
              </span>
              <span className="flex flex-col gap-px">
                <b className="text-[13px]">
                  {title}
                  <span className="sr-only">: {status ? STATE[status] : "not run"}</span>
                </b>
                <small className="text-xs leading-normal text-muted-foreground">
                  {label} · {detail[name]}
                </small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
        Steps and counts only. Your answers, documents and any sandbox data are never shown here or written to a log.
      </p>
    </details>
  );
}
