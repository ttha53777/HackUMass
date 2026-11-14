"use client";

import { QuestionForm } from "@/components/program/question-form";
import { useApp } from "@/components/session/session-provider";
import { cardById, shortName } from "@/lib/derive";
import { plural } from "@/lib/format";

/** The adaptive loop, made visible: the one question that would settle the most. */
export function SharpenCard() {
  const { snapshot } = useApp();
  if (!snapshot) return null;
  const head = snapshot.open_questions[0];
  const answeredFollowups = snapshot.answered.filter((a) => a.question.origin !== "core").length;
  const left = snapshot.open_questions.length;

  if (!head) {
    return (
      <div className="relative overflow-hidden rounded-[22px] bg-plan p-[22px] text-plan-ink">
        <p className="text-[11px] font-extrabold uppercase tracking-[2px] text-plan-muted">Sharpen your matches</p>
        <h2 className="mb-1 mt-1.5 text-[19px] font-extrabold tracking-[-0.5px]">You&apos;re all caught up.</h2>
        <p className="text-xs leading-[1.65] text-plan-muted">
          There&apos;s nothing left to ask that would change your results. You can update any answer on About you.
        </p>
      </div>
    );
  }

  const names = head.affects.map((id) => cardById(snapshot, id)).filter((c) => !!c).map((c) => shortName(c.program));
  const dots = Math.min(answeredFollowups + left, 12);

  return (
    <section
      aria-labelledby="sharpen-q"
      className="relative overflow-hidden rounded-[22px] bg-plan p-[22px] text-plan-ink after:pointer-events-none after:absolute after:-right-[60px] after:-top-[60px] after:size-[150px] after:rounded-full after:bg-white/30 dark:after:bg-white/5"
    >
      <p className="text-[11px] font-extrabold uppercase tracking-[2px] text-plan-muted">
        Sharpen your matches · affects {plural(head.affects.length, "program")}
      </p>
      <h2 id="sharpen-q" className="relative z-[1] mb-1.5 mt-1.5 text-[19px] font-extrabold tracking-[-0.5px]">
        {head.question.prompt}
      </h2>
      {head.question.reason ? <p className="relative z-[1] mb-3 text-xs leading-[1.65] text-plan-muted">{head.question.reason}</p> : null}
      {names.length ? (
        <div className="relative z-[1] mb-3.5 flex flex-wrap gap-1.5">
          {names.slice(0, 5).map((n) => (
            <span key={n} className="rounded-full bg-surface px-[9px] py-1 text-[11px] font-bold text-ink">
              {n}
            </span>
          ))}
          {names.length > 5 ? <span className="rounded-full bg-surface px-[9px] py-1 text-[11px] font-bold text-ink">+{names.length - 5} more</span> : null}
        </div>
      ) : null}
      <div className="relative z-[1]">
        <QuestionForm key={head.question.id} question={head.question} surface="tinted" showSkip />
      </div>
      <div className="relative z-[1] mt-3 flex items-center justify-between text-[11px] tabular-nums text-plan-muted">
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: dots }, (_, i) => (
            <i key={i} className={`h-1 w-4 rounded ${i < answeredFollowups ? "bg-brand" : "bg-plan-track"}`} />
          ))}
        </div>
        <span>{left} left</span>
      </div>
    </section>
  );
}
