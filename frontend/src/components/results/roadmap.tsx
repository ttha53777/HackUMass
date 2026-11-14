"use client";

import { LoaderCircle, Printer } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActionItem, Program } from "@/lib/types";

import { ExternalLink } from "./external-link";
import { ActionBadge, UrgencyBadge } from "./status";

// Long plans are shortened on screen so the first steps stay in view. Print
// always shows every step.
const FIRST_STEPS = 5;

type Props = {
  plan: ActionItem[];
  programs: Map<string, Program>;
  stale: boolean;
};

export function Roadmap({ plan, programs, stale }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (plan.length === 0) return null;
  const hidden = plan.length - FIRST_STEPS;

  return (
    <section aria-labelledby="plan-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="plan-heading" className="text-xl font-semibold tracking-tight">
            Your next steps
          </h2>
          <p className="text-muted-foreground">
            Start at the top: these are ordered by how likely they are to help, and how quickly.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-2 px-4 text-base print:hidden"
          onClick={() => window.print()}
        >
          <Printer aria-hidden className="size-4" />
          Print or save
        </Button>
      </div>

      {stale && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
          Updating your plan with your latest answers…
        </p>
      )}

      <ol className={cn("flex flex-col gap-3 transition-opacity", stale && "opacity-60")}>
        {plan.map((item, index) => {
          const program = programs.get(item.program_id);
          if (!program) return null;
          const collapsed = !showAll && index >= FIRST_STEPS;
          return (
            <li
              key={item.program_id}
              className={cn(
                "flex gap-3 rounded-xl border border-border bg-card p-4 break-inside-avoid",
                collapsed && "hidden print:flex",
              )}
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              >
                {item.rank}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold leading-snug">
                    <span className="sr-only">Step {item.rank}: </span>
                    {program.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{program.provider}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionBadge action={item.action_type} />
                  <UrgencyBadge urgency={item.urgency} />
                </div>
                <p className="text-sm text-muted-foreground">{item.rationale}</p>
                <p className="font-medium">{item.next_step}</p>

                {item.documents && item.documents.length > 0 && (
                  <div>
                    <p className="text-sm font-medium">What to have ready</p>
                    <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm">
                      {item.documents.map((doc) => (
                        <li key={doc}>{doc}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.documents && item.documents.length === 0 && (
                  <p className="text-sm">The provider says no documents are needed.</p>
                )}
                {item.uncertainty && (
                  <p className="text-sm text-muted-foreground">{item.uncertainty}</p>
                )}

                <div className="pt-1">
                  <ExternalLink
                    href={item.link}
                    variant={item.action_type === "apply_now" ? "button" : "outline"}
                  >
                    {item.link === program.apply_url ? "Apply online" : "Visit the provider’s page"}
                  </ExternalLink>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {hidden > 0 && (
        <div className="print:hidden">
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4 text-base"
            aria-expanded={showAll}
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Show fewer steps" : `Show ${plural(hidden, "more step")}`}
          </Button>
        </div>
      )}
    </section>
  );
}
