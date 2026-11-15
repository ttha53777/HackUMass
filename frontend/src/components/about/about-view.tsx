"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConfirmCard, DocumentCard, SandboxCard } from "@/components/evidence/evidence-cards";
import { LoopTrace } from "@/components/loop/loop-trace";
import { btn, Panel } from "@/components/od/ui";
import { useDrawer } from "@/components/program/drawer";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { cardById, shortName } from "@/lib/derive";
import { cleanName, clearDevice, readName, saveName } from "@/lib/device-state";
import type { Provenance } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOURCE: Record<Provenance, { label: string; className: string }> = {
  user_reported: { label: "You told us", className: "bg-surface-2 text-muted-foreground" },
  document_extracted: { label: "From a document", className: "bg-sky text-sky-ink" },
  nessie_sandbox: { label: "Sandbox, simulated", className: "bg-lav text-lav-ink" },
  inferred: { label: "Inferred", className: "bg-amber text-amber-ink" },
};

function Badge({ children, className }: { children: string; className: string }) {
  return <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold", className)}>{children}</span>;
}

function Row({ label, value, badge, action }: { label: string; value: string; badge?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <span className="text-xs text-muted-foreground">
          {label}
          {badge}
        </span>
        <strong className="block text-sm [overflow-wrap:anywhere]">{value}</strong>
      </div>
      {action}
    </li>
  );
}

/** Everything the results are based on, with its source; any answer can be changed. */
export function AboutView() {
  const { snapshot, restart } = useApp();
  const { openQuestion } = useDrawer();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    setName(readName());
    return () => window.clearTimeout(resetTimer.current);
  }, []);

  if (!snapshot) return null;
  const answeredFields = new Set(snapshot.answered.map((a) => a.question.target_field));
  // Facts that came from a document or the sandbox and have no answered question of their own.
  const evidence = snapshot.profile_summary.filter((p) => p.provenance !== "user_reported" && !answeredFields.has(p.field));
  const waiting = snapshot.pending_question?.origin === "conflict";
  const source = (field: string) => snapshot.profile_summary.find((p) => p.field === field)?.provenance;

  const saveDraft = () => {
    const next = cleanName(draft);
    saveName(next);
    setName(next);
    setEditingName(false);
    toast("Saved on this device.");
  };

  const startOver = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimer.current = window.setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    clearDevice();
    await restart();
    router.replace("/");
  };

  return (
    <>
      <div className="mb-[22px]">
        <p className="text-[11px] font-extrabold uppercase tracking-[2px] text-muted-foreground">What we know</p>
        <h1 className="my-2 text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.12] tracking-[-1.4px]">About you.</h1>
        <p className="max-w-[640px] text-[14.5px] leading-[1.7] text-muted-foreground">
          This is everything your results are based on. Change any answer and your programs update right away.
        </p>
      </div>

      <div className="grid items-start gap-[22px] min-[1101px]:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <ul>
            <>
              {editingName ? (
                <li className="pb-3">
                <form
                  className="flex flex-wrap items-center gap-2.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveDraft();
                  }}
                >
                  <label htmlFor="edit-name" className="w-full text-xs text-muted-foreground">
                    What should we call you? <Badge className="bg-surface-2 text-muted-foreground">This device only</Badge>
                  </label>
                  <input
                    id="edit-name"
                    autoFocus
                    value={draft}
                    maxLength={40}
                    placeholder="First name or nickname"
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-[11px] border border-line bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-brand"
                  />
                  <button type="submit" className={btn("primary", "sm")}>
                    Save
                  </button>
                  <button type="button" className={btn("text", "sm")} onClick={() => setEditingName(false)}>
                    Cancel
                  </button>
                </form>
                </li>
              ) : (
                <Row
                  label="Name"
                  value={name || "Not given"}
                  badge={<Badge className="bg-surface-2 text-muted-foreground">This device only</Badge>}
                  action={
                    <button
                      type="button"
                      className={btn("ghost", "sm")}
                      onClick={() => {
                        setDraft(name);
                        setEditingName(true);
                      }}
                    >
                      Edit
                    </button>
                  }
                />
              )}
            </>

              <Row label="Language" value="English" action={<span className="text-[11px] font-bold text-faint">More languages soon</span>} />

          </ul>
          <ul className="pt-3">
            {snapshot.answered.map((a) => {
              const prov = source(a.question.target_field);
              const label = snapshot.field_labels[a.question.target_field] ?? snapshot.profile_summary.find((p) => p.field === a.question.target_field)?.label ?? a.prompt;
              return (
                <Row
                  key={a.question_id}
                  label={label}
                  value={a.skipped ? "Skipped" : a.display_value}
                  badge={!a.skipped && prov ? <Badge className={SOURCE[prov].className}>{SOURCE[prov].label}</Badge> : undefined}
                  action={
                    <button
                      type="button"
                      className={btn(a.skipped ? "primary" : "ghost", "sm")}
                      onClick={() => openQuestion(a.question, { current: a })}
                      aria-label={`${a.skipped ? "Answer" : "Edit"}: ${label}`}
                    >
                      {a.skipped ? "Answer" : "Edit"}
                    </button>
                  }
                />
              );
            })}
            {evidence.map((p) => (
              <Row
                key={p.field}
                label={p.label}
                value={p.display_value}
                badge={
                  <Badge className={SOURCE[p.provenance].className}>
                    {`${SOURCE[p.provenance].label}${waiting ? " · waiting for you" : ""}`}
                  </Badge>
                }
              />
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4">
          <ConfirmCard />
          {snapshot.open_questions.length ? (
            <Panel>
              <div className="mb-1 flex items-baseline justify-between gap-2.5">
                <h2 className="text-[15px] font-extrabold">Questions you can answer</h2>
                <span className="text-xs text-faint">{snapshot.open_questions.length} open</span>
              </div>
              {snapshot.open_questions.map((o) => (
                <div key={o.question.id} className="flex items-center justify-between gap-2.5 border-t border-line py-2.5 text-[12.5px] first-of-type:border-t-0">
                  <div className="min-w-0">
                    <strong>{o.question.prompt}</strong>
                    <small className="block text-[11.5px] leading-normal text-muted-foreground">
                      Affects{" "}
                      {o.affects
                        .map((id) => cardById(snapshot, id))
                        .filter((c) => !!c)
                        .map((c) => shortName(c.program))
                        .join(", ")}
                    </small>
                  </div>
                  <button type="button" className={btn("primary", "sm")} onClick={() => openQuestion(o.question)}>
                    Answer
                  </button>
                </div>
              ))}
            </Panel>
          ) : null}
          <DocumentCard />
          <SandboxCard />
          {snapshot ? <LoopTrace trace={snapshot.trace} /> : null}
          <Panel>
            <h2 className="mb-2 text-[15px] font-extrabold">Your privacy</h2>
            <p className="mb-3 text-[12.5px] leading-[1.7] text-muted-foreground">
              Your answers are kept only for this session and are never written to a log. Your name, document checklist and application progress stay
              in this browser. We never ask for a Social Security number or bank details.
            </p>
            <button type="button" className={btn("ghost", "sm")} onClick={() => void startOver()} aria-live="polite">
              {confirmReset ? "Tap again to clear everything" : "Start over"}
            </button>
          </Panel>
        </div>
      </div>
    </>
  );
}
