"use client";

import { useEffect, useMemo, useRef } from "react";

import { DrawerHead, Stepper } from "@/components/hub/drawer";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useHub } from "@/components/hub/hub-state";
import { Arrow } from "@/components/hub/icons";
import { RUN_INTERACTIVE, filledPdfUrl, type FillerRunStatus, type PlanRow } from "@/lib/filler";

import { LiveViewer } from "./live-viewer";
import { FieldChecklist, PreflightCard, QuestionBox, StepFeed } from "./run-panels";
import { useFillerRun } from "./use-filler-run";

const TITLE: Record<FillerRunStatus, string> = {
  preparing: "Opening the form",
  ready: "Ready to fill",
  filling: "Filling in your form",
  needs_answer: "One question for you",
  paused: "Paused",
  needs_you: "Your turn",
  review: "Check it, then send it yourself",
  verifying: "Checking the result",
  done: "Finished",
  stopped: "Stopped",
  failed: "Couldn't finish",
};
const STEPS = ["Check", "Fill", "Send"];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * The Filler at work, full screen: the live browser on the left, and on the right what it
 * will do (pre-flight), what it is doing (captions, checklist), its one question, the
 * hand-off banner, and the review. The person can pause, take over or stop at any moment,
 * and always presses the form's own Send.
 */
export function FillerStage({
  sessionId,
  programId = null,
  programTitle = null,
  provider = null,
  pdfFormId = null,
}: {
  sessionId: string;
  programId?: string | null;
  programTitle?: string | null;
  provider?: string | null;
  pdfFormId?: string | null;
}) {
  const { closeSheet } = useHub();
  const { refresh } = useApp();
  const { setStage } = usePlan();
  const ctl = useFillerRun(sessionId, programId, pdfFormId);
  const { run, start } = ctl;
  const started = useRef(false);

  // Opening the stage prepares a run: the browser opens and the first page is mapped
  // while the person reads the pre-flight card. Nothing is typed until they press Start.
  useEffect(() => {
    if (started.current) return;
    const timer = window.setTimeout(() => {
      if (!started.current && !run) {
        started.current = true;
        void start();
      }
    }, 300); // a resumed run (from this tab) arrives first
    return () => window.clearTimeout(timer);
  }, [run, start]);

  // Closed some other way (Escape, the backdrop): stop a run that hasn't reached the review,
  // so no browser is left open. A run at the review is the person's; it keeps until they act.
  const latest = useRef(ctl);
  useEffect(() => {
    latest.current = ctl;
  });
  useEffect(
    () => () => {
      const { run: r, active, stop } = latest.current;
      if (r && active && r.status !== "review") void stop();
    },
    [],
  );

  // A program's result is in the plan: refresh it, and mark the program applied if it was sent.
  const recorded = !!run?.result_recorded;
  useEffect(() => {
    if (!recorded || !run?.program_id) return;
    void refresh();
    if (run.outcome?.status === "submitted") setStage(run.program_id, "applied");
  }, [recorded, run?.program_id, run?.outcome?.status, refresh, setStage]);

  const plan: PlanRow[] = useMemo(() => {
    const rows = run?.plan ?? [];
    const known = new Set(rows.map((r) => r.key));
    // Fields filled on later pages join the checklist as they land.
    const later = (run?.filled ?? []).filter((f) => !known.has(f.key)).map((f) => ({ label: f.label, how: "fill" as const, key: f.key }));
    return [...rows, ...later];
  }, [run?.plan, run?.filled]);
  const filled = useMemo(() => new Set((run?.filled ?? []).map((f) => f.key)), [run?.filled]);

  const close = () => {
    if (run && ctl.active && run.status !== "review") void ctl.stop();
    closeSheet();
  };

  if (!run) {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={1} labels={STEPS} />} title="Opening the form" onClose={close} />
        <div className="dbody">
          {ctl.error ? <p className="fl-error" role="alert">{ctl.error}</p> : <p className="fl-quiet">Starting a private browser just for you…</p>}
          {ctl.error ? (
            <button className="btn sm" type="button" onClick={() => void start()}>
              Try again
            </button>
          ) : null}
        </div>
      </>
    );
  }

  const s = run.status;
  const real = run.mode === "stop_before_submit";
  const pdf = run.mode === "pdf";
  // At a real site's stop point the view is read-only: nothing on it can be sent from here.
  const interactive = RUN_INTERACTIVE.includes(s) && !(real && s === "review");
  const where = real
    ? `${provider ?? "The provider's form"} · fill-and-stop: nothing will be sent`
    : pdf
      ? "Your PDF form · filled here, then written into your PDF"
      : `Practice form${programTitle ? ` for ${programTitle}` : ""} · nothing is sent anywhere`;
  const at = s === "preparing" || s === "ready" ? 1 : s === "review" || s === "verifying" || s === "done" ? 3 : 2;
  const finished = !ctl.active;

  return (
    <>
      <DrawerHead eyebrow={<Stepper at={at} labels={STEPS} />} title={TITLE[s]} onClose={close} />
      <div className="fl-stage">
        <div className="fl-left">
          <LiveViewer ctl={ctl} interactive={interactive} label={`${where}${ctl.active ? ` · ${clock(run.seconds_left)} left` : ""}`} />
          {ctl.active && s !== "ready" && s !== "preparing" ? (
            <div className="fl-controls" role="group" aria-label="Controls">
              {s === "paused" ? (
                <button className="btn sm" type="button" disabled={ctl.busy} onClick={() => void ctl.control("resume")}>
                  Resume
                </button>
              ) : s === "filling" ? (
                <button className="btn quiet sm" type="button" disabled={ctl.busy} onClick={() => void ctl.control("pause")}>
                  Pause
                </button>
              ) : null}
              {s === "filling" || s === "paused" ? (
                <button className="btn quiet sm" type="button" disabled={ctl.busy} onClick={() => void ctl.control("take")}>
                  Take over
                </button>
              ) : null}
              <button className="txt-btn fl-stop" type="button" disabled={ctl.busy} onClick={() => void ctl.stop()}>
                Stop · nothing is sent
              </button>
            </div>
          ) : null}
        </div>

        <aside className="fl-side">
          {ctl.error ? <p className="fl-error" role="alert">{ctl.error}</p> : null}

          {s === "preparing" ? <p className="fl-quiet">Opening the form and reading what it asks for…</p> : null}
          {s === "ready" ? <PreflightCard run={run} busy={ctl.busy} onStart={() => void ctl.control("go")} onCancel={close} /> : null}

          {s === "needs_answer" ? <QuestionBox run={run} busy={ctl.busy} onAnswer={ctl.answer} /> : null}

          {s === "needs_you" && run.handoff ? (
            <div className="fl-banner" role="status">
              <b>Your turn</b>
              <p>{run.handoff.text}</p>
              <button className="btn sm" type="button" disabled={ctl.busy} onClick={() => void ctl.control("return")}>
                Hand back <Arrow />
              </button>
            </div>
          ) : null}

          {s === "review" && real ? (
            <div className="fl-banner review" role="status">
              <b>Filled in up to the point of sending. We stop here.</b>
              <p>
                This is the provider&apos;s real form, so nothing will be sent from here. Check what was filled (outlined in blue),
                then send it yourself on the provider&apos;s site when you&apos;re ready.
              </p>
              <button className="btn sm" type="button" disabled={ctl.busy} onClick={() => void ctl.control("done")}>
                End here <Arrow />
              </button>
            </div>
          ) : null}

          {s === "review" && pdf ? (
            <div className="fl-banner review" role="status">
              <b>Filled in. Check it, then make your PDF.</b>
              <p>
                Fields the helper filled are outlined in blue. Change anything that&apos;s wrong and tick any boxes that are yours.
                Nothing is sent anywhere: you get the PDF to keep, print or send yourself.
              </p>
              <button className="btn sm" type="button" disabled={ctl.busy} onClick={() => void ctl.control("done")}>
                Make my PDF <Arrow />
              </button>
            </div>
          ) : null}

          {s === "review" && !real && !pdf ? (
            <div className="fl-banner review" role="status">
              <b>Filled in. Now it&apos;s yours to check and send.</b>
              <p>
                Fields the helper filled are outlined in blue wherever the form shows them. Change anything that&apos;s wrong, finish any box or signature
                still empty, then press the form&apos;s own Submit button in the view. The helper never presses it.
              </p>
              <button className="btn sm" type="button" disabled={ctl.busy} onClick={() => void ctl.control("done")}>
                I&apos;ve sent it <Arrow />
              </button>
              <button className="txt-btn" type="button" disabled={ctl.busy} onClick={() => void ctl.stop()}>
                Stop without sending
              </button>
            </div>
          ) : null}

          {finished ? <Result run={run} sessionId={sessionId} onAgain={() => (ctl.forget(), void start())} onClose={closeSheet} /> : null}

          {s !== "ready" && s !== "preparing" ? (
            <>
              <h4 className="fl-h">The form</h4>
              <FieldChecklist plan={plan} filled={filled} />
              <h4 className="fl-h">What the helper is doing</h4>
              <StepFeed steps={ctl.steps} />
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Result({ run, sessionId, onAgain, onClose }: { run: NonNullable<ReturnType<typeof useFillerRun>["run"]>; sessionId: string; onAgain: () => void; onClose: () => void }) {
  const sent = run.outcome?.status === "submitted" || run.pdf_ready;
  return (
    <div className={`fl-banner${sent ? " sent" : ""}`} role="status">
      <b>
        {run.pdf_ready
          ? "Your PDF is ready"
          : sent
          ? "Sent by you"
          : run.status === "failed"
            ? "The helper couldn't finish"
            : run.mode === "stop_before_submit" && run.status === "done"
              ? "Stopped before sending"
              : "Not sent"}
      </b>
      <p>
        {run.message}
        {sent && run.outcome?.confirmation ? ` Reference: ${run.outcome.confirmation}.` : ""}
        {run.program_id && run.result_recorded ? " Your plan is updated." : ""}
      </p>
      <div className="fl-actions">
        {run.pdf_ready ? (
          <a className="btn sm" href={filledPdfUrl(sessionId, run.run_id)} download="filled-form.pdf">
            Download your PDF
          </a>
        ) : null}
        {!sent ? (
          <button className="btn quiet sm" type="button" onClick={onAgain}>
            Start again
          </button>
        ) : null}
        <button className="btn sm" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
