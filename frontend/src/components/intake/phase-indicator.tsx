import { cn } from "@/lib/utils";
import type { WorkflowPhase } from "@/lib/types";

const STAGES = [
  "Understanding your needs",
  "Finding programs",
  "Checking fit",
  "Building your plan",
] as const;

// Which stage each backend phase belongs to. There is deliberately no
// percentage: the number of questions depends on the answers.
const STAGE_OF: Record<WorkflowPhase, number> = {
  intake: 0,
  discovering: 1,
  evaluating: 2,
  planning: 3,
  awaiting_user: 3,
  complete: 3,
  error: 3,
};

export function PhaseIndicator({ phase }: { phase: WorkflowPhase }) {
  const current = STAGE_OF[phase];
  const done = phase === "complete" || phase === "awaiting_user";
  return (
    <ol aria-label="Progress" className="flex flex-wrap gap-x-4 gap-y-1 text-sm print:hidden">
      {STAGES.map((label, index) => {
        const isCurrent = index === current && !done;
        const isPast = index < current || done;
        return (
          <li
            key={label}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5",
              isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-block size-2 rounded-full border border-current",
                (isCurrent || isPast) && "bg-current",
              )}
            />
            {label}
            {isPast && <span className="sr-only"> (done)</span>}
          </li>
        );
      })}
    </ol>
  );
}
