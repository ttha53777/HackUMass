"use client";

import { useId, useState } from "react";

import { useAnswer } from "@/components/session/answer-provider";
import { answerIncludes } from "@/lib/derive";
import type { AnswerIn, AnsweredItem, Question } from "@/lib/types";

import { Arrow, Tick } from "./icons";

const EXCLUSIVE = "none";
type Period = "week" | "month" | "year";
const PERIODS: [Period, string][] = [
  ["week", "a week"],
  ["month", "a month"],
  ["year", "a year"],
];

const digits = (text: string) => text.replace(/[^\d.]/g, "");

/**
 * One open question in the hub's style: single choice saves on tap; multi choice, numbers,
 * money, ZIP and text save with Save. Every answer goes through the shared answer hook, so the
 * toast and the "moved" highlight follow. `current` prefills an answer being edited.
 */
export function QuestionInput({
  question,
  current,
  onSent,
}: {
  question: Question;
  current?: AnsweredItem;
  onSent?: () => void;
}) {
  const { answer, working } = useAnswer();
  const uid = useId();
  const stored = current && !current.skipped ? current : undefined;
  const [picked, setPicked] = useState<string[]>(() =>
    stored ? question.options.filter((o) => answerIncludes(stored, [o.id])).map((o) => o.id) : [],
  );
  const min = question.min ?? 1;
  const max = question.max ?? 20;
  const [count, setCount] = useState(() => {
    const n = stored ? parseInt(digits(stored.display_value), 10) : NaN;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  });
  const [text, setText] = useState(() =>
    stored ? (question.type === "text" ? stored.display_value : digits(stored.display_value.split(" ")[0] ?? "")) : "",
  );
  const [period, setPeriod] = useState<Period>(() => {
    const shown = stored?.display_value ?? "";
    return shown.includes("week") ? "week" : shown.includes("year") ? "year" : "month";
  });

  const send = async (body: Omit<AnswerIn, "question_id">) => {
    const ok = await answer({ question_id: question.id, ...body });
    if (ok) onSent?.();
  };

  const toggle = (id: string) => {
    if (id === EXCLUSIVE) return setPicked(picked.includes(id) ? [] : [id]);
    const base = picked.filter((x) => x !== EXCLUSIVE);
    setPicked(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  const amount = Number(text.replace(/,/g, ""));
  const maxLen = question.max ?? 280;
  let error = "";
  let canSave = true;
  let save: () => void = () => {};
  switch (question.type) {
    case "multi_select":
      canSave = picked.length > 0;
      save = () => void send({ selected_option_ids: picked });
      break;
    case "number":
      save = () => void send({ value: count });
      break;
    case "currency":
      if (text && (!Number.isFinite(amount) || amount < 0)) error = "Enter a number, like 2140.";
      canSave = text !== "" && !error;
      save = () => void send({ value: amount, period });
      break;
    case "zip":
      if (text && !/^\d{5}$/.test(text)) error = "Use 5 digits, like 01002.";
      canSave = /^\d{5}$/.test(text);
      save = () => void send({ value: text });
      break;
    case "text":
      canSave = text.trim().length > 0;
      save = () => void send({ text: text.trim() });
      break;
  }

  const canSkip = question.skippable && !question.options.some((o) => o.id === "unsure");

  return (
    <>
      {question.type === "single_select" ? (
        <div className="opts" role="group" aria-label={question.prompt}>
          {question.options.map((o) => (
            <button
              key={o.id}
              className="opt"
              type="button"
              aria-pressed={stored ? picked.includes(o.id) : undefined}
              disabled={working}
              onClick={() => void send({ selected_option_ids: [o.id] })}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

      {question.type === "multi_select" ? (
        <div className="qopts" role="group" aria-label={question.prompt}>
          {question.options.map((o) => (
            <button key={o.id} className="qchk" type="button" aria-pressed={picked.includes(o.id)} onClick={() => toggle(o.id)}>
              <span className="sq">
                <Tick />
              </span>
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

      {question.type === "number" ? (
        <div className="stp">
          <button type="button" aria-label="One fewer" disabled={count <= min} onClick={() => setCount(Math.max(min, count - 1))}>
            −
          </button>
          <output aria-live="polite">{count}</output>
          <button type="button" aria-label="One more" disabled={count >= max} onClick={() => setCount(Math.min(max, count + 1))}>
            +
          </button>
          <small>{question.id === "household_size" ? (count === 1 ? "person" : "people") : null}</small>
        </div>
      ) : null}

      {question.type === "currency" ? (
        <>
          <label className="fld">
            <span>$</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              aria-label="Amount"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^0-9.,]/g, ""))}
            />
          </label>
          <div className="seg" role="group" aria-label="How often">
            {PERIODS.map(([p, label]) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {label}
              </button>
            ))}
          </div>
          <p className="qerr">{error}</p>
        </>
      ) : null}

      {question.type === "zip" ? (
        <>
          <label className="fld">
            <input
              inputMode="numeric"
              maxLength={5}
              autoComplete="postal-code"
              placeholder="01002"
              aria-label="ZIP code"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 5))}
            />
          </label>
          <p className="qerr">{error}</p>
        </>
      ) : null}

      {question.type === "text" ? (
        <>
          <label className="sr" htmlFor={uid}>
            {question.prompt}
          </label>
          <textarea
            id={uid}
            className="qtxt"
            maxLength={maxLen}
            placeholder="Anything in your own words"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="qcount">
            {text.length} / {maxLen}
          </span>
        </>
      ) : null}

      <div className="askfoot">
        {question.type !== "single_select" ? (
          <button className={`btn sm${canSave && !working ? "" : " dis"}`} type="button" disabled={!canSave || working} onClick={save}>
            Save <Arrow />
          </button>
        ) : null}
        {canSkip ? (
          <button className="txt-btn" type="button" disabled={working} onClick={() => void send({ skipped: true })}>
            Skip for now
          </button>
        ) : null}
      </div>
    </>
  );
}
