"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Baby, Briefcase, Bus, Check, Flame, House, Minus, Stethoscope, UserRound, Users, Utensils, type LucideIcon } from "lucide-react";

import type { AnswerIn, Question } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<string, LucideIcon> = {
  food: Utensils,
  utilities: Flame,
  housing: House,
  healthcare: Stethoscope,
  transportation: Bus,
  employment: Briefcase,
  "60": UserRound,
  "55": UserRound,
  child: Baby,
  none: Minus,
};

/** Options that clear every other choice (and are cleared by any other). */
const EXCLUSIVE = new Set(["none"]);

const HOUSEHOLD = [1, 2, 3, 4, 5, 6];

/**
 * Tap-to-answer chips under the latest question. Single choices send on tap;
 * multiple choices collect, then send with Done. Focus lands on the first chip.
 */
export function QuickReplies({
  question,
  initial,
  confirm,
  disabled,
  onAnswer,
}: {
  question: Question;
  initial?: string[];
  /** A "Yes, that's right" chip for something the person already said. */
  confirm?: { label: string; answer: AnswerIn };
  disabled: boolean;
  onAnswer: (answer: AnswerIn) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial ?? []);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, [question.id]);

  const multi = question.type === "multi_select";
  const isNumber = question.type === "number" && question.id === "household_size";
  if (!multi && question.type !== "single_select" && !isNumber && !confirm) return null;

  const chips: { id: string; label: string; icon?: LucideIcon }[] = isNumber
    ? HOUSEHOLD.filter((n) => n >= (question.min ?? 1) && n <= (question.max ?? 8)).map((n) => ({
        id: String(n),
        label: n === 1 ? "Just me" : `${n} people`,
        icon: n === 1 ? UserRound : Users,
      }))
    : multi || question.type === "single_select"
      ? question.options.map((o) => ({ ...o, icon: ICON[o.id] }))
      : [];

  const toggle = (id: string) => {
    if (EXCLUSIVE.has(id)) return setPicked((p) => (p.includes(id) ? [] : [id]));
    setPicked((p) => {
      const base = p.filter((x) => !EXCLUSIVE.has(x));
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

  const tap = (id: string) => {
    if (disabled) return;
    if (isNumber) return onAnswer({ question_id: question.id, value: Number(id) });
    if (!multi) return onAnswer({ question_id: question.id, selected_option_ids: [id] });
    toggle(id);
  };

  return (
    <div className="pl-11">
      {confirm ? (
        <motion.button
          ref={first}
          type="button"
          disabled={disabled}
          onClick={() => onAnswer(confirm.answer)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.96 }}
          className="mb-2.5 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-4 py-2 text-[14.5px] font-bold text-on-brand hover:bg-brand-hover disabled:opacity-50"
        >
          <Check aria-hidden className="size-4" /> {confirm.label}
        </motion.button>
      ) : null}
      <div role="group" aria-label={question.prompt} className="flex flex-wrap gap-2">
        {chips.map((chip, i) => {
          const on = picked.includes(chip.id);
          const Icon = chip.icon;
          return (
            <motion.button
              key={chip.id}
              ref={i === 0 && !confirm ? first : undefined}
              type="button"
              aria-pressed={multi ? on : undefined}
              disabled={disabled}
              onClick={() => tap(chip.id)}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 30, delay: 0.04 * i }}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-[14.5px] font-bold transition-colors disabled:opacity-50",
                on
                  ? "border-brand bg-brand-soft text-brand-text shadow-[inset_0_0_0_1px_var(--brand)]"
                  : "border-line bg-surface hover:border-brand-line hover:bg-surface-2",
              )}
            >
              {on ? <Check aria-hidden className="size-4" /> : Icon ? <Icon aria-hidden className="size-4 text-brand-text" /> : null}
              {chip.label}
            </motion.button>
          );
        })}
      </div>
      {multi ? (
        <motion.button
          type="button"
          disabled={disabled || picked.length === 0}
          onClick={() => onAnswer({ question_id: question.id, selected_option_ids: picked })}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.04 * chips.length + 0.05 }}
          className="mt-3 inline-flex items-center gap-2 rounded-[11px] bg-brand px-4 py-2.5 text-[14px] font-bold text-on-brand hover:bg-brand-hover disabled:opacity-40"
        >
          {picked.length ? `Done, that's ${picked.length === 1 ? "it" : "all"}` : "Pick any that apply"}
          <ArrowRight aria-hidden className="size-4" />
        </motion.button>
      ) : null}
    </div>
  );
}
