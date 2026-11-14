"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import type { AnswerIn, WorkflowPhase } from "@/lib/types";

import { AnsweredList } from "./answered-list";
import { PhaseIndicator } from "./phase-indicator";
import { QuestionCard } from "./question-card";
import { ResultsPreview } from "./results-preview";

const WORKING_LABEL: Partial<Record<WorkflowPhase, string>> = {
  discovering: "Finding programs near you…",
  evaluating: "Checking how programs fit…",
  planning: "Building your plan…",
};

/** The app-led interview: one question at a time, then results. */
export function GuidedIntake() {
  const session = useSession();
  const { snapshot, working } = session;
  const [editingId, setEditingId] = useState<string | null>(null);

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
    const accepted = await session.submit(answer);
    if (accepted) setEditingId(null);
  }

  function startEdit(questionId: string) {
    session.clearAnswerError();
    setEditingId(questionId);
  }

  function cancelEdit() {
    session.clearAnswerError();
    setEditingId(null);
  }

  const finished = !question && !working;
  const statusText = working
    ? (WORKING_LABEL[snapshot.phase] ?? "Working…")
    : finished
      ? "That’s everything we need for now."
      : "";

  return (
    <div className="flex flex-col gap-6">
      <PhaseIndicator phase={snapshot.phase} />

      {session.expired && (
        <p role="status" className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
          Your earlier session expired, so we’ve started a new one.
        </p>
      )}

      {snapshot.notices.map((notice) => (
        <p
          key={notice.code}
          role="status"
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm"
        >
          {notice.message}
        </p>
      ))}

      {question && questionKey && (
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
      )}

      {/* Announced politely when it changes; empty while a question is open. */}
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="min-h-6 text-muted-foreground outline-none"
      >
        {statusText}
      </p>

      {snapshot.coverage === "unsupported" && !editing && (
        <div>
          <Button
            variant="outline"
            className="h-11 px-5 text-base"
            disabled={working}
            onClick={() => startEdit("zip")}
          >
            Change ZIP code
          </Button>
        </div>
      )}

      <ResultsPreview snapshot={snapshot} />

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
              void session.restart();
            }}
          >
            Start over
          </Button>
        </div>
      )}
    </div>
  );
}
