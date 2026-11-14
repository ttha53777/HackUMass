"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useId, useState, type SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import { getPersonas } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinancialSummaryView, PersonaOut } from "@/lib/types";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function SimulatedBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-violet-700/30 bg-violet-50 px-2.5 py-0.5 text-sm font-medium text-violet-900 dark:border-violet-400/30 dark:bg-violet-950 dark:text-violet-100">
      <FlaskConical aria-hidden className="size-4" />
      Simulated data
    </span>
  );
}

export function FinancialSummaryCard({ summary }: { summary: FinancialSummaryView }) {
  return (
    <section
      aria-labelledby="summary-heading"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <SimulatedBadge />
      <div>
        <h2 id="summary-heading" className="text-lg font-semibold">
          From your simulated bank profile
        </h2>
        <p className="text-sm text-muted-foreground">
          {summary.source === "nessie_sandbox"
            ? "Read from the Capital One Nessie sandbox (demo data, not a real bank)"
            : "A built-in demo profile (not a real bank)"}
          , {formatDate(summary.period_start)} to {formatDate(summary.period_end)}.
        </p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Average deposits</dt>
          <dd className="text-base font-semibold">{money(summary.avg_monthly_deposits)} a month</dd>
        </div>
        {summary.avg_monthly_outflow !== null && (
          <div>
            <dt className="text-muted-foreground">Average bills and spending</dt>
            <dd className="text-base font-semibold">{money(summary.avg_monthly_outflow)} a month</dd>
          </div>
        )}
        {summary.utility_bill_signals.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Utility bills seen</dt>
            <dd>{summary.utility_bill_signals.join(", ")}</dd>
          </div>
        )}
      </dl>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">
        {summary.caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
        <li>We only treat the deposit amount as your income after you confirm it.</li>
      </ul>
    </section>
  );
}

type Props = {
  summary: FinancialSummaryView | null;
  /** Open on first render (the person just said yes to the offer). */
  openRequested: boolean;
  disabled: boolean;
  onUse: (personaId: string) => Promise<string | null>;
};

/**
 * Optional: pick a fictional bank profile to estimate income. Nothing is sent
 * until the person chooses a profile and ticks the consent box.
 */
export function EvidencePanel({ summary, openRequested, disabled, onUse }: Props) {
  const ids = useId();
  const [open, setOpen] = useState(openRequested);
  const [personas, setPersonas] = useState<PersonaOut[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOpenRequest, setLastOpenRequest] = useState(openRequested);

  // Opening on request is derived from props, not synced in an effect.
  if (openRequested !== lastOpenRequest) {
    setLastOpenRequest(openRequested);
    if (openRequested) setOpen(true);
  }

  useEffect(() => {
    if (!open || personas) return;
    let active = true;
    getPersonas()
      .then((list) => active && setPersonas(list))
      .catch(() => active && setLoadFailed(true));
    return () => {
      active = false;
    };
  }, [open, personas]);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (disabled) return;
    if (!chosen) return setError("Choose one of the simulated profiles.");
    if (!consent) return setError("Tick the box to confirm you want to use this simulated profile.");
    setError(null);
    const problem = await onUse(chosen);
    if (problem) setError(problem);
    else {
      setConsent(false);
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 print:hidden">
      {summary && <FinancialSummaryCard summary={summary} />}
      <details
        open={open}
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="rounded-xl border border-border"
      >
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {summary ? "Try a different simulated bank profile" : "Try a simulated bank profile (optional)"}
        </summary>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 border-t border-border p-4">
          <p className="text-sm text-muted-foreground">
            These are made-up people in a bank <span className="font-medium">sandbox</span> run for
            hackathons. No real bank account is ever connected. We read average deposits and bills,
            then ask you before treating anything as your income.
          </p>

          {loadFailed && (
            <p role="alert" className="text-sm font-medium text-destructive">
              We couldn’t load the simulated profiles. You can still type your own numbers.
            </p>
          )}
          {!personas && !loadFailed && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading simulated profiles…
            </p>
          )}

          {personas && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 font-medium">Choose a simulated profile</legend>
              {personas.map((persona) => (
                <label
                  key={persona.id}
                  className={cn(
                    "flex min-h-12 cursor-pointer gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted",
                    "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  )}
                >
                  <input
                    type="radio"
                    name={`${ids}-persona`}
                    value={persona.id}
                    checked={chosen === persona.id}
                    onChange={() => {
                      setChosen(persona.id);
                      setError(null);
                    }}
                    className="mt-1 size-5 shrink-0 accent-primary outline-none"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{persona.label}</span>
                    <span className="text-sm text-muted-foreground">{persona.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => {
                setConsent(event.target.checked);
                setError(null);
              }}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span>
              Use this simulated profile for this session. I understand it is demo data, not my real
              finances.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <div>
            <Button
              type="submit"
              disabled={disabled || !personas}
              focusableWhenDisabled
              className="h-11 px-5 text-base"
            >
              Use this simulated profile
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
}
