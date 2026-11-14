"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Hand, ShieldCheck, Square } from "lucide-react";

import { btn, Callout } from "@/components/od/ui";
import { useApp } from "@/components/session/session-provider";
import { answerRun, controlRun, getRun, isApiError, runFrameUrl, startRun, stopRun } from "@/lib/api";
import type { Program, BrowserRunStatus, RunView } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_MS = 1000;
const ACTIVE: BrowserRunStatus[] = ["starting", "working", "needs_answer", "needs_you", "verifying"];
const STATUS_TEXT: Record<BrowserRunStatus, string> = {
  starting: "Opening the form",
  working: "Filling in the form",
  needs_answer: "Waiting for your answer",
  needs_you: "Your turn",
  verifying: "Checking the result",
  done: "Finished",
  stopped: "Stopped",
  failed: "Couldn't finish",
};

// The run id is remembered for this tab only, so returning to the guide resumes the panel.
const storeKey = (sessionId: string, programId: string) => `od-run:${sessionId}:${programId}`;
function readRunId(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeRunId(key: string, runId: string | null) {
  try {
    if (runId) window.sessionStorage.setItem(key, runId);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: the panel still works, it just won't resume after navigation.
  }
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * "Fill this in with me": the browser assistant fills the form from what the person
 * already told us, asks for anything missing, and hands the browser over for every
 * step that must be theirs (signing, signing in, the final submit).
 */
export function ApplyAssistant({ program }: { program: Program }) {
  const { snapshot } = useApp();
  const sessionId = snapshot?.session_id ?? null;
  const key = sessionId ? storeKey(sessionId, program.id) : null;
  const [run, setRun] = useState<RunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);
  const runId = run?.run_id ?? null;
  const active = !!run && ACTIVE.includes(run.status);

  const fail = useCallback((e: unknown) => {
    setError(isApiError(e) ? e.message : "Something went wrong. Please try again.");
  }, []);

  // Resume a run started earlier in this tab.
  useEffect(() => {
    if (!sessionId || !key) return;
    const saved = readRunId(key);
    if (!saved) return;
    getRun(sessionId, saved)
      .then(setRun)
      .catch(() => writeRunId(key, null));
  }, [sessionId, key]);

  // Poll while the run is active.
  useEffect(() => {
    if (!sessionId || !runId || !active) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const next = await getRun(sessionId, runId);
        if (!cancelled) {
          setRun(next);
          setTick((t) => t + 1);
        }
      } catch (e) {
        if (cancelled) return;
        if (isApiError(e, "run_not_found") || isApiError(e, "session_not_found")) {
          setRun(null);
          if (key) writeRunId(key, null);
        }
        fail(e);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sessionId, runId, active, run, key, fail]);

  const act = async (call: () => Promise<RunView>) => {
    setPending(true);
    setError(null);
    try {
      setRun(await call());
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  };

  if (!sessionId || !key || !snapshot?.automatable_program_ids.includes(program.id)) return null;

  const begin = () =>
    act(async () => {
      const started = await startRun(sessionId, program.id);
      writeRunId(key, started.run_id);
      return started;
    });

  if (!run) {
    return (
      <div className="mt-[22px] rounded-2xl border border-gov-line bg-gov p-4 min-[751px]:p-5">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="grid size-[34px] place-items-center rounded-[11px] bg-surface text-gov-ink">
            <Bot aria-hidden className="size-[18px]" />
          </span>
          <h3 className="text-[15px] font-extrabold">Fill this in with me</h3>
        </div>
        <p className="mb-2 text-[12.5px] leading-[1.65] text-muted-foreground">
          An assistant opens the form in a private browser you can watch, fills in what you&apos;ve already told us, and asks you for
          anything else, like your name or phone number. We keep those only for this form and forget them when it&apos;s done.
        </p>
        <ul className="mb-3 grid gap-1 text-[12.5px] leading-[1.55]">
          <li className="flex items-start gap-2">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-gov-ink" />
            It never presses Submit, signs, agrees to anything, signs in or enters a Social Security number. You do those yourself.
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-gov-ink" />
            Screenshots of the form go to Google&apos;s AI and the browser service while it works.
          </li>
        </ul>
        {/* Every automation record is practice-mode for now (backend/app/data/automation/). */}
        <Callout tone="info" className="mt-0 mb-3">
          This opens a practice copy of the form. Nothing is sent to any agency.
        </Callout>
        <button type="button" className={btn("gov")} disabled={pending} onClick={() => void begin()}>
          I agree, start filling it in
        </button>
        {error ? <p role="alert" className="mt-2 text-xs font-bold text-amber-ink">{error}</p> : null}
      </div>
    );
  }

  const stop = () => act(() => stopRun(sessionId, run.run_id));
  const reset = () => {
    writeRunId(key, null);
    setRun(null);
    setError(null);
  };

  return (
    <section aria-label="Application assistant" className="mt-[22px] overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
        <Bot aria-hidden className="size-[18px] text-gov-ink" />
        <strong className="text-[13.5px]" aria-live="polite">
          {STATUS_TEXT[run.status]}
        </strong>
        {run.mode === "practice" ? <span className="rounded-full bg-amber px-2 py-0.5 text-[10.5px] font-extrabold text-amber-ink">Practice copy</span> : null}
        <span className="ml-auto flex items-center gap-2">
          {run.seconds_left !== null ? (
            <span className="text-xs font-bold tabular-nums text-muted-foreground" title="Time left before the browser closes">
              {clock(run.seconds_left)}
            </span>
          ) : null}
          {run.status === "working" || run.status === "needs_answer" ? (
            <button type="button" className={btn("ghost", "sm")} disabled={pending} onClick={() => void act(() => controlRun(sessionId, run.run_id, "take"))}>
              <Hand aria-hidden />
              Take over
            </button>
          ) : null}
          {active ? (
            <button type="button" className={btn("ghost", "sm")} disabled={pending} onClick={() => void stop()}>
              <Square aria-hidden />
              Stop
            </button>
          ) : null}
        </span>
      </header>

      {run.status === "needs_you" && run.handoff ? (
        <div className="flex flex-wrap items-center gap-3 bg-amber px-4 py-3 text-amber-ink">
          <p className="min-w-0 flex-1 text-[13px] font-bold leading-[1.5]">{run.handoff.message}</p>
          <button type="button" className={btn("primary", "sm")} disabled={pending} onClick={() => void act(() => controlRun(sessionId, run.run_id, "return"))}>
            I&apos;m done
          </button>
        </div>
      ) : null}

      {run.status === "needs_answer" && run.question ? (
        <AgentQuestion
          key={run.question.id}
          prompt={run.question.prompt}
          reason={run.question.reason}
          pending={pending}
          onAnswer={(text) => act(() => answerRun(sessionId, run.run_id, { question_id: run.question!.id, text }))}
          onSkip={() => act(() => answerRun(sessionId, run.run_id, { question_id: run.question!.id, skipped: true }))}
        />
      ) : null}

      <div className="grid gap-0 min-[1101px]:grid-cols-[minmax(0,1fr)_240px]">
        <div className="bg-surface-2">
          {active && run.live_view_url ? (
            <iframe
              key={run.interactive ? "interactive" : "view"}
              src={run.live_view_url}
              title={run.interactive ? "The application form. You have control." : "The application form, as the assistant fills it in"}
              className={cn("block aspect-[16/10] w-full border-0", !run.interactive && "pointer-events-none")}
              allow="clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
            />
          ) : active && run.has_frame ? (
            // eslint-disable-next-line @next/next/no-img-element -- a live screenshot from our own API, refreshed each poll
            <img src={runFrameUrl(sessionId, run.run_id, tick)} alt="The latest view of the application form" className="block aspect-[16/10] w-full object-contain" />
          ) : active ? (
            <div className="grid aspect-[16/10] place-items-center text-[13px] font-bold text-muted-foreground">Opening the browser…</div>
          ) : null}
          {!active ? <Result run={run} onReset={reset} /> : null}
        </div>
        <ol aria-label="What the assistant did" className="max-h-[320px] overflow-y-auto border-t border-line px-4 py-3 text-[12.5px] min-[1101px]:max-h-none min-[1101px]:border-l min-[1101px]:border-t-0">
          {run.steps.length ? (
            run.steps.map((s, i) => (
              <li key={`${s.at}-${i}`} className={cn("border-b border-dashed border-line py-1.5 leading-[1.45] last:border-b-0", s.kind === "blocked" && "text-muted-foreground", s.kind === "handoff" && "font-bold")}>
                {s.text}
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">Nothing yet.</li>
          )}
        </ol>
      </div>
      {error ? <p role="alert" className="px-4 pb-3 text-xs font-bold text-amber-ink">{error}</p> : null}
    </section>
  );
}

function AgentQuestion({
  prompt,
  reason,
  pending,
  onAnswer,
  onSkip,
}: {
  prompt: string;
  reason: string | null;
  pending: boolean;
  onAnswer: (text: string) => void;
  onSkip: () => void;
}) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <form
      className="bg-sky px-4 py-3 text-sky-ink"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onAnswer(value.trim());
      }}
    >
      <label htmlFor="agent-answer" className="mb-1 block text-[13.5px] font-extrabold">
        {prompt}
      </label>
      {reason ? <p className="mb-2 text-xs leading-[1.55]">{reason}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="agent-answer"
          ref={input}
          value={value}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded-[11px] border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-brand"
        />
        <button type="submit" className={btn("primary", "sm")} disabled={pending || !value.trim()}>
          Use this
        </button>
        <button type="button" className={btn("text", "sm")} disabled={pending} onClick={onSkip}>
          Skip
        </button>
      </div>
    </form>
  );
}

function Result({ run, onReset }: { run: RunView; onReset: () => void }) {
  const sent = run.outcome?.status === "submitted";
  return (
    <div className="p-4">
      {run.status === "done" && sent ? (
        <Callout tone="ok" className="mt-0">
          {run.mode === "practice" ? "The practice form says it was received" : "The provider's page says your application was received"}
          {run.outcome?.confirmation_text ? `. Reference: ${run.outcome.confirmation_text}` : ""}.
        </Callout>
      ) : run.status === "done" ? (
        <Callout tone="info" className="mt-0">
          {run.outcome?.status === "not_submitted"
            ? "The form wasn't sent. You can start again, or apply another way below."
            : "We couldn't tell whether it went through. Check with the provider before applying again."}
        </Callout>
      ) : null}
      {run.message ? <Callout tone={run.status === "failed" ? "warn" : "info"} className={run.status === "done" ? undefined : "mt-0"}>{run.message}</Callout> : null}
      <button type="button" className={btn("ghost", "sm", "mt-3")} onClick={onReset}>
        {sent ? "Close" : "Start again"}
      </button>
    </div>
  );
}
