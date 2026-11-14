"use client";

import { motion } from "motion/react";
import { HeartHandshake, Pencil, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const rise = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.7 },
};

export function Avatar({ hidden }: { hidden?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-[11px] border border-brand-line bg-brand-soft text-brand-text",
        hidden && "invisible",
      )}
    >
      <Sparkles className="size-4" />
    </span>
  );
}

/** A navigator message. `lead` messages carry the avatar; follow-ons line up beneath it. */
export function BotMessage({
  children,
  lead = true,
  tone = "plain",
  animate = true,
}: {
  children: ReactNode;
  lead?: boolean;
  tone?: "plain" | "question" | "warn";
  animate?: boolean;
}) {
  return (
    <motion.div {...(animate ? rise : {})} className="flex items-start gap-3">
      <Avatar hidden={!lead} />
      <div
        className={cn(
          "min-w-0 max-w-[640px] pt-1 leading-[1.6]",
          tone === "question" && "font-display text-[clamp(19px,2.2vw,23px)] font-extrabold leading-[1.3] tracking-[-0.03em] text-ink",
          tone === "plain" && "text-[15.5px] text-muted-foreground",
          tone === "warn" && "rounded-xl bg-amber px-3.5 py-2.5 text-[14px] text-amber-ink",
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}

/** What the person said, on the right. With `onEdit`, it can be tapped to change the answer. */
export function UserMessage({
  children,
  animate = true,
  onEdit,
}: {
  children: ReactNode;
  animate?: boolean;
  onEdit?: () => void;
}) {
  const bubble =
    "max-w-[min(480px,85%)] rounded-[18px] rounded-br-md bg-brand px-4 py-2.5 text-left text-[15px] font-semibold leading-snug text-on-brand shadow-card";
  return (
    <motion.div
      {...(animate
        ? { ...rise, initial: { opacity: 0, y: 26, scale: 0.94 }, style: { originX: 1, originY: 1 } }
        : {})}
      className="group flex items-center justify-end gap-2"
    >
      {onEdit ? (
        <>
          <span aria-hidden className="flex items-center gap-1 text-xs font-semibold text-faint opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <Pencil className="size-3" /> Change
          </span>
          <button type="button" onClick={onEdit} className={bubble} aria-label={`${typeof children === "string" ? children : "Your answer"}. Change this answer`}>
            {children}
          </button>
        </>
      ) : (
        <p className={bubble}>{children}</p>
      )}
    </motion.div>
  );
}

/** The fixed safety message, shown when a message suggests danger or crisis. */
export function SafetyCard({
  title,
  lines,
  contacts = [],
}: {
  title: string;
  lines: string[];
  /** Verified lines from curated records (name, contact, link). */
  contacts?: { name: string; contact: string; info_url: string }[];
}) {
  return (
    <motion.div {...rise} role="note" className="flex items-start gap-3">
      <Avatar />
      <div className="max-w-[560px] rounded-[18px] border border-peach-ink/25 bg-peach px-4 py-3.5 text-peach-ink">
        <p className="flex items-center gap-2 font-display text-[16px] font-extrabold tracking-[-0.02em]">
          <HeartHandshake aria-hidden className="size-[18px]" /> {title}
        </p>
        {lines.map((line) => (
          <p key={line} className="mt-1 text-[14.5px] font-semibold leading-relaxed">
            {line}
          </p>
        ))}
        {contacts.length ? (
          <ul className="mt-3 flex flex-col gap-2 border-t border-peach-ink/20 pt-3">
            {contacts.map((c) => (
              <li key={c.info_url} className="text-[13.5px] leading-snug">
                <a href={c.info_url} target="_blank" rel="noreferrer" className="font-bold underline-offset-4 hover:underline">
                  {c.name}
                </a>
                <span className="block font-medium opacity-90">{c.contact}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </motion.div>
  );
}

/** Three bouncing dots while the navigator "types" or the backend works. */
export function TypingBubble({ lead = true }: { lead?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
      transition={rise.transition}
      className="flex items-start gap-3"
    >
      <Avatar hidden={!lead} />
      <span className="sr-only">The navigator is typing</span>
      <span aria-hidden className="flex h-10 items-center gap-1.5 rounded-[16px] rounded-tl-md border border-line bg-surface px-4 shadow-card">
        {[0, 1, 2].map((i) => (
          <motion.i
            key={i}
            className="block size-[7px] rounded-full bg-faint"
            animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </span>
    </motion.div>
  );
}
