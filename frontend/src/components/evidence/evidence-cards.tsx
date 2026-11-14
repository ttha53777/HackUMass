"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileUp } from "lucide-react";

import { btn, Panel } from "@/components/od/ui";
import { QuestionForm } from "@/components/program/question-form";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { getPersonas } from "@/lib/api";
import type { PersonaOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Optional: read household size and income from a PDF or text file. Consent first.
 * The backend reads two numbers, deletes the file, and asks before using either.
 */
export function DocumentCard({ compact }: { compact?: boolean }) {
  const { submitDocument, whenIdle, working } = useApp();
  const toast = useToast();
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const send = async (file: File | undefined) => {
    if (!file) return;
    setSending(true);
    try {
      await whenIdle();
      const error = await submitDocument(file);
      await whenIdle();
      toast(error ?? "Got it. We read your file and deleted it. Check what we found before we use it.");
    } finally {
      setSending(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Panel className={cn("flex flex-col gap-3", compact && "shadow-none")}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky text-sky-ink">
          <FileUp aria-hidden className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-[15px] font-extrabold">Add a document so we can fill in answers</h2>
          <span className="text-[11.5px] font-bold text-faint">Optional</span>
        </div>
      </div>
      <p className="text-[12.5px] leading-[1.65] text-muted-foreground">
        A pay stub or benefits letter. We read only two things: household size and monthly income. The file is deleted right after, and we
        ask you to confirm before using either number.
      </p>
      <label className="flex items-start gap-2.5 text-[12.5px] leading-[1.55]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
        <span>I agree to let OpenDoor read this file for household size and income.</span>
      </label>
      <div className={cn("flex flex-col gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-brand-line bg-surface-2 p-4 text-[12.5px] text-muted-foreground", !consent && "opacity-60")}>
        <label htmlFor={id} className="font-bold text-ink">
          Choose a PDF or text file
        </label>
        <span>Up to 2 MB. Photos and Word files aren&apos;t read yet.</span>
        <input
          ref={input}
          id={id}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          disabled={!consent || sending || working}
          onChange={(e) => void send(e.target.files?.[0])}
          className="text-xs file:mr-3 file:rounded-[9px] file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-bold file:text-on-brand disabled:cursor-not-allowed"
        />
        {sending ? <span aria-live="polite">Reading your file...</span> : null}
      </div>
    </Panel>
  );
}

/** Optional: a fictional bank profile to show how bank data could fill in income. Always labeled simulated. */
export function SandboxCard() {
  const { snapshot, submitEvidence, whenIdle, working } = useApp();
  const toast = useToast();
  const [personas, setPersonas] = useState<PersonaOut[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState("");
  const [consent, setConsent] = useState(false);
  const name = useId();

  useEffect(() => {
    let live = true;
    getPersonas()
      .then((list) => live && setPersonas(list))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const summary = snapshot?.financial_summary;

  const use = async () => {
    await whenIdle();
    const error = await submitEvidence(pick);
    await whenIdle();
    toast(error ?? "Sandbox profile added. Check what it shows before we use it.");
  };

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2.5">
        <h2 className="text-[15px] font-extrabold">Try a sandbox profile</h2>
        <span className="rounded-full bg-lav px-[9px] py-[3px] text-[10.5px] font-extrabold text-lav-ink">Simulated</span>
      </div>
      <p className="text-[12.5px] leading-[1.65] text-muted-foreground">
        See how bank data could fill in income. These are fictional demo accounts, never a real bank.
      </p>

      {summary ? (
        <div className="rounded-[14px] bg-lav px-3.5 py-3 text-[12.5px] leading-relaxed text-lav-ink">
          <strong className="block">In use: {personas?.find((p) => p.id === summary.persona_id)?.label ?? "Simulated profile"}</strong>
          About {money(summary.avg_monthly_deposits)} a month in deposits
          {summary.avg_monthly_outflow != null ? `, ${money(summary.avg_monthly_outflow)} going out` : ""}.
          {summary.utility_bill_signals.length ? ` Bills seen: ${summary.utility_bill_signals.join(", ")}.` : ""}
          <ul className="mt-1.5 list-disc pl-4 text-[11.5px]">
            {summary.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {failed ? (
        <p className="text-xs text-muted-foreground">Sandbox profiles aren&apos;t available right now.</p>
      ) : !personas ? (
        <p className="text-xs text-muted-foreground">Loading profiles...</p>
      ) : (
        <>
          <fieldset className="flex flex-col gap-[7px]">
            <legend className="sr-only">Sandbox profile</legend>
            {personas.map((p) => (
              <label
                key={p.id}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[12.5px]",
                  pick === p.id ? "border-brand bg-brand-soft" : "border-line",
                )}
              >
                <input type="radio" name={name} value={p.id} checked={pick === p.id} onChange={() => setPick(p.id)} className="mt-[3px] accent-[var(--brand)]" />
                <span>
                  <strong className="block">{p.label}</strong>
                  <span className="leading-normal text-muted-foreground">{p.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-2.5 text-[12.5px] leading-[1.55]">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
            <span>I understand this is simulated data, and I agree to use it here.</span>
          </label>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" className={btn("primary", "sm")} disabled={!pick || !consent || working} onClick={() => void use()}>
              Use this profile
            </button>
            <span className="text-[11px] font-bold text-faint">Shows as &quot;Sandbox, simulated&quot;</span>
          </div>
        </>
      )}
    </Panel>
  );
}

/**
 * The backend's own confirmation question for a fact read from a document or the sandbox
 * (pending_question with origin "conflict"). Its wording is shown as sent; nothing is used
 * until the person answers.
 */
export function ConfirmCard() {
  const { snapshot } = useApp();
  const q = snapshot?.pending_question;
  if (!q || q.origin !== "conflict") return null;
  return (
    <section aria-labelledby="confirm-q" className="rounded-[22px] bg-plan p-[22px] text-plan-ink">
      <p className="text-[11px] font-extrabold uppercase tracking-[2px] text-plan-muted">Check what we read</p>
      <h2 id="confirm-q" className="mb-1.5 mt-1.5 text-[19px] font-extrabold leading-snug tracking-[-0.5px]">
        {q.prompt}
      </h2>
      {q.reason ? <p className="mb-3 text-xs leading-[1.65] text-plan-muted">{q.reason}</p> : null}
      <QuestionForm key={q.id + q.prompt} question={q} surface="tinted" />
    </section>
  );
}
