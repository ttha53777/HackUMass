import { Check, CircleQuestionMark, LoaderCircle, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, lowerFirst } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CriterionResult, ProgramCard as ProgramCardData } from "@/lib/types";

import { ExternalLink } from "./external-link";
import { StatusBadge } from "./status";

const CRITERION: Record<CriterionResult["result"], { label: string; icon: typeof Check; tone: string }> = {
  met: { label: "Met", icon: Check, tone: "text-emerald-800 dark:text-emerald-300" },
  not_met: { label: "Not met", icon: X, tone: "text-red-800 dark:text-red-300" },
  unknown: { label: "To confirm", icon: CircleQuestionMark, tone: "text-muted-foreground" },
  later: { label: "Opens later", icon: CircleQuestionMark, tone: "text-muted-foreground" },
};

const CATEGORY_LABEL: Record<string, string> = {
  food: "Food",
  utilities: "Utilities",
  housing: "Housing",
  healthcare: "Healthcare",
  transportation: "Transportation",
  employment: "Work & income",
};

type Props = {
  card: ProgramCardData;
  fieldLabels: Record<string, string>;
  /** Missing fields the person skipped and can answer now: field -> question id. */
  answerable: Record<string, string>;
  /** Field the open follow-up question asks about, if any. */
  followUpField: string | null;
  disabled: boolean;
  onAnswer: (questionId: string) => void;
};

export function ProgramCard({
  card,
  fieldLabels,
  answerable,
  followUpField,
  disabled,
  onAnswer,
}: Props) {
  const { program, assessment, stale } = card;
  const requirements = new Map(program.requirements.map((r) => [r.id, r]));
  const missing = assessment?.missing_fields ?? [];
  const sources = (assessment?.source_urls ?? []).filter((url) => url !== program.info_url);

  return (
    <article
      aria-labelledby={`program-${program.id}`}
      aria-busy={stale || undefined}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-opacity",
        stale && "opacity-60",
      )}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {stale ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
              Updating…
            </span>
          ) : assessment ? (
            <StatusBadge status={assessment.status} />
          ) : (
            <span className="text-sm text-muted-foreground">Not checked yet</span>
          )}
          <Badge variant="outline" className="h-6 px-2 text-xs">
            {program.type === "government" ? "Government program" : "Community organization"}
          </Badge>
        </div>
        <div>
          <h4 id={`program-${program.id}`} className="text-base font-semibold leading-snug">
            {program.name}
          </h4>
          <p className="text-sm text-muted-foreground">
            {program.provider}
            <span aria-hidden> · </span>
            <span className="sr-only">. Helps with: </span>
            {program.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(", ")}
          </p>
        </div>
      </header>

      {assessment && !stale && <p>{assessment.explanation}</p>}

      {!stale && missing.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {missing.map((field) => {
            const label = lowerFirst(fieldLabels[field] ?? field.replaceAll("_", " "));
            if (field === followUpField) {
              return (
                <p key={field} className="text-sm font-medium">
                  Answering the question above about {label} will check this program.
                </p>
              );
            }
            const questionId = answerable[field];
            return questionId ? (
              <Button
                key={field}
                type="button"
                variant="outline"
                disabled={disabled}
                className="h-11 px-4 text-base"
                onClick={() => onAnswer(questionId)}
              >
                Add your {label}
              </Button>
            ) : null;
          })}
        </div>
      )}

      {assessment && assessment.criteria.length > 0 && (
        <details className="group rounded-lg border border-border">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50">
            Why we think this
          </summary>
          <ul className="flex flex-col gap-3 border-t border-border p-3">
            {assessment.criteria.map((criterion) => {
              const requirement = requirements.get(criterion.requirement_id);
              const meta = CRITERION[criterion.result];
              const Icon = meta.icon;
              return (
                <li key={criterion.requirement_id} className="flex gap-2 text-sm">
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", meta.tone)} />
                  <div className="flex flex-col gap-0.5">
                    <p>
                      <span className={cn("font-semibold", meta.tone)}>{meta.label}: </span>
                      {requirement?.text ?? "A requirement listed by the provider."}
                    </p>
                    {criterion.evidence && (
                      <p className="text-muted-foreground">{criterion.evidence}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <details className="group rounded-lg border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50">
          About this program
        </summary>
        <div className="flex flex-col gap-3 border-t border-border p-3 text-sm">
          <p>{program.description}</p>
          {program.contact && (
            <p>
              <span className="font-medium">How to reach them: </span>
              {program.contact}
            </p>
          )}
          {program.program_period && (
            <p>
              <span className="font-medium">Provider note: </span>
              {program.program_period}
            </p>
          )}
          {program.documents_needed === null ? (
            <p className="text-muted-foreground">The provider doesn’t list required documents.</p>
          ) : program.documents_needed.length === 0 ? (
            <p>The provider says no documents are needed.</p>
          ) : (
            <div>
              <p className="font-medium">What to have ready</p>
              <ul className="mt-1 list-disc pl-5">
                {program.documents_needed.map((doc) => (
                  <li key={doc}>{doc}</li>
                ))}
              </ul>
            </div>
          )}
          {program.unknowns.length > 0 && (
            <div>
              <p className="font-medium">Not stated by the provider</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {program.unknowns.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      <footer className="flex flex-col gap-1 text-sm">
        <div className="flex flex-wrap gap-x-4">
          <ExternalLink href={program.info_url}>Provider’s page</ExternalLink>
          {program.apply_url && <ExternalLink href={program.apply_url}>Apply online</ExternalLink>}
          {sources.map((url, index) => (
            <ExternalLink key={url} href={url}>
              {sources.length > 1 ? `Source ${index + 1}` : "Source for these rules"}
            </ExternalLink>
          ))}
        </div>
        <p className="text-muted-foreground">
          Information as of {formatDate(program.verified_on)}.{" "}
          {assessment?.disclaimer ??
            "Only the program’s provider can determine eligibility."}
        </p>
      </footer>
    </article>
  );
}
