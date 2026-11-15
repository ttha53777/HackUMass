"use client";

import { useEffect, useMemo, useState } from "react";

import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { getPersonas } from "@/lib/api";
import { hubSteps } from "@/lib/hub-derive";
import type { BankSuggestion, PersonaOut, SessionSnapshot } from "@/lib/types";

import { DrawerHead, ReadingPaper, Stepper } from "./drawer";
import { useHub } from "./hub-state";
import { Arrow, Tick } from "./icons";
import { ReviewCard } from "./review-card";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const L = ["Allow", "Check", "Done"];

/** What the simulated bank shows: money in, recurring bills (overdue ones marked). */
function Summary({ s }: { s: SessionSnapshot }) {
  const f = s.financial_summary;
  if (!f) return null;
  return (
    <div className="found" aria-label="From the simulated bank">
      {f.income_sources.map((i) => (
        <div className="bk" key={`in-${i.label}`}>
          <span>{i.label}</span>
          <b>{money(i.avg_monthly)} a month</b>
          <small>Money in · {i.kind === "benefit" ? "a benefit" : i.kind === "wages" ? "pay" : "other"}</small>
        </div>
      ))}
      {f.bills.map((b) => (
        <div className="bk" key={`bill-${b.payee}`}>
          <span>{b.payee}</span>
          <b className={b.status === "overdue" ? "late" : undefined}>
            {b.status === "overdue" ? "Behind · " : ""}
            {money(b.avg_monthly)}
          </b>
          <small>{b.category === "rent" ? "Rent" : b.category === "utilities" ? "Utility bill" : b.category === "phone_internet" ? "Phone or internet" : "Bill"}</small>
        </div>
      ))}
    </div>
  );
}

/** One suggested answer from the bank, applied only on a tap. */
function Suggestion({ sug }: { sug: BankSuggestion }) {
  const { submit, whenIdle, working } = useApp();
  const toast = useToast();
  return (
    <div className="hrw">
      <div>
        <b>{sug.shown}</b>
        <small>{sug.reason}</small>
      </div>
      <button
        className="btn sm"
        type="button"
        disabled={working}
        onClick={async () => {
          await whenIdle();
          const ok = await submit(sug.answer);
          await whenIdle();
          toast(ok ? "Saved. Your plan is updated." : "That didn't save. Try again.");
        }}
      >
        Use this
      </button>
    </div>
  );
}

/**
 * Connect a bank: always the simulated sandbox profiles here, labelled as such. Read-only.
 * Figures it suggests are used only after the person confirms them.
 */
export function BankSheet({ s }: { s: SessionSnapshot }) {
  const { closeSheet } = useHub();
  const { plan } = usePlan();
  const { submitEvidence, disconnectBank, whenIdle, working } = useApp();
  const toast = useToast();
  const connected = !!s.financial_summary;
  const [stage, setStage] = useState<"consent" | "reading" | "check" | "done">(connected ? "check" : "consent");
  const [personas, setPersonas] = useState<PersonaOut[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const steps = useMemo(() => hubSteps(s, plan), [s, plan]);

  useEffect(() => {
    let live = true;
    getPersonas()
      .then((list) => {
        if (!live) return;
        setPersonas(list);
        setPick((p) => p || list[0]?.id || "");
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const review = s.pending_reviews.find((r) => r.simulated);
  const incomeSteps = steps.filter((st) => !st.done && st.pips.some((p) => p.k === "income"));

  const connect = async () => {
    setError(null);
    setStage("reading");
    await whenIdle();
    const problem = await submitEvidence(pick);
    await whenIdle();
    if (problem) {
      setError(problem);
      setStage("consent");
      return;
    }
    setStage("check");
  };

  if (stage === "consent") {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={1} labels={L} />} title="Connect a bank" onClose={closeSheet} />
        <div className="dbody">
          <p>Read-only. We look at income, rent and bills. You confirm every number, and can disconnect any time.</p>
          <p className="mono">This demo uses simulated bank profiles, never a real bank.</p>
          {failed ? (
            <p className="qerr">We couldn&apos;t load the simulated profiles. Try again in a moment.</p>
          ) : !personas ? (
            <div className="skel l" style={{ width: "60%" }} />
          ) : (
            <div className="opts" role="group" aria-label="Simulated profile">
              {personas.map((p) => (
                <button key={p.id} className="opt" type="button" aria-pressed={pick === p.id} onClick={() => setPick(p.id)}>
                  {p.label}
                  <small style={{ display: "block", fontWeight: 400, fontSize: ".82rem", opacity: 0.8 }}>{p.description}</small>
                </button>
              ))}
            </div>
          )}
          <button className="agree" type="button" aria-pressed={consent} onClick={() => setConsent(!consent)}>
            <span className="sq">
              <Tick />
            </span>
            <span>Use this simulated profile for my plan. I&apos;ll check anything it suggests before it counts.</span>
          </button>
          {error ? <p className="qerr">{error}</p> : null}
          <div className="drow">
            <button className={`btn${consent && pick && !working ? "" : " dis"}`} type="button" data-tour="connect" disabled={!consent || !pick || working} onClick={() => void connect()}>
              Connect <Arrow />
            </button>
            <button className="txt-btn" type="button" onClick={closeSheet}>
              Skip
            </button>
          </div>
        </div>
      </>
    );
  }

  if (stage === "reading") {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={2} labels={L} />} title="Looking at recent months" onClose={closeSheet} />
        <div className="dbody">
          <ReadingPaper />
          <p className="mono">Read-only. Nothing can be moved.</p>
        </div>
      </>
    );
  }

  if (stage === "check" && (review || s.bank_suggestions.length)) {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={2} labels={L} />} title="Does this look right?" onClose={closeSheet} />
        <div className="dbody">
          <Summary s={s} />
          {review ? (
            <>
              <p>
                What {review.title} suggests for your answers <span className="src">Simulated</span>
              </p>
              <ReviewCard review={review} onDone={() => setStage("done")} />
            </>
          ) : (
            <>
              <p>
                Answers the bank points to <span className="src">Simulated</span>
              </p>
              {s.bank_suggestions.map((sug) => (
                <Suggestion key={sug.question_id} sug={sug} />
              ))}
              <div className="drow">
                <button className="btn" type="button" data-tour="looks-right" onClick={() => setStage("done")}>
                  Done <Arrow />
                </button>
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <DrawerHead eyebrow={<Stepper at={3} labels={L} />} title={connected ? "Bank connected" : "Not connected"} onClose={closeSheet} />
      <div className="dbody">
        {connected ? (
          <>
            <div className="reuse">
              Your income now counts in {incomeSteps.length} step{incomeSteps.length === 1 ? "" : "s"}
              {incomeSteps.length ? (
                <ul>
                  {incomeSteps.slice(0, 3).map((st) => (
                    <li key={st.id}>
                      <Tick />
                      {st.title}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Summary s={s} />
            <p className="sp-n">Simulated profile · {s.financial_summary?.caveats[0] ?? "Read-only."}</p>
          </>
        ) : (
          <p>Nothing is connected.</p>
        )}
        <div className="drow">
          <button className="btn" type="button" onClick={closeSheet}>
            Done <Arrow />
          </button>
          {connected ? (
            <button
              className="txt-btn"
              type="button"
              style={{ color: "var(--alert)" }}
              disabled={working}
              onClick={async () => {
                const problem = await disconnectBank();
                toast(problem ?? "Disconnected. Everything read from the bank was removed.");
                if (!problem) closeSheet();
              }}
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
