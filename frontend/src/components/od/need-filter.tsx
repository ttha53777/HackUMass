"use client";

import { cn } from "@/lib/utils";
import type { ProgramCard } from "@/lib/types";

const NEED_LABEL: Record<string, string> = {
  food: "Food & groceries",
  utilities: "Heat & utility bills",
  housing: "Rent or a place to stay",
  healthcare: "Medical care",
  transportation: "Getting around",
  mental_health: "Emotional support",
  legal: "Legal help",
  childcare: "Childcare",
  employment: "Work & training",
  safety: "Safety",
  taxes: "Tax help",
  phone_internet: "Phone & internet",
  seniors: "Older adults",
  pregnancy_baby: "Pregnancy & baby",
  disability: "Disability support",
};

/** Needs present among these cards, in a fixed order. */
export function needsIn(cards: ProgramCard[]): string[] {
  const present = new Set(cards.flatMap((c) => c.program.categories));
  return Object.keys(NEED_LABEL).filter((n) => present.has(n));
}

export const matchesNeed = (card: ProgramCard, need: string) => need === "all" || card.program.categories.includes(need);

/** Filter chips: "Everything" plus each need these programs cover. Hidden when there is only one. */
export function NeedFilter({ needs, value, onChange }: { needs: string[]; value: string; onChange: (need: string) => void }) {
  if (needs.length < 2) return null;
  return (
    <div role="group" aria-label="Filter by need" className="mb-4 flex flex-wrap gap-2">
      {["all", ...needs].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={cn(
            "rounded-full border px-[13px] py-2 text-xs font-extrabold",
            value === n ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-muted-foreground hover:text-ink",
          )}
        >
          {n === "all" ? "Everything" : NEED_LABEL[n]}
        </button>
      ))}
    </div>
  );
}
