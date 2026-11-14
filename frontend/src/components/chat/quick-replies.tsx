"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Baby, Brain, Briefcase, Bus, Check, ChevronDown, Flame, House, Minus, Receipt, Scale, ShieldCheck, Stethoscope, UserRound, Users, Utensils, Wifi, type LucideIcon } from "lucide-react";

import type { AnswerIn, Question } from "@/lib/types";
import { cn } from "@/lib/utils";

import { optionLabel } from "./script";

const ICON: Record<string, LucideIcon> = {
  food: Utensils,
  utilities: Flame,
  housing: House,
  healthcare: Stethoscope,
  transportation: Bus,
  employment: Briefcase,
  mental_health: Brain,
  legal: Scale,
  childcare: Baby,
  safety: ShieldCheck,
  taxes: Receipt,
  phone_internet: Wifi,
  "60": UserRound,
  "55": UserRound,
  child: Baby,
  none: Minus,
};

/** Options that clear every other choice (and are cleared by any other). */
const EXCLUSIVE = new Set(["none"]);

const HOUSEHOLD = [1, 2, 3, 4, 5, 6];

/** How many needs chips show before "more options". */
const STARTER = 6;

/** Options with the given ids first (in that order), then the rest as they were. */
function ordered<T extends { id: string }>(options: T[], first: string[]): T[] {
  const rank = new Map(first.map((id, i) => [id, i] as const));
  return [...options].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
}

/**
 * Tap-to-answer chips under the latest question. Single choices send on tap;
 * multiple choices collect, then send with Done. Focus lands on the first chip.
 */
export function QuickReplies({
  question,
  initial,
  confirm,
  first: firstId,
  priority,
  skip,
  pause,
  decline,
  disabled,
  onAnswer,
}: {
  question: Question;
  initial?: string[];
  /** A "Yes, that's right" chip for something the person already said. */
  confirm?: { label: string; answer: AnswerIn };
  /** Show this option first (e.g. a place to stay, after a safety message). */
  first?: string;
  /** Options to show first, in order (what the person's words point to). */
  priority?: string[];
  /** Offer a quiet "Skip" for a question that can be skipped. */
  skip?: boolean;
  /** Offer a soft "Not right now" that pauses the conversation. */
  pause?: () => void;
  /** A quiet way to say no to an optional offer ("No, that's everything"). */
  decline?: { label: string; onClick: () => void };
  disabled: boolean;
  onAnswer: (answer: AnswerIn) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial ?? []);
  const [expanded, setExpanded] = useState(false);
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
      ? ordered(question.options, [...(firstId ? [firstId] : []), ...(priority ?? [])]).map((o) => ({
          id: o.id,
          label: optionLabel(question, o.id, o.label),
          icon: ICON[o.id],
        }))
      : [];
  // A long list (the needs question) starts with the first few; the rest are a tap away.
  const collapsible = question.id === "needs" && chips.length > STARTER + 1;
  const hidden = collapsible && !expanded ? chips.filter((c, i) => i >= STARTER && !picked.includes(c.id)) : [];
  const visible = chips.filter((c) => !hidden.includes(c));

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
        {visible.map((chip, i) => {
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
        {hidden.length ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-line px-4 py-2 text-[14px] font-semibold text-muted-foreground hover:border-brand-line hover:text-ink"
          >
            {hidden.length} more options <ChevronDown aria-hidden className="size-4" />
          </button>
        ) : null}
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
          {picked.length ? `Continue (${picked.length})` : "Continue"}
          <ArrowRight aria-hidden className="size-4" />
        </motion.button>
      ) : null}
      {skip || pause || decline ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {skip ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAnswer({ question_id: question.id, skipped: true })}
              className="rounded-lg px-1 py-1.5 text-[13.5px] font-semibold text-muted-foreground underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
            >
              Skip this one
            </button>
          ) : null}
          {decline ? (
            <button
              type="button"
              disabled={disabled}
              onClick={decline.onClick}
              className="rounded-lg px-1 py-1.5 text-[13.5px] font-semibold text-muted-foreground underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
            >
              {decline.label}
            </button>
          ) : null}
          {pause ? (
            <button
              type="button"
              disabled={disabled}
              onClick={pause}
              className="rounded-lg px-1 py-1.5 text-[13.5px] font-semibold text-muted-foreground underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
            >
              Not right now
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
