import type { EligibilityStatus, SessionSnapshot } from "@/lib/types";

const STATUS_LABEL: Record<EligibilityStatus, string> = {
  likely_eligible: "Likely a fit",
  possibly_eligible: "Possibly a fit",
  likely_ineligible: "Probably not a fit",
  insufficient_information: "More information needed",
};

/**
 * Plain list of programs and next steps so the intake has somewhere to land.
 * Ticket T13 replaces this with the full program cards and roadmap.
 */
export function ResultsPreview({ snapshot }: { snapshot: SessionSnapshot }) {
  const { programs, action_plan: plan } = snapshot;
  if (programs.length === 0) return null;
  const names = new Map(programs.map((card) => [card.program.id, card.program.name]));

  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="results-heading" className="text-lg font-semibold">
          Programs we found ({programs.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          These are preliminary and for information only. Only the provider can decide whether you
          qualify.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {programs.map(({ program, assessment, stale }) => (
          <li key={program.id} className="rounded-lg border border-border p-3">
            <p className="font-medium">{program.name}</p>
            <p className="text-sm text-muted-foreground">
              {program.provider} · {program.type === "government" ? "Government" : "Community"}
            </p>
            <p className="mt-1 text-sm">
              {stale
                ? "Updating…"
                : assessment
                  ? STATUS_LABEL[assessment.status]
                  : "Not checked yet"}
            </p>
            <p className="mt-1 text-sm">
              <a
                href={program.info_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center underline underline-offset-4"
              >
                Provider’s page
              </a>
              <span className="text-muted-foreground"> · as of {program.verified_on}</span>
            </p>
          </li>
        ))}
      </ul>

      {plan.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Your next steps</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {plan.map((item) => (
              <li key={item.program_id}>
                <span className="font-medium">{names.get(item.program_id) ?? item.program_id}:</span>{" "}
                {item.next_step}{" "}
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  Open link
                </a>
              </li>
            ))}
          </ol>
          {snapshot.plan_stale && <p className="text-sm text-muted-foreground">Updating your plan…</p>}
        </div>
      )}
    </section>
  );
}
