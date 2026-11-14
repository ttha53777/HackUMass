"use client";

import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
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

/** What the person said, on the right. */
export function UserMessage({ children, animate = true }: { children: ReactNode; animate?: boolean }) {
  return (
    <motion.div
      {...(animate
        ? { ...rise, initial: { opacity: 0, y: 26, scale: 0.94 }, style: { originX: 1, originY: 1 } }
        : {})}
      className="flex justify-end"
    >
      <p className="max-w-[min(480px,85%)] rounded-[18px] rounded-br-md bg-brand px-4 py-2.5 text-[15px] font-semibold leading-snug text-on-brand shadow-card">
        {children}
      </p>
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
