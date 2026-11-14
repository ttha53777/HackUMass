import { Info, MapPinOff, SearchX } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";
import type { EligibilityStatus, ProgramCard as ProgramCardData, SessionSnapshot } from "@/lib/types";

import { ProgramCard } from "./program-card";
import { Roadmap } from "./roadmap";
import { STATUS, STATUS_ORDER } from "./status";

type Props = {
  snapshot: SessionSnapshot;
  /** The open follow-up question, rendered at the top of the results. */
  followUp: ReactNode;
  /** Optional simulated bank profile panel, shown after the plan. */
  evidence?: ReactNode;
  disabled: boolean;
  /** Re-open an earlier question (by id) for a new answer. */
  onEditQuestion: (questionId: string) => void;
};

const TALLY_WORDS: Record<EligibilityStatus, [string, string]> = {
  likely_eligible: ["likely fit", "likely fits"],
  possibly_eligible: ["possible fit", "possible fits"],
  insufficient_information: ["needs more information", "need more information"],
  likely_ineligible: ["may not fit", "may not fit"],
};

function EmptyState({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby="empty-heading"
      className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5"
    >
      <Icon aria-hidden className="size-6 text-muted-foreground" />
      <h2 id="empty-heading" className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** True once at least one program has been checked: the moment results are worth showing. */
export function hasResults(snapshot: SessionSnapshot): boolean {
  return snapshot.programs.some((card) => card.assessment !== null);
}

export function ResultsView({ snapshot, followUp, evidence, disabled, onEditQuestion }: Props) {
  const notice = (code: string) => snapshot.notices.find((n) => n.code === code)?.message;

  if (snapshot.coverage === "unsupported") {
    return (
      <EmptyState icon={MapPinOff} title="We don’t cover that area yet">
        <p>{notice("unsupported_region")}</p>
        <p className="text-sm text-muted-foreground">
          We only show programs we have checked by hand, so we won’t guess about other areas.
        </p>
        <Button className="h-11 px-5 text-base" disabled={disabled} onClick={() => onEditQuestion("zip")}>
          Change ZIP code
        </Button>
      </EmptyState>
    );
  }

  if (snapshot.coverage === "supported" && snapshot.programs.length === 0) {
    return (
      <EmptyState icon={SearchX} title="No programs found for those needs">
        <p>{notice("no_matches")}</p>
        <Button className="h-11 px-5 text-base" disabled={disabled} onClick={() => onEditQuestion("needs")}>
          Change what you need help with
        </Button>
      </EmptyState>
    );
  }

  if (!hasResults(snapshot)) return null;

  const programs = new Map(snapshot.programs.map((card) => [card.program.id, card.program]));
  const groups = new Map<EligibilityStatus | "unchecked", ProgramCardData[]>();
  for (const card of snapshot.programs) {
    const key = card.assessment?.status ?? "unchecked";
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  const tally = STATUS_ORDER.filter((s) => groups.get(s)?.length).map((s) => {
    const count = groups.get(s)!.length;
    return `${count} ${TALLY_WORDS[s][count === 1 ? 0 : 1]}`;
  });

  const answerable: Record<string, string> = {};
  for (const item of snapshot.answered) {
    if (item.skipped) answerable[item.question.target_field] = item.question_id;
  }
  const followUpField = snapshot.pending_question?.target_field ?? null;
  const place = snapshot.region ? `${snapshot.region.city} (${snapshot.region.zip})` : "you";

  const cardProps = {
    fieldLabels: snapshot.field_labels,
    answerable,
    followUpField,
    disabled,
    onAnswer: onEditQuestion,
  };
  const ineligible = groups.get("likely_ineligible") ?? [];

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="results-heading" className="flex flex-col gap-3">
        <h2 id="results-heading" className="text-2xl font-semibold tracking-tight">
          Here’s what we found near {place}
        </h2>
        <p className="text-muted-foreground">
          {plural(snapshot.programs.length, "program")}: {tally.join(" · ")}
        </p>
        <div className="flex gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">
          <Info aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>
            <span className="font-semibold">This is a guide, not a decision.</span> Results are
            preliminary and for information only. Only each program’s provider can decide whether
            you qualify. We never apply on your behalf.
          </p>
        </div>
      </section>

      {followUp}

      <Roadmap plan={snapshot.action_plan} programs={programs} stale={snapshot.plan_stale} />

      {evidence}

      <section aria-labelledby="programs-heading" className="flex flex-col gap-4 print:hidden">
        <div>
          <h2 id="programs-heading" className="text-xl font-semibold tracking-tight">
            All programs near {place}
          </h2>
          <p className="text-muted-foreground">
            Open “Why we think this” on any program to see each requirement and how it compares
            with your answers.
          </p>
        </div>

        {(["unchecked", "likely_eligible", "possibly_eligible", "insufficient_information"] as const).map(
          (key) => {
            const cards = groups.get(key);
            if (!cards?.length) return null;
            const title = key === "unchecked" ? "Being checked" : STATUS[key].group;
            return (
              <section key={key} aria-labelledby={`group-${key}`} className="flex flex-col gap-3">
                <h3 id={`group-${key}`} className="text-lg font-semibold">
                  {title} <span className="font-normal text-muted-foreground">({cards.length})</span>
                </h3>
                {cards.map((card) => (
                  <ProgramCard key={card.program.id} card={card} {...cardProps} />
                ))}
              </section>
            );
          },
        )}

        {ineligible.length > 0 && (
          <details className="rounded-xl border border-border">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-lg font-semibold outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {STATUS.likely_ineligible.group}
              <span className="ml-1.5 font-normal text-muted-foreground">({ineligible.length})</span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-border p-3">
              <p className="text-sm text-muted-foreground">
                Based on your answers, these programs may not fit. Each one says why, so you can
                correct an answer if we have it wrong.
              </p>
              {ineligible.map((card) => (
                <ProgramCard key={card.program.id} card={card} {...cardProps} />
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
