"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useApp } from "@/components/session/session-provider";
import { coreDone } from "@/lib/derive";
import type { AgentName, SessionSnapshot } from "@/lib/types";

import { Rise } from "../rise";
import { places } from "./model";

type Row = {
  agent: AgentName;
  title: string;
  count: (s: SessionSnapshot) => string;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** The rows, one per agent, in the order the backend runs them. Counts are the backend's own. */
function rowsFor(s: SessionSnapshot | null): Row[] {
  // The Document Agent's row shows only when a paper was read in this session.
  const papers =
    (s?.trace ?? []).some((e) => e.node === "document_analysis") ||
    !!s?.agent_statuses.document_analysis;
  return [
    ...(papers
      ? [
          {
            agent: "document_analysis" as const,
            title: "Reading your papers",
            count: () => "",
          },
        ]
      : []),
    {
      agent: "user_intelligence",
      title: "Reading your answers",
      count: (x) =>
        plural(
          x.answered.filter((a) => !a.skipped).length,
          "answer",
          "answers",
        ),
    },
    {
      agent: "program_discovery",
      title: `Looking for programs near ${s?.region?.city ?? "you"}`,
      count: (x) => `${x.programs.length} checked`,
    },
    {
      agent: "eligibility",
      title: "Comparing what each one asks for",
      count: (x) => `${places(x).length} might fit`,
    },
    {
      agent: "action_planning",
      title: "Putting your next steps in order",
      count: (x) => `${Math.min(3, x.action_plan.length)} to start`,
    },
  ];
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * "Putting your plan together": each row rings while it is on and is ticked only
 * once that agent reports completed (or skipped), never ahead of the work. When
 * every row is ticked and the backend is idle, the view lifts away and the plan opens.
 */
export function Building({ name }: { name: string }) {
  const app = useApp();
  const router = useRouter();
  const s = app.snapshot;
  const [fast] = useState(reducedMotion);
  const [rows] = useState(() => rowsFor(s));
  const [at, setAt] = useState(0);
  const [minFor, setMinFor] = useState(-1);
  const [exit, setExit] = useState(false);

  const idle = !!s && !app.working && !s.busy && coreDone(s);
  const status = (i: number) => s?.agent_statuses[rows[i].agent]?.status;
  // Done when the agent says so; once the whole run is idle, an agent that failed or never ran stops holding the line.
  const finished = (i: number) => {
    const st = status(i);
    return (
      st === "completed" ||
      st === "skipped" ||
      (idle && st !== "running" && st !== "queued")
    );
  };
  const ok = (i: number) =>
    i < at || (i === at && minFor === at && finished(i));
  const currentOk = at < rows.length && ok(at);

  // Each row stays "on" for its moment before it may tick.
  useEffect(() => {
    if (at >= rows.length) return;
    const t = window.setTimeout(() => setMinFor(at), fast ? 150 : 760);
    return () => window.clearTimeout(t);
  }, [at, rows.length, fast]);

  // Ticked: a short breath, then the next row.
  useEffect(() => {
    if (!currentOk) return;
    const t = window.setTimeout(() => setAt((a) => a + 1), fast ? 0 : 120);
    return () => window.clearTimeout(t);
  }, [currentOk, fast]);

  // All ticked and the backend is done: lift away, then open the plan.
  const allDone = at >= rows.length && idle;
  useEffect(() => {
    if (!allDone) return;
    const a = window.setTimeout(() => setExit(true), fast ? 150 : 450);
    const b = window.setTimeout(
      () => router.replace("/home"),
      fast ? 150 : 1000,
    );
    return () => [a, b].forEach(window.clearTimeout);
  }, [allDone, fast, router]);

  return (
    <div id="v-build" className="view wrap">
      <div className={`bld${exit ? " exit" : ""}`} id="bld" aria-live="polite">
        <p className="mono">One moment</p>
        <h2>
          <Rise
            text={
              name
                ? `Putting your plan together, ${name}.`
                : "Putting your plan together."
            }
            base={0}
            step={60}
          />
        </h2>
        <ol>
          {rows.map((r, i) => {
            const done = ok(i);
            return (
              <li
                key={r.agent}
                className={done ? "ok" : i === at ? "on" : undefined}
              >
                <svg
                  className="dd"
                  viewBox="0 0 28 28"
                  style={{ filter: "none" }}
                  aria-hidden="true"
                >
                  <circle
                    className="ring"
                    cx="14"
                    cy="14"
                    r="11"
                    pathLength={1}
                  />
                  <path
                    className="ck"
                    pathLength={1}
                    strokeWidth="2.6"
                    d="M7 14.5 L12 19 L21 8.5"
                  />
                </svg>
                <span>{r.title}</span>
                <span className="ct">{done && s ? r.count(s) : ""}</span>
                <span className="sr-only">
                  {done ? "Done" : i === at ? "Working" : "Waiting"}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="fine">
          Nothing is sent to any agency. This only reads the list our team
          checked.
        </p>
      </div>
    </div>
  );
}
