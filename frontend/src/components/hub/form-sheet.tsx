"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DETAIL_GROUPS, DETAIL_LABEL } from "@/components/documents/details-store";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { answerRun, controlRun, getReadiness, getRun, isApiError, runFrameUrl, startRun, stopRun } from "@/lib/api";
import { stepFor } from "@/lib/hub-derive";
import type { BrowserRunStatus, ReadinessOut, RunView, SessionSnapshot } from "@/lib/types";

import { DrawerHead, Stepper } from "./drawer";
import { useHub } from "./hub-state";
import { Arrow, Doodle, Tick } from "./icons";
import { usePapersHub } from "./papers-context";
import { QuestionInput } from "./question-input";

const POLL_MS = 1000;
const ACTIVE: BrowserRunStatus[] = ["starting", "working", "needs_answer", "needs_you", "verifying"];
const STATUS_TEXT: Record<BrowserRunStatus, string> = {
  starting: "Opening the form",
  working: "Filling in your form",
  needs_answer: "One question for you",
  needs_you: "Your turn",
  verifying: "Checking the result",
  done: "Finished",
  stopped: "Stopped",
  failed: "Couldn't finish",
};
const F = ["Fill", "Review", "Send"];

/** Fill-sheet key -> label (backend execution/fields.CATALOGUE). */
const KEY_LABEL: Record<string, string> = {
  ...DETAIL_LABEL,
  household_size: "Household size",
  monthly_income: "Monthly income",
  best_time_to_call: "Best time to reach you",
};
/** A short paper title for the step log ("your lease"), or nothing if it doesn't fit the server's check. */
const sourceTitle = (t: string | null) => (t && /^[A-Za-z][A-Za-z0-9 ,.'()-]{0,79}$/.test(t) ? t : null);
const names = (keys: string[]) => keys.map((k) => KEY_LABEL[k] ?? k.replace(/_/g, " ")).join(", ");
/** Many details read as groups: "You (8), Household (6), Home (2)". A few are named one by one. */
const grouped = (keys: string[]) => {
  const shown = keys.filter((k) => k !== "first_name" && k !== "last_name");
  if (shown.length <= 6) return names(keys);
  const groups = DETAIL_GROUPS.map((g) => [g.title, shown.filter((k) => (g.keys as string[]).includes(k)).length] as const).filter(([, n]) => n);
  const rest = shown.filter((k) => !DETAIL_GROUPS.some((g) => (g.keys as string[]).includes(k)));
  return [...groups.map(([t, n]) => `${t} (${n})`), ...(rest.length ? [names(rest)] : [])].join(", ");
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// The run id is remembered for this tab only, so reopening the drawer resumes the run.
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
    // Storage blocked: the run still works, it just won't resume.
  }
}

/**
 * "Fill my form": the browser assistant fills the program's form from what the person already
 * told us (and, with the form helper on, their confirmed details), asks for anything missing, and
 * hands the browser back for every step that must be theirs. It never presses Send.
 */
export function FormSheet({ s, id }: { s: SessionSnapshot; id: string }) {
  const { closeSheet } = useHub();
  const { refresh } = useApp();
  const { plan, setStage } = usePlan();
  const papers = usePapersHub();
  const toast = useToast();
  const st = stepFor(s, plan, id);
  const sessionId = s.session_id;
  const key = storeKey(sessionId, id);
  const mode = s.automation_modes[id];

  const [gateOpen, setGateOpen] = useState(!papers.helper);
  const [ready, setReady] = useState<ReadinessOut | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);
  const handled = useRef<string | null>(null);
  const sentDetails = useRef(0);
  const logBox = useRef<HTMLOListElement>(null);

  const runId = run?.run_id ?? null;
  const active = !!run && ACTIVE.includes(run.status);
  const polling = !!run && (active || !run.result_recorded);
  const version = s.trace.at(-1)?.seq ?? 0;

  const fail = useCallback((e: unknown) => setError(isApiError(e) ? e.message : "Something went wrong. Please try again."), []);

  // What the form needs and where each answer comes from (keys only).
  useEffect(() => {
    let live = true;
    getReadiness(sessionId, id)
      .then((r) => live && setReady(r))
      .catch(() => live && setReady(null));
    return () => {
      live = false;
    };
  }, [sessionId, id, version]);

  // Resume a run started earlier in this tab.
  useEffect(() => {
    const saved = readRunId(key);
    if (!saved) return;
    getRun(sessionId, saved)
      .then(setRun)
      .catch(() => writeRunId(key, null));
  }, [sessionId, key]);

  useEffect(() => {
    if (!runId || !polling) return;
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
          writeRunId(key, null);
        }
        fail(e);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sessionId, runId, polling, run, key, fail]);

  const steps = run?.steps.length ?? 0;
  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight;
  }, [steps]);

  // The outcome is in the main graph: refresh the plan, log it, mark it applied if it was received.
  useEffect(() => {
    if (!run || active || !run.result_recorded || handled.current === run.run_id || !st) return;
    handled.current = run.run_id;
    writeRunId(key, null);
    void refresh();
    papers.addLog({
      programId: id,
      title: st.title,
      at: new Date().toISOString(),
      actions: run.steps.filter((x) => x.kind === "action").length,
      details: sentDetails.current,
      outcome: run.status === "stopped" ? "stopped" : (run.outcome?.status ?? "unclear"),
    });
    if (run.status === "done" && run.outcome?.status === "submitted") {
      setStage(id, "applied");
      toast("Sent by you. Nice work.");
    }
  }, [run, active, key, refresh, setStage, id, toast, papers, st]);

  const confirmedDetails = useMemo(() => papers.details.filter((d) => d.confirmed), [papers.details]);
  const confirmed = useMemo(() => new Map(confirmedDetails.map((d) => [d.key as string, d.value])), [confirmedDetails]);
  const fromDevice = (ready?.from_device_needed ?? []).filter((k) => papers.helper && confirmed.has(k));
  const askLater = [...(ready?.from_device_needed ?? []).filter((k) => !fromDevice.includes(k)), ...(ready?.will_ask ?? []), ...(ready?.unconfirmed ?? [])];
  const blocked = (ready?.blocked_by.length ?? 0) > 0;

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

  const begin = () =>
    act(async () => {
      const details = Object.fromEntries(fromDevice.map((k) => [k, confirmed.get(k)!]));
      // Typed by the person: no paper to name. Read from a paper: its title, for the step log.
      const sources = Object.fromEntries(
        confirmedDetails
          .filter((d) => fromDevice.includes(d.key) && d.source !== "typed" && sourceTitle(d.sourceTitle))
          .map((d) => [d.key, sourceTitle(d.sourceTitle)!]),
      );
      sentDetails.current = Object.keys(details).length;
      const started = await startRun(sessionId, id, details, sources);
      writeRunId(key, started.run_id);
      return started;
    });

  if (!st || !s.automatable_program_ids.includes(id)) {
    return (
      <>
        <DrawerHead eyebrow="Fill the form for me" title="Not available here" onClose={closeSheet} />
        <div className="dbody">
          <p>The form helper can&apos;t fill this program&apos;s form on this server. Apply the usual way from its page.</p>
        </div>
      </>
    );
  }

  // Helper off: ask once whether it may use the person's papers and details.
  if (!run && gateOpen) {
    return (
      <>
        <DrawerHead eyebrow="Form helper is off" title="Let it use your papers?" onClose={closeSheet} />
        <div className="dbody">
          <p>The helper can fill this form using your answers and the details you confirmed from your papers. You check every line, and only you press Send.</p>
          {confirmed.size ? (
            <div className="reuse" style={{ background: "var(--raised)", color: "var(--ink)", boxShadow: "0 0 0 1px var(--line)" }}>
              It would use
              <ul>
                {DETAIL_GROUPS.map((g) => [g.title, g.keys.filter((k) => confirmed.has(k)).length] as const)
                  .filter(([, n]) => n)
                  .map(([title, n]) => (
                    <li key={title}>
                      <Tick />
                      {title}: {n} detail{n === 1 ? "" : "s"}
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <p className="sp-n">No confirmed details yet. It will ask you for them as it goes.</p>
          )}
          <p className="mono">Never uses: ID number · Social Security number · bank passwords</p>
          <div className="drow">
            <button
              className="btn"
              type="button"
              onClick={() => {
                papers.setHelper(true);
                setGateOpen(false);
              }}
            >
              Turn it on <Arrow />
            </button>
            <button className="txt-btn" type="button" onClick={() => setGateOpen(false)}>
              No, it asks me instead
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!run) {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={1} labels={F} />} title={`Fill ${st.title}`} onClose={closeSheet} />
        <div className="dbody">
          <p>An assistant opens the form in a private browser you can watch, fills in what you&apos;ve already told us, and asks you for anything else.</p>
          {ready && [...ready.from_profile, ...fromDevice, ...askLater].length ? (
            <div className="found" aria-label="Before we start">
              {ready.from_profile.length ? (
                <div>
                  <span>From your answers</span>
                  <b>{names(ready.from_profile)}</b>
                </div>
              ) : null}
              {fromDevice.length ? (
                <div>
                  <span>From your details, on this device</span>
                  <b title={names(fromDevice)}>{grouped(fromDevice)}</b>
                </div>
              ) : null}
              {askLater.length ? (
                <div>
                  <span>We&apos;ll ask you as we go</span>
                  <b>{names(askLater)}</b>
                </div>
              ) : null}
            </div>
          ) : !ready ? (
            <p className="sp-n">Checking what this form needs…</p>
          ) : null}
          {blocked ? (
            <div className="banner urgent" role="alert">
              <Doodle id="warn" />
              <span>{names(ready!.blocked_by)} doesn&apos;t match yet. Settle it in My answers first so the form gets the right answer.</span>
            </div>
          ) : null}
          <div className={mode === "stop_before_submit" ? "banner info" : "banner quiet"}>
            <Doodle id="warn" />
            <span>
              {mode === "stop_before_submit"
                ? `This opens the real form from ${st.card.program.provider}. The helper fills it and stops before sending, so nothing is sent. You send it yourself on their site.`
                : "This opens a practice copy of the form. Nothing is sent to any agency."}
            </span>
          </div>
          <ul className="promise" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li style={{ display: "flex", gap: 8 }}>
              <Doodle id="lock" />
              It never presses Send, signs, agrees to anything, signs in or types a Social Security number. You do those.
            </li>
            <li style={{ display: "flex", gap: 8 }}>
              <Doodle id="eye" />
              {ready?.engine === "gemini_map"
                ? "Google Gemini reads the form's questions to match them to your details. Your answers themselves never go to Gemini."
                : ready?.engine === "manifest"
                  ? "Nothing about you goes to an AI model: the helper follows this form's saved map."
                  : "Screenshots of the form go to the AI model and the browser service while it works."}
            </li>
          </ul>
          {error ? <p className="qerr">{error}</p> : null}
          <div className="drow">
            <button className={`btn${pending || blocked ? " dis" : ""}`} type="button" disabled={pending || blocked} onClick={() => void begin()}>
              I agree, fill my form <Arrow />
            </button>
            <button className="txt-btn" type="button" onClick={closeSheet}>
              Not now
            </button>
          </div>
        </div>
      </>
    );
  }

  const sent = run.status === "done" && run.outcome?.status === "submitted";
  const at = !active ? 3 : run.status === "needs_you" ? 2 : 1;

  if (!active && sent) {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={3} labels={F} />} title="Sent by you" onClose={closeSheet} />
        <div className="dbody">
          <div className="sentmark">
            <svg className="dd" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M8 26 L18 36 L40 12" />
            </svg>
            <h4>{st.title}</h4>
            <p>
              {run.mode === "practice" ? "The practice form says it was received" : "The provider's page says your application was received"}
              {run.outcome?.confirmation_text ? `. Reference: ${run.outcome.confirmation_text}` : ""}.
            </p>
          </div>
          <div className="drow">
            <button className="btn" type="button" onClick={closeSheet}>
              Done <Arrow />
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DrawerHead eyebrow={<Stepper at={at} labels={F} />} title={STATUS_TEXT[run.status]} onClose={closeSheet} />
      <div className="dbody">
        {run.status === "needs_you" && run.handoff ? (
          <div className="ff" style={{ gridTemplateColumns: "1fr" }}>
            <span className="v you pulse" style={{ minHeight: 48, padding: ".6em .9em" }}>
              {run.handoff.message}
              {run.in_window && run.handoff.reason !== "stop_point"
                ? " Do it in the form window that opened on this computer, then come back and press I'm done."
                : ""}
            </span>
          </div>
        ) : run.in_window && active ? (
          <p className="sp-n">You can also watch it in the form window that opened on this computer.</p>
        ) : null}
        {run.status === "needs_answer" && run.question ? (
          <div className="ar">
            <div className="edit">
              <p style={{ fontWeight: 700 }}>{run.question.prompt}</p>
              {run.question.reason ? <p className="qwhy">{run.question.reason}</p> : null}
              <QuestionInput
                key={run.question.id}
                question={run.question}
                busy={pending}
                onAnswer={async (body) => {
                  const q = run.question!;
                  setPending(true);
                  setError(null);
                  try {
                    setRun(await answerRun(sessionId, run.run_id, { question_id: q.id, ...body }));
                    return true;
                  } catch (e) {
                    fail(e);
                    return false;
                  } finally {
                    setPending(false);
                  }
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="browser">
          <div className="bbar">
            <i />
            <i />
            <i />
            <span>
              {run.mode === "practice" ? "Practice copy · nothing is sent" : st.card.program.provider}
              {run.seconds_left !== null ? ` · ${clock(run.seconds_left)} left` : ""}
            </span>
          </div>
          {active && run.live_view_url ? (
            <iframe
              key={run.interactive ? "interactive" : "view"}
              src={run.live_view_url}
              title={run.interactive ? "The application form. You have control." : "The application form, as the helper fills it in"}
              style={{ display: "block", width: "100%", aspectRatio: "16/10", border: 0, pointerEvents: run.interactive ? "auto" : "none" }}
              allow="clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
            />
          ) : active && run.has_frame ? (
            // eslint-disable-next-line @next/next/no-img-element -- a live screenshot from our own API, refreshed each poll
            <img src={runFrameUrl(sessionId, run.run_id, tick)} alt="The latest view of the form" style={{ display: "block", width: "100%", aspectRatio: "16/10", objectFit: "contain" }} />
          ) : active ? (
            <div className="ffs">
              <p className="sp-n" style={{ padding: "18px 0" }}>
                Opening the browser…
              </p>
            </div>
          ) : (
            <div className="ffs">
              <p style={{ padding: "14px 0" }}>
                {run.message ??
                  (run.outcome?.status === "not_submitted"
                    ? "The form wasn't sent. You can start again, or apply another way from the program's page."
                    : run.status === "stopped"
                      ? "Stopped. Nothing was sent."
                      : "We couldn't tell whether it went through. Check with the provider before applying again.")}
              </p>
            </div>
          )}
        </div>

        <ol ref={logBox} aria-label="What the helper did" className="ffs" style={{ maxHeight: 220, overflowY: "auto", margin: 0, listStyle: "none", padding: 0 }}>
          {run.steps.length ? (
            run.steps.map((x, i) => (
              <li key={`${x.at}-${i}`} className="ff" style={{ gridTemplateColumns: "1fr" }}>
                <span className={x.kind === "handoff" ? "v tok" : x.kind === "blocked" ? "v" : "v on"}>{x.text}</span>
              </li>
            ))
          ) : (
            <li className="sp-n">Nothing yet.</li>
          )}
        </ol>

        {error ? <p className="qerr">{error}</p> : null}
        <div className="sendrow">
          {run.status === "needs_you" ? (
            <button className="btn go send wide" type="button" disabled={pending} onClick={() => void act(() => controlRun(sessionId, run.run_id, "return"))}>
              {run.handoff?.reason === "stop_point" ? "End here" : "I'm done"} <Arrow />
            </button>
          ) : null}
          {active ? (
            <div className="drow">
              {run.status === "working" || run.status === "needs_answer" ? (
                <button className="btn quiet sm" type="button" disabled={pending} onClick={() => void act(() => controlRun(sessionId, run.run_id, "take"))}>
                  Take over
                </button>
              ) : null}
              <button className="txt-btn" type="button" disabled={pending} onClick={() => void act(() => stopRun(sessionId, run.run_id))}>
                Stop
              </button>
            </div>
          ) : (
            <div className="drow">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  writeRunId(key, null);
                  setRun(null);
                  setError(null);
                }}
              >
                Start again
              </button>
              <button className="txt-btn" type="button" onClick={closeSheet}>
                Close
              </button>
            </div>
          )}
          <small>Only you press Send. We never sign or see your Social Security number.</small>
        </div>
      </div>
    </>
  );
}
