"use client";

import { useEffect, useRef, useState } from "react";

import { Tick } from "@/components/hub/icons";
import type { FillerRun, PlanRow } from "@/lib/filler";

import { useFiller } from "./filler-context";

/** "What the agent is doing": one caption per action, newest last, never a value. */
export function StepFeed({ steps }: { steps: string[] }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [steps.length]);
  return (
    <ol ref={box} className="fl-feed" aria-live="polite" aria-label="What the helper is doing">
      {steps.length ? steps.map((s, i) => <li key={`${i}-${s}`}>{s}</li>) : <li className="fl-quiet">Nothing yet.</li>}
    </ol>
  );
}

/** The first page's fields: filled (ticked as they land), to ask, or the person's. */
export function FieldChecklist({ plan, filled }: { plan: PlanRow[]; filled: Set<string> }) {
  const rows = plan.filter((r) => r.how !== "skip");
  if (!rows.length) return null;
  return (
    <ul className="fl-check">
      {rows.map((r, i) => {
        const done = !!r.key && filled.has(r.key);
        return (
          <li key={`${i}-${r.label}`} className={done ? "done" : r.how}>
            <span className="fl-mark" aria-hidden="true">
              {done ? <Tick /> : r.how === "yours" ? "You" : r.how === "ask" ? "?" : ""}
            </span>
            <span>
              {r.label.charAt(0).toUpperCase() + r.label.slice(1)}
              <small>
                {done
                  ? "Filled"
                  : r.how === "fill"
                    ? `We'll fill it${r.source ? ` from ${r.source}` : ""}`
                    : r.how === "ask"
                      ? "We'll ask you"
                      : "Yours to do"}
              </small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Before anything is typed: what we'll fill, ask and leave to the person; unconfirmed details in one tap. */
export function PreflightCard({ run, onStart, onCancel, busy }: { run: FillerRun; onStart: () => void; onCancel: () => void; busy: boolean }) {
  const filler = useFiller();
  const plan = run.plan ?? [];
  const fill = plan.filter((r) => r.how === "fill");
  const ask = plan.filter((r) => r.how === "ask");
  const yours = plan.filter((r) => r.how === "yours");
  const unconfirmed = filler.state?.unconfirmed ?? 0;
  return (
    <div className="fl-pre">
      <h4>Ready when you are</h4>
      <p>
        This form&apos;s first page has {fill.length + ask.length + yours.length} things to fill. Watch the helper do it on the
        left. You can pause or take over at any moment, and you press Send yourself.
      </p>
      {fill.length ? <Group title={`We'll fill ${fill.length}`} rows={fill} /> : null}
      {ask.length ? <Group title={`We'll ask you ${ask.length}`} rows={ask} /> : null}
      {yours.length ? <Group title="Yours to do" rows={yours} /> : null}
      {unconfirmed ? (
        <div className="fl-confirm">
          <p>
            <b>{unconfirmed} detail{unconfirmed === 1 ? "" : "s"} from your papers not checked yet.</b> Only checked details are
            used.
          </p>
          <button className="btn quiet sm" type="button" onClick={() => void filler.confirmAll()}>
            <Tick className="mi" /> All correct
          </button>
        </div>
      ) : null}
      <div className="fl-actions">
        <button className="btn quiet sm" type="button" onClick={onCancel}>
          Not now
        </button>
        <button className="btn" type="button" disabled={busy} onClick={onStart}>
          Start filling
        </button>
      </div>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: PlanRow[] }) {
  return (
    <details className="fl-group" open={rows.length <= 6}>
      <summary>{title}</summary>
      <ul>
        {rows.map((r, i) => (
          <li key={`${i}-${r.label}`}>
            {r.label}
            {r.source ? <small> · from {r.source}</small> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The agent's one question, worded by us. */
export function QuestionBox({ run, onAnswer, busy }: { run: FillerRun; onAnswer: (body: { value?: string; skip?: boolean }) => Promise<boolean>; busy: boolean }) {
  const [value, setValue] = useState("");
  if (!run.question) return null;
  return (
    <form
      className="fl-question"
      onSubmit={async (e) => {
        e.preventDefault();
        if (value.trim() && (await onAnswer({ value }))) setValue("");
      }}
    >
      <label htmlFor="fl-answer">{run.question.text}</label>
      <p className="fl-quiet">The form needs this and it isn&apos;t on your papers. It&apos;s kept for this visit only.</p>
      <div className="fl-edit">
        <input id="fl-answer" value={value} onChange={(e) => setValue(e.target.value)} autoFocus autoComplete="off" />
        <button className="btn sm" type="submit" disabled={busy || !value.trim()}>
          Use this
        </button>
        <button className="txt-btn" type="button" disabled={busy} onClick={() => void onAnswer({ skip: true })}>
          Skip
        </button>
      </div>
    </form>
  );
}
