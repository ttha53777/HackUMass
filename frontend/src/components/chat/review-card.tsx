"use client";

import { motion } from "motion/react";
import { ArrowRight, Pencil } from "lucide-react";

import { Avatar } from "./bubbles";
import type { ReviewRow } from "./script";

/** Everything the person told us, to look over before the plan is built. */
export function ReviewCard({
  rows,
  disabled,
  onChange,
  onDone,
}: {
  rows: ReviewRow[];
  disabled: boolean;
  onChange: (questionId: string) => void;
  onDone: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="flex items-start gap-3"
    >
      <Avatar />
      <section aria-label="Your answers" className="w-full max-w-[560px] overflow-hidden rounded-[20px] border border-line bg-surface shadow-card">
        <header className="border-b border-line px-5 pb-3 pt-4">
          <h2 className="font-display text-[19px] font-extrabold tracking-[-0.03em]">Here&apos;s what I have</h2>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">Does this look right? Tap anything to change it.</p>
        </header>
        <ul>
          {rows.map((row, i) => (
            <motion.li
              key={row.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className="border-b border-line last:border-0"
            >
              <button
                type="button"
                disabled={disabled || row.locked}
                onClick={() => onChange(row.id)}
                aria-label={row.locked ? `${row.label}: ${row.value}` : `${row.label}: ${row.value}. Change`}
                className="group flex w-full items-start gap-4 px-5 py-3 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="w-[104px] shrink-0 pt-px text-[12px] font-extrabold uppercase tracking-[1.2px] text-faint">{row.label}</span>
                <span className={row.value === "Skipped" ? "flex-1 text-[14.5px] italic text-muted-foreground" : "flex-1 text-[14.5px] font-bold text-ink"}>
                  {row.value}
                  {row.note ? <span className="mt-0.5 block text-[12px] font-medium text-muted-foreground">{row.note}</span> : null}
                </span>
                {row.locked ? null : (
                  <span aria-hidden className="flex items-center gap-1 pt-0.5 text-xs font-semibold text-faint opacity-70 group-hover:opacity-100">
                    <Pencil className="size-3" /> Change
                  </span>
                )}
              </button>
            </motion.li>
          ))}
        </ul>
        <footer className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-2/60 px-5 py-4">
          <motion.button
            type="button"
            disabled={disabled}
            onClick={onDone}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-[12px] bg-brand px-6 py-3 font-bold text-on-brand hover:bg-brand-hover disabled:opacity-50"
          >
            Done <ArrowRight aria-hidden className="size-4" />
          </motion.button>
          <span className="text-xs text-muted-foreground">I&apos;ll build your plan from this.</span>
        </footer>
      </section>
    </motion.div>
  );
}
