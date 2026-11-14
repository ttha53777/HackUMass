import {
  ArrowRight,
  CircleCheck,
  CircleEllipsis,
  CircleMinus,
  CircleQuestionMark,
  Clock,
  Info,
  ListChecks,
  TriangleExclamationPoint,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ActionItem, EligibilityStatus } from "@/lib/types";

type Meta = { label: string; icon: LucideIcon; tone: string };

/**
 * Every status is shown as icon + words; colour is only a third cue. Tones keep
 * text at a readable contrast in light and dark themes.
 */
export const STATUS: Record<EligibilityStatus, Meta & { group: string }> = {
  likely_eligible: {
    label: "Likely a fit",
    group: "Likely a fit",
    icon: CircleCheck,
    tone: "border-emerald-700/30 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950 dark:text-emerald-100",
  },
  possibly_eligible: {
    label: "Possibly a fit",
    group: "Possibly a fit",
    icon: CircleQuestionMark,
    tone: "border-sky-700/30 bg-sky-50 text-sky-900 dark:border-sky-400/30 dark:bg-sky-950 dark:text-sky-100",
  },
  insufficient_information: {
    label: "More information needed",
    group: "Need more information",
    icon: CircleEllipsis,
    tone: "border-amber-700/30 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-100",
  },
  likely_ineligible: {
    label: "May not fit",
    group: "May not fit",
    icon: CircleMinus,
    tone: "border-border bg-muted text-foreground",
  },
};

export const STATUS_ORDER: EligibilityStatus[] = [
  "likely_eligible",
  "possibly_eligible",
  "insufficient_information",
  "likely_ineligible",
];

export const ACTION: Record<ActionItem["action_type"], Meta> = {
  apply_now: { label: "Start now", icon: ArrowRight, tone: STATUS.likely_eligible.tone },
  confirm_eligibility: {
    label: "Check if you qualify",
    icon: ListChecks,
    tone: STATUS.possibly_eligible.tone,
  },
  get_more_information: {
    label: "Find out more",
    icon: Info,
    tone: STATUS.insufficient_information.tone,
  },
};

const URGENCY: Partial<Record<ActionItem["urgency"], Meta>> = {
  high: {
    label: "Urgent",
    icon: TriangleExclamationPoint,
    tone: "border-red-700/30 bg-red-50 text-red-900 dark:border-red-400/30 dark:bg-red-950 dark:text-red-100",
  },
  medium: {
    label: "Act soon",
    icon: Clock,
    tone: "border-amber-700/30 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-100",
  },
};

function Chip({ meta, className }: { meta: Meta; className?: string }) {
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium",
        meta.tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {meta.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: EligibilityStatus }) {
  return <Chip meta={STATUS[status]} />;
}

export function ActionBadge({ action }: { action: ActionItem["action_type"] }) {
  return <Chip meta={ACTION[action]} />;
}

/** Nothing for low or unknown urgency: we only flag what the user's answers support. */
export function UrgencyBadge({ urgency }: { urgency: ActionItem["urgency"] }) {
  const meta = URGENCY[urgency];
  return meta ? <Chip meta={meta} /> : null;
}
