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

type Row = PlanRow & { value?: string; checked?: boolean };

/**
 * Before anything is typed: each field of the first page with the value we'll put in it and
 * the paper it came from, what we'll ask, and what is the person's. Details found on papers
 * are used only once checked; when some aren't, the main button is the one-tap check itself
 * ("Looks right, start filling"), so it can't be skipped by accident.
 */
export function PreflightCard({ run, onStart, onCancel, busy }: { run: FillerRun; onStart: () => void; onCancel: () => void; busy: boolean }) {
  const filler = useFiller();
  const [confirming, setConfirming] = useState(false);
  const found = new Map((filler.state?.details ?? []).map((d) => [d.key, d]));
  // The plan was made when the form opened; details read or confirmed since then count too.
  const rows: Row[] = (run.plan ?? []).map((r) => {
    const d = r.key ? found.get(r.key) : undefined;
    if (!d || r.how === "yours") return r;
    return { ...r, how: "fill", value: d.value, source: d.source_label ?? r.source ?? null, checked: d.status === "confirmed" };
  });
  const fill = rows.filter((r) => r.how === "fill");
  const ask = rows.filter((r) => r.how === "ask");
  const yours = rows.filter((r) => r.how === "yours");
  const toCheck = fill.filter((r) => !r.checked).length;
  const unconfirmed = filler.state?.unconfirmed ?? 0;

  const start = async () => {
    if (unconfirmed) {
      setConfirming(true);
      await filler.confirmAll(); // the one tap: these look right
      setConfirming(false);
    }
    onStart();
  };

  return (
    <div className="fl-pre">
      <h4>Ready when you are</h4>
      <p>
        Watch the helper fill the form on the left. You can pause or take over at any moment, and you press Send yourself.
      </p>
      {fill.length ? <Group title={`We'll fill ${fill.length}`} rows={fill} open /> : null}
      {ask.length ? <Group title={`We'll ask you ${ask.length}`} rows={ask} open /> : null}
      {yours.length ? <Group title="Yours to do" rows={yours} open={yours.length <= 4} /> : null}
      {toCheck || unconfirmed ? (
        <p className="fl-confirm">
          <b>Check these values.</b> They were read from your papers and haven&apos;t been checked yet. Starting means they
          look right to you. Something wrong? Press Not now and fix it under Details found on your papers.
        </p>
      ) : null}
      <div className="fl-actions">
        <button className="btn quiet sm" type="button" onClick={onCancel}>
          Not now
        </button>
        <button className="btn" type="button" disabled={busy || confirming} onClick={() => void start()}>
          {unconfirmed ? "Looks right, start filling" : "Start filling"}
        </button>
      </div>
    </div>
  );
}

function Group({ title, rows, open }: { title: string; rows: Row[]; open: boolean }) {
  return (
    <details className="fl-group" open={open}>
      <summary>{title}</summary>
      <ul>
        {rows.map((r, i) => (
          <li key={`${i}-${r.label}`}>
            {r.label}
            {r.value ? <b className="fl-val"> {r.value}</b> : null}
            {r.source ? <small> · from {r.source}</small> : null}
            {r.value && !r.checked ? <small className="fl-tocheck"> · to check</small> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The agent's one question, worded by us. */
export function QuestionBox({ run, onAnswer, busy }: { run: FillerRun; onAnswer: (body: { value?: string; skip?: boolean }) => Promise<boolean>; busy: boolean }) {
  const [value, setValue] = useState("");
  const filler = useFiller();
  if (!run.question) return null;
  const key = run.question.key;
  const known = (filler.state?.details ?? []).find((d) => d.key === key);
  return (
    <form
      className="fl-question"
      onSubmit={async (e) => {
        e.preventDefault();
        if (value.trim() && (await onAnswer({ value }))) setValue("");
      }}
    >
      <label htmlFor="fl-answer">{run.question.text}</label>
      {known ? (
        <button className="btn sm fl-use" type="button" disabled={busy} onClick={() => void onAnswer({ value: known.value })}>
          Use {known.value}
          {known.source_label ? ` (from ${known.source_label})` : ""}
        </button>
      ) : null}
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
