"use client";

// Small OpenDoor building blocks shared by Home, Benefits, Guide, Local and the drawer.
// Colors come only from the theme tokens in globals.css.
import { useState, type ReactNode } from "react";
import {
  Baby,
  Brain,
  Briefcase,
  Bus,
  Check,
  CircleAlert,
  CircleHelp,
  ExternalLink,
  Flame,
  HandHeart,
  House,
  Info,
  Landmark,
  Lock,
  Phone,
  Receipt,
  Scale,
  ShieldCheck,
  Stethoscope,
  Utensils,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";

import type { Tone } from "@/lib/derive";
import type { CheckKind, CheckView } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type BtnVariant = "primary" | "ghost" | "gov" | "text" | "link";

/** Class names for a button or link styled as one. */
export function btn(variant: BtnVariant = "primary", size: "md" | "sm" = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-bold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
    variant === "primary" && "bg-brand text-on-brand hover:bg-brand-hover",
    variant === "gov" && "bg-gov-ink text-surface hover:opacity-90",
    variant === "ghost" && "border border-line bg-surface text-brand-text hover:border-brand-line",
    variant === "text" && "bg-transparent px-1.5 text-muted-foreground hover:text-ink",
    variant === "link" && "gap-1.5 bg-transparent p-0 py-1 text-xs font-extrabold text-brand-text hover:underline [&_svg]:size-3.5",
    variant !== "link" && variant !== "text" && (size === "sm" ? "rounded-[9px] px-[13px] py-[9px] text-xs" : "rounded-[11px] px-5 py-[13px]"),
    variant === "text" && "py-2.5 text-[13px]",
    className,
  );
}

/** A link to a provider's site, opening in a new tab. URLs only ever come from program records. */
export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={(e) => e.stopPropagation()}>
      {children}
      <ExternalLink aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Status and kind
// ---------------------------------------------------------------------------

const TONE_CLASS: Record<Tone, string> = {
  fit: "bg-brand-soft text-brand-text",
  have: "bg-brand-soft text-brand-text",
  maybe: "bg-amber text-amber-ink",
  open: "bg-sky text-sky-ink",
  later: "bg-lav text-lav-ink",
  out: "bg-surface-2 text-muted-foreground",
  checking: "bg-surface-2 text-muted-foreground",
};

export const toneClass = (tone: Tone) => TONE_CLASS[tone];

export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("shrink-0 whitespace-nowrap rounded-full px-[9px] py-1 text-[10.5px] font-extrabold", TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}

export function KindTag({ track, long, className }: { track: "benefit" | "local"; long?: boolean; className?: string }) {
  const gov = track === "benefit";
  const Icon = gov ? Landmark : HandHeart;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-[7px] rounded-full py-[5px] pl-2 pr-[11px] text-[11px] font-extrabold tracking-[0.3px]",
        gov ? "bg-gov text-gov-ink" : "bg-loc text-loc-ink",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {gov ? (long ? "Government benefit" : "Government") : "Local help"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Category icon tile
// ---------------------------------------------------------------------------

export const CAT_ICON: Record<string, LucideIcon> = {
  food: Utensils,
  utilities: Flame,
  housing: House,
  healthcare: Stethoscope,
  transportation: Bus,
  mental_health: Brain,
  legal: Scale,
  childcare: Baby,
  employment: Briefcase,
  safety: ShieldCheck,
  taxes: Receipt,
  phone_internet: Wifi,
};

export const CAT_CLASS: Record<string, string> = {
  food: "bg-leaf text-leaf-ink",
  utilities: "bg-peach text-peach-ink",
  housing: "bg-amber text-amber-ink",
  healthcare: "bg-lav text-lav-ink",
  transportation: "bg-sky text-sky-ink",
  mental_health: "bg-lav text-lav-ink",
  legal: "bg-gov text-gov-ink",
  childcare: "bg-leaf text-leaf-ink",
  employment: "bg-sky text-sky-ink",
  safety: "bg-peach text-peach-ink",
  taxes: "bg-amber text-amber-ink",
  phone_internet: "bg-sky text-sky-ink",
};

export function CatIcon({ category, className }: { category: string | undefined; className?: string }) {
  const Icon = CAT_ICON[category ?? ""] ?? HandHeart;
  return (
    <span className={cn("grid size-[42px] shrink-0 place-items-center rounded-[13px]", CAT_CLASS[category ?? ""] ?? "bg-surface-2 text-brand-text", className)}>
      <Icon aria-hidden className="size-5" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Copyable phone number and text
// ---------------------------------------------------------------------------

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked: the text stays selectable on screen.
    }
  };
  return { copied, copy };
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void copy(text);
      }}
      className={cn("select-none rounded-[7px] bg-surface px-2 py-1 text-[10.5px] font-extrabold text-brand-text", className)}
    >
      {copied ? "Copied" : label}
      <span className="sr-only" aria-live="polite">{copied ? " to clipboard" : ""}</span>
    </button>
  );
}

/** A phone number you can tap to call or copy. Numbers only ever come from program records. */
export function CallChip({ phone, className }: { phone: string | null; className?: string }) {
  if (!phone) return null;
  const digits = phone.replace(/\s*ext\.?\s*/i, ",").replace(/[^\d,]/g, "");
  return (
    <span className={cn("inline-flex items-center gap-[7px] rounded-[9px] bg-surface-2 py-1.5 pl-2.5 pr-1.5 text-xs font-extrabold tabular-nums", className)}>
      <Phone aria-hidden className="size-[13px] text-brand-text" />
      <a href={`tel:${digits}`} className="select-all hover:underline" onClick={(e) => e.stopPropagation()}>
        {phone}
      </a>
      <CopyButton text={phone} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Callouts, reasons, section heads
// ---------------------------------------------------------------------------

export function Callout({ tone, children, className }: { tone: "warn" | "info" | "ok"; children: ReactNode; className?: string }) {
  const Icon = tone === "warn" ? CircleAlert : tone === "ok" ? Check : Info;
  return (
    <div
      className={cn(
        "mt-3 flex items-start gap-2.5 rounded-[14px] px-3.5 py-3 text-[12.5px] leading-relaxed",
        tone === "warn" && "bg-amber text-amber-ink",
        tone === "info" && "bg-sky text-sky-ink",
        tone === "ok" && "bg-brand-soft text-brand-text",
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const REASON_ICON: Record<CheckKind, { icon: LucideIcon; className: string; sr: string }> = {
  pass: { icon: Check, className: "text-brand-text", sr: "Fits:" },
  have: { icon: Check, className: "text-brand-text", sr: "You have this:" },
  ask: { icon: CircleHelp, className: "text-amber-ink", sr: "Still to answer:" },
  unsure: { icon: CircleHelp, className: "text-amber-ink", sr: "Not stated:" },
  fail: { icon: X, className: "text-muted-foreground", sr: "May not fit:" },
  later: { icon: Lock, className: "text-lav-ink", sr: "Opens later:" },
  note: { icon: Info, className: "text-sky-ink", sr: "Note:" },
};

/** The "why" list. Text is the provider's requirement text, passed through as plain text. */
export function ReasonsList({ checks }: { checks: Pick<CheckView, "kind" | "text">[] }) {
  if (!checks.length) return null;
  return (
    <ul className="grid gap-[7px]">
      {checks.map((c, i) => {
        const { icon: Icon, className, sr } = REASON_ICON[c.kind];
        return (
          <li key={`${c.kind}-${i}`} className="flex gap-[9px] text-[13px] leading-[1.55]">
            <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", className)} />
            <span>
              <span className="sr-only">{sr} </span>
              {c.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function SectionHead({ title, sub, children, as: H = "h2" }: { title: string; sub?: ReactNode; children?: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2.5">
      <H className="m-0 text-lg font-extrabold tracking-[-0.6px]">{title}</H>
      {sub ? <span className="text-xs font-medium text-faint">{sub}</span> : null}
      {children}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[20px] border border-line bg-surface p-5 shadow-card", className)}>{children}</div>;
}

export function ProgressBar({ value, total, className, track = "bg-line" }: { value: number; total: number; className?: string; track?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full", track, className)} aria-hidden>
      <div className="h-full bg-brand transition-[width] duration-400" style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
    </div>
  );
}

/** A small progress ring, "3/5". */
export function Ring({ value, total }: { value: number; total: number }) {
  const r = 23;
  const c = 2 * Math.PI * r;
  const f = total ? value / total : 0;
  return (
    <svg viewBox="0 0 54 54" className="size-[54px] shrink-0" role="img" aria-label={`${value} of ${total} steps done`}>
      <circle cx="27" cy="27" r={r} fill="none" strokeWidth="6" className="stroke-plan-track" />
      <circle
        cx="27"
        cy="27"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        className="stroke-brand transition-[stroke-dashoffset] duration-500"
        strokeDasharray={c.toFixed(1)}
        strokeDashoffset={(c * (1 - f)).toFixed(1)}
        transform="rotate(-90 27 27)"
      />
      <text x="27" y="31.5" textAnchor="middle" className="fill-ink font-display text-[13px] font-extrabold">
        {value}/{total}
      </text>
    </svg>
  );
}

/** The potential-eligibility disclaimer, on every surface that shows a status. */
export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] leading-relaxed text-faint", className)}>
      These are possible matches, not official decisions. Only each provider decides who qualifies.
    </p>
  );
}
