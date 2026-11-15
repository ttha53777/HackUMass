"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { getPersonas } from "@/lib/api";
import { hubSteps } from "@/lib/hub-derive";
import type { BankSuggestion, PersonaOut, SessionSnapshot } from "@/lib/types";

import { AgentFlow } from "./agent-flow";
import { DrawerHead, Stepper } from "./drawer";
import { useHub } from "./hub-state";
import { Arrow, Doodle, Tick } from "./icons";
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

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const BILL_ICON: Record<string, string> = { rent: "n-housing", utilities: "n-heat", phone_internet: "n-phone", other: "docs" };
const BILL_KIND: Record<string, string> = { rent: "Rent", utilities: "Utility", phone_internet: "Phone or internet", other: "Bill" };
const STATUS: Record<string, string> = { paid: "Paid", pending: "Pending", overdue: "Behind" };

/** A hand-drawn icon that fits a simulated profile's label. */
function personaIcon(label: string) {
  const l = label.toLowerCase();
  if (/retir|senior|social security/.test(l)) return "n-senior";
  if (/family|child|kids/.test(l)) return "about";
  if (/unemploy|between jobs|lost/.test(l)) return "e-search";
  if (/part-time|work|pay/.test(l)) return "n-work";
  return "money";
}

/** "Bank connected": the simulated account at a glance, what it changed, and a way out. */
function Connected({
  s,
  label,
  stepTitles,
  onDone,
  onDisconnect,
  busy,
}: {
  s: SessionSnapshot;
  label: string | null;
  stepTitles: { id: string; title: string }[];
  onDone: () => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  const f = s.financial_summary!;
  const income = f.income_sources.length ? f.income_sources.reduce((a, b) => a + b.avg_monthly, 0) : f.avg_monthly_deposits;
  const bills = f.bills.reduce((a, b) => a + b.avg_monthly, 0);
  const left = income - bills;
  const whole = Math.max(income, bills) || 1;
  const behind = f.bills.filter((b) => b.status === "overdue");

  return (
    <div className="bc">
      <section className="bc-acct">
        <div className="bc-top">
          <span className="mono">Simulated account</span>
          <span className="bc-live">
            <i />
            Connected
          </span>
        </div>
        <h4>{label ? label.replace(/^Simulated:\s*/i, "").replace(/^./, (c) => c.toUpperCase()) : "Demo bank profile"}</h4>
        <p className="mono">
          {f.period_start && f.period_end ? `${shortDate(f.period_start)} – ${shortDate(f.period_end)} · ` : ""}Read-only
        </p>
        <Doodle id="e-wallet" className="bc-art" />
      </section>

      <section className="bc-month" aria-label="An average month">
        <div className="bc-sh">
          <span className="mono">An average month</span>
        </div>
        <div className="bc-stats">
          <div>
            <small>Money in</small>
            <b className="in">{money(income)}</b>
          </div>
          <div>
            <small>Bills</small>
            <b>{money(bills)}</b>
          </div>
          <div>
            <small>{left >= 0 ? "Left over" : "Short"}</small>
            <b className={left >= 0 ? "" : "late"}>{money(Math.abs(left))}</b>
          </div>
        </div>
        <div className="bc-bar" aria-hidden="true">
          {f.bills.map((b, i) => (
            <i key={b.payee} className={`c${i % 4}${b.status === "overdue" ? " late" : ""}`} style={{ width: `${(b.avg_monthly / whole) * 100}%`, animationDelay: `${i * 90}ms` }} />
          ))}
          {left > 0 ? <i className="rest" style={{ width: `${(left / whole) * 100}%` }} /> : null}
        </div>
        <div className="bc-key">
          {f.bills.map((b, i) => (
            <span key={b.payee}>
              <i className={`c${i % 4}${b.status === "overdue" ? " late" : ""}`} />
              {b.payee}
            </span>
          ))}
          {left > 0 ? (
            <span>
              <i className="rest" />
              Left over
            </span>
          ) : null}
        </div>
      </section>

      {behind.length ? (
        <div className="bc-alert">
          <Doodle id="warn" />
          <span>
            <b>{behind.map((b) => b.payee).join(" and ")}</b> {behind.length === 1 ? "looks" : "look"} behind on this account.
          </span>
        </div>
      ) : null}

      <section className="bc-list" aria-label="Money in">
        <div className="bc-sh">
          <span className="mono">Money in</span>
          <span className="mono">{money(income)}/mo</span>
        </div>
        <ul>
          {f.income_sources.map((i) => (
            <li key={i.label}>
              <span className="ic in">
                <Doodle id={i.kind === "benefit" ? "benefits" : i.kind === "wages" ? "n-work" : "money"} />
              </span>
              <span className="nm">
                {i.label}
                <small>{i.kind === "benefit" ? "Benefit deposit" : i.kind === "wages" ? "Pay" : "Other deposit"}</small>
              </span>
              <b className="in">+{money(i.avg_monthly)}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="bc-list" aria-label="Bills">
        <div className="bc-sh">
          <span className="mono">Recurring bills</span>
          <span className="mono">{money(bills)}/mo</span>
        </div>
        <ul>
          {f.bills.map((b) => (
            <li key={b.payee}>
              <span className={`ic${b.status === "overdue" ? " late" : ""}`}>
                <Doodle id={BILL_ICON[b.category] ?? "docs"} />
              </span>
              <span className="nm">
                {b.payee}
                <small>
                  {BILL_KIND[b.category] ?? "Bill"}
                  {b.day_of_month ? ` · around the ${ordinal(b.day_of_month)}` : ""}
                </small>
              </span>
              <span className="amt">
                <b>{money(b.avg_monthly)}</b>
                <em className={`st ${b.status}`}>{STATUS[b.status] ?? b.status}</em>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bc-uses">
        <div className="bc-uh">
          <span className="n">{stepTitles.length}</span>
          <span>
            <b>{stepTitles.length === 1 ? "step in your plan uses" : "steps in your plan use"} this income</b>
            <small>Nothing counts until you confirm it.</small>
          </span>
        </div>
        {stepTitles.length ? (
          <ul>
            {stepTitles.slice(0, 4).map((st) => (
              <li key={st.id}>
                <Tick />
                {st.title}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="bc-trust">
        <span>
          <Doodle id="lock" />
          Read-only. Nothing can be moved.
        </span>
        <span>
          <Doodle id="eye" />
          Monthly totals only, never single purchases.
        </span>
      </div>

      <div className="drow bc-foot">
        <button className="btn" type="button" onClick={onDone}>
          Done <Arrow />
        </button>
        <button className="txt-btn bc-off" type="button" disabled={busy} onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
      <p className="sp-n">Simulated demo data, never a real bank. {f.caveats[0] && !/simulated/i.test(f.caveats[0]) ? f.caveats[0] : ""}</p>
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
  // The backend finished linking; the agent flow decides when to move on.
  const [linked, setLinked] = useState(false);
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
    setLinked(false);
    setStage("reading");
    await whenIdle();
    const problem = await submitEvidence(pick);
    await whenIdle();
    if (problem) {
      setError(problem);
      setStage("consent");
      return;
    }
    setLinked(true);
  };

  const flowComplete = useCallback(() => setStage("check"), []);

  if (stage === "consent") {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={1} labels={L} />} title="Connect a bank" onClose={closeSheet} />
        <div className="dbody">
          <p className="bk-lede">
            Read-only. We look at income, rent and bills; you confirm every number and can disconnect any time.
          </p>
          <div className="bk-pick">
            <span className="mono">Pick a simulated profile</span>
            <span className="mono">Never a real bank</span>
          </div>
          {failed ? (
            <p className="qerr">We couldn&apos;t load the simulated profiles. Try again in a moment.</p>
          ) : !personas ? (
            <div className="bk-grid" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="bk-card sk" />
              ))}
            </div>
          ) : (
            <div className="bk-grid" role="group" aria-label="Simulated profile">
              {personas.map((p) => (
                <button key={p.id} className="bk-card" type="button" aria-pressed={pick === p.id} onClick={() => setPick(p.id)} title={p.description}>
                  <span className="ic">
                    <Doodle id={personaIcon(p.label)} />
                  </span>
                  <b>{p.label.replace(/^Simulated:\s*/i, "").replace(/^./, (c) => c.toUpperCase())}</b>
                  <small>{p.description}</small>
                  <span className="rd" aria-hidden="true">
                    <Tick />
                  </span>
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
          <p>Watch the agents read the simulated account, work out your income and test it against each program&apos;s limit.</p>
          <AgentFlow finished={linked} s={s} onComplete={flowComplete} />
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

  const disconnect = async () => {
    const problem = await disconnectBank();
    toast(problem ?? "Disconnected. Everything read from the bank was removed.");
    if (!problem) closeSheet();
  };

  return (
    <>
      <DrawerHead eyebrow={<Stepper at={3} labels={L} />} title={connected ? "Bank connected" : "Not connected"} onClose={closeSheet} />
      <div className="dbody">
        {connected ? (
          <Connected
            s={s}
            label={personas?.find((p) => p.id === s.financial_summary?.persona_id)?.label ?? null}
            stepTitles={incomeSteps.map((st) => ({ id: st.id, title: st.title }))}
            onDone={closeSheet}
            onDisconnect={() => void disconnect()}
            busy={working}
          />
        ) : (
          <>
            <p>Nothing is connected.</p>
            <div className="drow">
              <button className="btn" type="button" onClick={closeSheet}>
                Done <Arrow />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
