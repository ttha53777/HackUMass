"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { btn } from "@/components/od/ui";
import { useAnswer } from "@/components/session/answer-provider";
import { answerIncludes } from "@/lib/derive";
import type { AnswerIn, AnsweredItem, Question } from "@/lib/types";
import { cn } from "@/lib/utils";

const EXCLUSIVE = "none";

/**
 * A compact form for one open question. Single choice sends on tap; multi choice,
 * numbers and text send on Save. Goes through the shared answer hook, so the toast
 * and "moved" highlight follow.
 */
export function QuestionForm({
  question,
  surface = "plain",
  tailoring,
  showSkip,
  current,
  onDone,
}: {
  question: Question;
  /** Option background: "plain" on white, "tinted" on colored panels. */
  surface?: "plain" | "tinted";
  tailoring?: boolean;
  showSkip?: boolean;
  /** The stored answer, when editing: its choices start selected. */
  current?: AnsweredItem;
  onDone?: () => void;
}) {
  const { answer, working } = useAnswer();
  const stored = current && !current.skipped ? current : undefined;
  const [picked, setPicked] = useState<string[]>(() =>
    stored ? question.options.filter((o) => answerIncludes(stored, [o.id])).map((o) => o.id) : [],
  );
  const [value, setValue] = useState(() =>
    stored && question.type !== "single_select" && question.type !== "multi_select"
      ? question.type === "text"
        ? stored.display_value
        : stored.display_value.replace(/[^\d.]/g, "")
      : "",
  );

  const send = async (body: Omit<AnswerIn, "question_id">) => {
    const ok = await answer({ question_id: question.id, ...body }, { tailoring });
    if (ok) onDone?.();
  };

  const toggle = (id: string) => {
    if (id === EXCLUSIVE) return setPicked(picked.includes(id) ? [] : [id]);
    const base = picked.filter((x) => x !== EXCLUSIVE);
    setPicked(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  const optionClass = (on: boolean) =>
    cn(
      "flex items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left text-[13px] font-bold transition-colors disabled:opacity-50",
      surface === "tinted" ? "border-transparent bg-surface" : "border-line bg-surface",
      "hover:border-brand-line",
      on && "border-brand bg-brand-soft shadow-[inset_0_0_0_1px_var(--brand)]",
    );

  const canSkip = showSkip && question.skippable && !question.options.some((o) => o.id === "unsure");
  const numeric = question.type === "number" || question.type === "currency";
  const validText =
    question.type === "zip" ? /^\d{5}$/.test(value) : numeric ? value !== "" && Number.isFinite(Number(value)) : value.trim() !== "";

  return (
    <div>
      {question.type === "single_select" ? (
        <div role="group" aria-label={question.prompt} className="grid gap-[7px] min-[520px]:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {question.options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={stored ? picked.includes(o.id) : undefined}
              disabled={working}
              onClick={() => void send({ selected_option_ids: [o.id] })}
              className={cn(optionClass(picked.includes(o.id)), o.id === "unsure" && "text-muted-foreground")}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

      {question.type === "multi_select" ? (
        <>
          <div role="group" aria-label={question.prompt} className="grid gap-[7px] min-[520px]:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            {question.options.map((o) => {
              const on = picked.includes(o.id);
              return (
                <button key={o.id} type="button" aria-pressed={on} disabled={working} onClick={() => toggle(o.id)} className={optionClass(on)}>
                  <span>{o.label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "ml-auto grid size-[19px] shrink-0 place-items-center rounded-[6px] border-[1.5px]",
                      on ? "border-brand bg-brand text-on-brand" : "border-line text-transparent",
                    )}
                  >
                    <Check className="size-3" />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <button type="button" className={btn("primary", "sm")} disabled={working || !picked.length} onClick={() => void send({ selected_option_ids: picked })}>
              Save answer
            </button>
          </div>
        </>
      ) : null}

      {question.type !== "single_select" && question.type !== "multi_select" ? (
        <form
          className="flex flex-wrap items-center gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validText || working) return;
            if (numeric) void send({ value: Number(value), period: question.type === "currency" ? "month" : null });
            else void send({ value: value.trim() });
          }}
        >
          <label className="sr-only" htmlFor={`q-${question.id}`}>
            {question.prompt}
          </label>
          {question.type === "currency" ? <span className="font-bold text-muted-foreground">$</span> : null}
          <input
            id={`q-${question.id}`}
            value={value}
            inputMode={numeric || question.type === "zip" ? "numeric" : undefined}
            maxLength={question.type === "zip" ? 5 : 80}
            onChange={(e) => setValue(numeric || question.type === "zip" ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
            className="min-w-0 flex-1 rounded-[11px] border border-line bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-brand"
          />
          {question.type === "currency" ? <span className="text-xs text-muted-foreground">a month</span> : null}
          <button type="submit" className={btn("primary", "sm")} disabled={working || !validText}>
            Save answer
          </button>
        </form>
      ) : null}

      {canSkip ? (
        <button type="button" className={btn("text", "sm", "mt-1")} disabled={working} onClick={() => void send({ skipped: true })}>
          Skip this question
        </button>
      ) : null}
    </div>
  );
}
