"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Pencil } from "lucide-react";
import { useState } from "react";

import { isLive } from "@/lib/derive";
import type { SessionSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

import { answered, chosenLabels } from "./script";

const ROWS: { id: string; label: string; hint: string }[] = [
  { id: "needs", label: "Needs", hint: "Fills in when you say what's going on." },
  { id: "zip", label: "Area", hint: "Your ZIP decides which programs serve you." },
  { id: "household_size", label: "Household", hint: "Income limits depend on it." },
  { id: "household_who", label: "At home", hint: "Some programs are for certain ages." },
];

function valueOf(s: SessionSnapshot | null, id: string): string | null {
  const item = answered(s, id);
  if (!item) return null;
  if (id === "needs") return chosenLabels(item).join(", ") || item.display_value;
  if (id === "zip") return s?.region ? `${s.region.city} · ${item.display_value}` : item.display_value;
  if (id === "household_size") return item.display_value === "1" ? "Just you" : `${item.display_value} people`;
  return item.display_value;
}

/**
 * The profile the conversation is building, filling in as answers arrive.
 * Answered rows can be tapped to change them in the chat.
 */
export function ProfilePanel({
  name,
  snapshot,
  canEdit,
  onEdit,
}: {
  name: string;
  snapshot: SessionSnapshot | null;
  canEdit: boolean;
  onEdit: (questionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filled = ROWS.filter((r) => valueOf(snapshot, r.id)).length;
  const total = snapshot?.programs.length ?? 0;
  const inView = snapshot ? snapshot.programs.filter((c) => !c.assessment || isLive(c) || c.assessment.status === "already_receiving").length : 0;

  const body = (
    <>
      <ul className="flex flex-col">
        {ROWS.map((row) => {
          const value = valueOf(snapshot, row.id);
          return (
            <li key={row.id} className="border-b border-dashed border-brand-line py-3 last:border-0">
              <p className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-faint">{row.label}</p>
              <AnimatePresence mode="wait" initial={false}>
                {value ? (
                  <motion.button
                    key={value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      setOpen(false);
                      onEdit(row.id);
                    }}
                    aria-label={`${row.label}: ${value}. Change`}
                    initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="group flex w-full items-start justify-between gap-2 rounded-lg text-left text-[14px] font-bold leading-snug text-ink disabled:cursor-default"
                  >
                    <span>{value}</span>
                    {canEdit ? <Pencil aria-hidden className="mt-0.5 size-3.5 shrink-0 text-faint opacity-60 transition-opacity group-hover:opacity-100" /> : null}
                  </motion.button>
                ) : (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <span aria-hidden className="mb-1.5 block h-2 w-4/5 rounded-full bg-brand-line/70" />
                    <span aria-hidden className="mb-2 block h-2 w-1/2 rounded-full bg-brand-line/50" />
                    <p className="text-[12px] italic leading-snug text-faint">{row.hint}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 rounded-2xl bg-surface px-4 py-3.5">
        <div className="font-display text-[30px] font-extrabold tabular-nums leading-none tracking-[-0.045em]">
          <motion.span key={total} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="inline-block">
            {total || "—"}
          </motion.span>
          <small className="ml-1.5 text-sm font-bold tracking-normal text-faint">programs</small>
        </div>
        <p className="mb-2.5 mt-1 text-xs leading-relaxed text-muted-foreground">
          {total ? `${inView} still in view for you.` : "I'll check them once I know where you live."}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <motion.div
            className="h-full rounded-full bg-brand"
            initial={false}
            animate={{ width: total ? `${(inView / total) * 100}%` : "0%" }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
        </div>
      </div>
    </>
  );

  return (
    <aside aria-label="Your profile" className="min-[900px]:sticky min-[900px]:top-[84px] min-[900px]:self-start">
      {/* Wide screens: the full card. */}
      <div className="hidden rounded-[22px] border border-brand-line bg-brand-soft p-5 min-[900px]:block">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-[17px] font-extrabold tracking-[-0.03em]">{name ? `${name}'s profile` : "Your profile"}</h2>
          <span className="text-[11px] font-bold tabular-nums text-faint">{filled} of {ROWS.length}</span>
        </div>
        <p className="mb-1 text-xs text-muted-foreground">Fills in as we talk. Tap anything to change it.</p>
        {body}
      </div>

      {/* Narrow screens: a pill that opens the same card. */}
      <div className="min-[900px]:hidden">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-full border border-brand-line bg-brand-soft px-4 py-2.5 text-[13px] font-bold"
        >
          <span>{name ? `${name}'s profile` : "Your profile"}</span>
          <span className="flex gap-1" aria-hidden>
            {ROWS.map((r) => (
              <i key={r.id} className={cn("block size-1.5 rounded-full", valueOf(snapshot, r.id) ? "bg-brand" : "bg-brand-line")} />
            ))}
          </span>
          <span className="ml-auto tabular-nums text-faint">{total ? `${total} programs` : `${filled} of ${ROWS.length}`}</span>
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 rounded-[22px] border border-brand-line bg-brand-soft p-4">{body}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </aside>
  );
}
