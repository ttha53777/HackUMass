"use client";

// Archived: not used by the live app (not routed). The live UI is components/hub/; see app/(opendoor)/_archive/legacy-dashboard/README.md.
import { motion } from "motion/react";
import { AlertTriangle, FileCheck2, Landmark, Pencil } from "lucide-react";
import { useState } from "react";

import { btn } from "@/components/od/ui";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import type { PendingReview, ReviewRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Rows the person can correct by typing a number; choices are settled by untick + the question. */
const editableNumber = (row: ReviewRow) => typeof row.value === "number";

/**
 * One review card per paper the Document Agent read: "Here's what we read from
 * your pay stub." Nothing on it is used until the person says it looks right.
 * Ticked rows are confirmed, a typed correction becomes their own answer, and
 * unticked rows are dropped (a row that disagreed leaves their answer as it was).
 */
export function PaperReview({ review }: { review: PendingReview }) {
  const { submitReview, whenIdle, working } = useApp();
  const toast = useToast();
  const [ticked, setTicked] = useState<Set<string>>(
    // A row that disagrees with what we have starts unticked: ticking it replaces that answer.
    () => new Set(review.rows.filter((r) => !r.in_conflict).map((r) => r.field)),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const toggle = (field: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });

  const send = async () => {
    const parsed: Record<string, number> = {};
    for (const [field, text] of Object.entries(edits)) {
      if (!ticked.has(field)) continue;
      const n = Number(text.replace(/[$,\s]/g, ""));
      if (text.trim() === "" || !Number.isFinite(n) || n < 0) return toast("Enter a number, or untick that row.");
      parsed[field] = n;
    }
    setSending(true);
    try {
      await whenIdle();
      const error = await submitReview({
        document_id: review.document_id,
        accept: [...ticked].filter((f) => !(f in parsed)),
        edits: parsed,
      });
      await whenIdle();
      toast(error ?? (ticked.size ? "Thanks. We'll use what you confirmed." : `Okay, we won't use anything from ${review.simulated ? review.title : "that paper"}.`));
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      aria-label={review.simulated ? `What ${review.title} suggests` : `What we read from ${review.title}`}
      className="rounded-[16px] border border-line bg-surface p-4 shadow-card"
    >
      <div className="mb-2 flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-text">
          {review.simulated ? <Landmark aria-hidden className="size-4" /> : <FileCheck2 aria-hidden className="size-4" />}
        </span>
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-[14.5px] font-extrabold">
            {review.simulated ? <>Here&apos;s what {review.title} suggests</> : <>Here&apos;s what we read from {review.title}</>}
            {review.simulated ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.8px] text-muted-foreground">
                Simulated
              </span>
            ) : null}
          </h3>
          <p className="text-[12px] text-muted-foreground">Untick anything that&apos;s wrong. We use nothing until you say so.</p>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-line">
        {review.rows.map((row) => {
          const on = ticked.has(row.field);
          return (
            <li key={row.field} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-[13px]">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(row.field)}
                  className="size-4 shrink-0 accent-[var(--brand)]"
                />
                <span className={cn("min-w-0", !on && "text-faint line-through")}>
                  <span className="block text-[11.5px] font-bold text-muted-foreground">{row.label}</span>
                  {editing === row.field ? null : <strong className="block">{edits[row.field] ? `${edits[row.field]} (your correction)` : row.display}</strong>}
                </span>
              </label>
              {editing === row.field ? (
                <input
                  autoFocus
                  inputMode="decimal"
                  aria-label={`Correct ${row.label}`}
                  defaultValue={edits[row.field] ?? String(row.value ?? "")}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    setEdits((cur) => {
                      const next = { ...cur };
                      if (v && v !== String(row.value)) next[row.field] = v;
                      else delete next[row.field];
                      return next;
                    });
                    setEditing(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="w-[130px] rounded-[9px] border border-brand bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none"
                />
              ) : editableNumber(row) && on ? (
                <button type="button" className={btn("ghost", "sm")} onClick={() => setEditing(row.field)}>
                  <Pencil aria-hidden className="size-3.5" /> Fix
                </button>
              ) : null}
              {row.in_conflict ? (
                <span className="flex w-full items-center gap-1.5 text-[11.5px] font-bold text-amber-ink">
                  <AlertTriangle aria-hidden className="size-3.5" />
                  {on ? "This will replace what we have now." : "Doesn't match what we have. Tick it to use this instead."}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {review.notes.map((note) => (
        <p key={note} className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          {note}
        </p>
      ))}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn("primary", "sm")} disabled={sending || working || editing !== null} onClick={() => void send()}>
          {sending ? "Saving…" : ticked.size ? "Looks right" : "Don't use any of it"}
        </button>
      </div>
    </motion.article>
  );
}

/** Every paper still waiting for the person's say-so. Renders nothing when there are none. */
export function PaperReviews({ className }: { className?: string }) {
  const { snapshot } = useApp();
  const reviews = snapshot?.pending_reviews ?? [];
  if (!reviews.length) return null;
  return (
    <section aria-label="Papers to check" className={cn("flex flex-col gap-3", className)}>
      {reviews.map((r) => (
        <PaperReview key={r.document_id} review={r} />
      ))}
    </section>
  );
}
