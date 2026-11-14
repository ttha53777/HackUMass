"use client";

import { useEffect, useRef, useState } from "react";

import { ActivityPanel } from "@/components/results/activity-panel";
import { EvidencePanel } from "@/components/results/evidence-panel";
import { hasResults, ResultsView } from "@/components/results/results-view";
import { STATUS } from "@/components/results/status";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { plural } from "@/lib/format";
import type { AnswerIn, EligibilityStatus, SessionSnapshot, WorkflowPhase } from "@/lib/types";

import { AnsweredList } from "./answered-list";
import { PhaseIndicator } from "./phase-indicator";
import { QuestionCard } from "./question-card";

const WORKING_LABEL: Partial<Record<WorkflowPhase, string>> = {
  discovering: "Finding programs near you…",
  evaluating: "Checking how programs fit…",
  planning: "Building your plan…",
};

// Shown by the results view itself, so they are not repeated as banners.
const HANDLED_NOTICES = new Set(["unsupported_region", "no_matches"]);

/** Some candidate program has an income rule, so a bank profile could matter. */
function usesIncome(snapshot: SessionSnapshot): boolean {
  return (
    snapshot.financial_summary !== null ||
    snapshot.programs.some((card) =>
      card.program.requirements.some((r) => r.field === "monthly_income"),
    )
  );
}

/** Programs whose check is waiting on the field this question asks about. */
function affectedPrograms(snapshot: SessionSnapshot, field: string): string[] {
  return snapshot.programs
    .filter((card) => card.assessment?.missing_fields.includes(field))
    .map((card) => card.program.name);
}

type Baseline = Map<string, { name: string; status: EligibilityStatus }>;

function statusesOf(snapshot: SessionSnapshot): Baseline {
  const map: Baseline = new Map();
  for (const card of snapshot.programs) {
    if (card.assessment) map.set(card.program.id, { name: card.program.name, status: card.assessment.status });
  }
  return map;
}

/** Plain-language list of what an answer changed, from real before/after statuses. */
function describeChanges(before: Baseline, snapshot: SessionSnapshot): string[] {
  if (snapshot.busy || snapshot.plan_stale) return [];
  const after = statusesOf(snapshot);
  const lines: string[] = [];
  for (const [id, now] of after) {
    const was = before.get(id);
    if (was && was.status !== now.status) {
      lines.push(`${now.name}: now “${STATUS[now.status].label}” (was “${STATUS[was.status].label}”).`);
    }
  }
  const added = [...after.keys()].filter((id) => !before.has(id)).length;
  const removed = [...before.keys()].filter((id) => !after.has(id)).length;
  if (added) lines.push(`${plural(added, "program")} added for your answers.`);
  if (removed) lines.push(`${plural(removed, "program")} no longer shown.`);
  return lines;
}

/** The app-led interview: one question at a time, then results and a plan. */
export function GuidedIntake() {
  const session = useSession();
  const { snapshot, working } = session;
  const [editingId, setEditingId] = useState<string | null>(null);
  // Statuses just before the latest answer, so the page can say what it changed.
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  // The person said yes to the simulated bank profile offer: open the picker.
  const [offerAccepted, setOfferAccepted] = useState(false);

  const editing = snapshot?.answered.find((item) => item.question_id === editingId) ?? null;
  const question = editing?.question ?? snapshot?.pending_question ?? null;
  const questionKey = question ? `${editing ? "edit" : "ask"}:${question.id}` : null;

  // Keep keyboard and screen-reader users oriented: when the question changes,
  // focus the new one; when the last question closes, focus the status line.
  // Nothing is focused on first load, so the page does not steal focus.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const lastKey = useRef<string | null | undefined>(undefined);
  const ready = snapshot !== null;
  useEffect(() => {
    if (!ready) return;
    const previous = lastKey.current;
    lastKey.current = questionKey;
    if (previous === undefined || previous === questionKey) return;
    if (questionKey) headingRef.current?.focus();
    else statusRef.current?.focus();
  }, [ready, questionKey]);

  if (session.loadError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
        <p>{session.loadError}</p>
        <Button className="h-11 px-5 text-base" onClick={() => void session.restart()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <p role="status" className="text-muted-foreground">
        Getting your first question ready…
      </p>
    );
  }

  async function handleSubmit(answer: AnswerIn) {
    const before = statusesOf(snapshot!);
    setBaseline(before.size > 0 ? before : null);
    const accepted = await session.submit(answer);
    if (accepted) setEditingId(null);
    if (accepted && answer.question_id === "evidence_offer") {
      setOfferAccepted(answer.selected_option_ids?.includes("yes") ?? false);
    }
  }

  async function handleEvidence(personaId: string) {
    const before = statusesOf(snapshot!);
    setBaseline(before.size > 0 ? before : null);
    return session.submitEvidence(personaId);
  }

  function startEdit(questionId: string) {
    session.clearAnswerError();
    setEditingId(questionId);
  }

  function cancelEdit() {
    session.clearAnswerError();
    setEditingId(null);
  }

  const results = hasResults(snapshot);
  const changes = baseline && results ? describeChanges(baseline, snapshot) : [];
  // After the first results, a newly asked question is an optional follow-up
  // shown with them, not a step the person must take before seeing anything.
  const isFollowUp = !editing && question !== null && snapshot.phase === "awaiting_user";
  const finished = !question && !working;
  const statusText = working
    ? (WORKING_LABEL[snapshot.phase] ?? "Working…")
    : changes.length > 0
      ? `Results updated. ${changes.join(" ")}`
      : finished && results
      ? "Your results and next steps are ready below."
      : finished
        ? "That’s everything we need for now."
        : "";

  const questionCard = question && questionKey && (
    <QuestionCard
      key={questionKey}
      question={question}
      mode={editing ? "edit" : "pending"}
      currentValue={editing?.display_value}
      disabled={working}
      error={session.answerError}
      headingRef={headingRef}
      onSubmit={(answer) => void handleSubmit(answer)}
      onCancelEdit={cancelEdit}
    />
  );

  let followUp = null;
  if (isFollowUp && question) {
    const affected = affectedPrograms(snapshot, question.target_field);
    const title =
      question.origin === "conflict"
        ? "Please check this number"
        : question.origin === "evidence_offer"
          ? "Optional"
          : affected.length > 0
            ? `One more question could change ${plural(affected.length, "result")}`
            : "One more question";
    followUp = (
      <section
        aria-label="Optional follow-up question"
        className="flex flex-col gap-4 rounded-xl border-2 border-primary/20 bg-card p-4 print:hidden"
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          {affected.length > 0 && question.origin !== "conflict" && (
            <p className="text-sm text-muted-foreground">It helps us check: {affected.join(", ")}.</p>
          )}
          <p className="text-sm text-muted-foreground">
            Your results below are ready now. Answering is optional.
          </p>
        </div>
        {questionCard}
      </section>
    );
  }

  const intakeTeaser =
    !results && !editing && snapshot.phase === "intake" && snapshot.programs.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PhaseIndicator phase={snapshot.phase} />

      {session.expired && (
        <p role="status" className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
          Your earlier session expired, so we’ve started a new one.
        </p>
      )}

      {snapshot.notices
        .filter((notice) => !HANDLED_NOTICES.has(notice.code))
        .map((notice) => (
          <p
            key={notice.code}
            role="status"
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm print:hidden"
          >
            {notice.message}
          </p>
        ))}

      {!isFollowUp && questionCard && (
        <div className="print:hidden">
          {editing && (
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Change your answer
            </p>
          )}
          {questionCard}
        </div>
      )}

      {intakeTeaser && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          We’ve found {plural(snapshot.programs.length, "program")} that serve
          {snapshot.region ? ` ${snapshot.region.city}` : " your area"}. A few more questions will
          show which fit you best.
        </p>
      )}

      {changes.length > 0 && (
        <section
          aria-labelledby="changes-heading"
          className="rounded-xl border border-sky-700/30 bg-sky-50 p-4 text-sky-950 dark:border-sky-400/30 dark:bg-sky-950 dark:text-sky-50 print:hidden"
        >
          <h2 id="changes-heading" className="font-semibold">
            What your answer changed
          </h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Announced politely when it changes; empty while a question is open. */}
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        // When the change summary is on screen, this stays for screen readers only.
        className={
          changes.length > 0 ? "sr-only" : "min-h-6 text-muted-foreground outline-none print:hidden"
        }
      >
        {statusText}
      </p>

      {!editing || results ? (
        <ResultsView
          snapshot={snapshot}
          followUp={followUp}
          evidence={
            usesIncome(snapshot) ? (
              <EvidencePanel
                summary={snapshot.financial_summary}
                openRequested={offerAccepted}
                disabled={working}
                onUse={handleEvidence}
              />
            ) : null
          }
          disabled={working}
          onEditQuestion={startEdit}
        />
      ) : null}

      {(results || snapshot.coverage !== "unknown") && <ActivityPanel snapshot={snapshot} />}

      <div className="flex flex-col gap-4 print:hidden">
        <AnsweredList
          items={snapshot.answered}
          disabled={working}
          editingId={editingId}
          onEdit={startEdit}
        />

        {snapshot.answered.length > 0 && (
          <div>
            <Button
              variant="ghost"
              className="h-11 px-4 text-base"
              disabled={working}
              onClick={() => {
                setEditingId(null);
                setBaseline(null);
                setOfferAccepted(false);
                void session.restart();
              }}
            >
              Start over
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
