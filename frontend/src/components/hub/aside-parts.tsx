"use client";

import Link from "next/link";

import { docLabel } from "@/components/od/doc-kinds";
import { useAnswer } from "@/components/session/answer-provider";
import { usePlan } from "@/components/session/plan-state";
import { useToast } from "@/components/shell/toast";
import { answerFor, walletKinds, walletTexts } from "@/lib/derive";
import { needsOf, toldNeeds, usedIn, type HubStep } from "@/lib/hub-derive";
import type { SessionSnapshot } from "@/lib/types";

import { useHub } from "./hub-state";
import { Doodle, Tick } from "./icons";
import { needLabel } from "./needs";
import { QuestionInput } from "./question-input";

/** "What you told us": needs (tap × to drop one), ZIP and household, and ways to change them. */
export function Told({ s, steps }: { s: SessionSnapshot; steps: HubStep[] }) {
  const { openSheet } = useHub();
  const { answer, working } = useAnswer();
  const toast = useToast();
  const needs = toldNeeds(s, steps);
  const zip = answerFor(s, "zip")?.display_value;
  const sizeN = parseInt(s.profile_summary.find((p) => p.field === "household_size")?.display_value ?? "", 10);
  const size = Number.isFinite(sizeN) ? `${sizeN} ${sizeN === 1 ? "person" : "people"}` : null;

  const drop = (id: string) => {
    const rest = needsOf(s).filter((n) => n !== id);
    if (!rest.length) {
      toast("Keep at least one. Add another first, then take this one off.");
      return;
    }
    void answer({ question_id: "needs", selected_option_ids: rest });
  };

  return (
    <div className="told" role="group" aria-label="What you told us">
      <span className="mono">What you told us</span>
      {needs.map((n) => (
        <span className="ans" key={n.id}>
          {needLabel(n.id)}
          <em>
            {n.count} {n.count === 1 ? "step" : "steps"}
          </em>
          <button className="x" type="button" disabled={working} aria-label={`Remove ${needLabel(n.id)}`} onClick={() => drop(n.id)}>
            ×
          </button>
        </span>
      ))}
      <button className="ans static" type="button" style={{ cursor: "pointer" }} onClick={() => openSheet({ type: "answers", edit: "zip" })}>
        {zip ?? "Add ZIP"}
        {size ? ` · ${size}` : ""}
      </button>
      <button className="addbtn" type="button" onClick={() => openSheet({ type: "needs" })}>
        + Add a need
      </button>
      <button className="addbtn" type="button" data-tour="chat" onClick={() => openSheet({ type: "chat" })}>
        Talk it through
      </button>
      <button className="addbtn" type="button" onClick={() => openSheet({ type: "answers", edit: null })}>
        My answers
      </button>
    </div>
  );
}

/** "One quick question": the backend's most useful open question, or all caught up. */
export function AskBox({ s }: { s: SessionSnapshot }) {
  const { openSheet } = useHub();
  const head = s.open_questions[0];
  if (!head) {
    return (
      <div className="box ask">
        <p className="mono">Questions</p>
        <h3>All caught up.</h3>
        <p>Nothing else would change your plan.</p>
        <div className="askfoot">
          <button className="btn sm" type="button" onClick={() => openSheet({ type: "answers", edit: null })}>
            Review my answers
          </button>
        </div>
      </div>
    );
  }
  const q = head.question;
  const left = s.open_questions.length;
  return (
    <div className="box ask">
      <div className="qprog">
        <p className="mono">One quick question</p>
        <p className="mono">{left === 1 ? "Last one" : `${left} left`}</p>
      </div>
      <div className="qbox">
        <h3>{q.prompt}</h3>
        {q.reason ? <p className="qwhy">{q.reason}</p> : null}
        {head.affects.length ? (
          <p className="qwhy">
            Could settle {head.affects.length} {head.affects.length === 1 ? "program" : "programs"}.
          </p>
        ) : null}
        <QuestionInput key={q.id} question={q} />
      </div>
    </div>
  );
}

const SHOWN = 6;

/** "Your papers": every kind of paper the plan asks for, and how many steps each one counts in. */
export function WalletBox({ s, steps }: { s: SessionSnapshot; steps: HubStep[] }) {
  const { plan } = usePlan();
  const { openSheet } = useHub();
  const all = walletKinds(s, plan);
  // Most-used first; the rest are on the Papers page.
  const kinds = all.slice(0, SHOWN);
  const more = all.length - kinds.length;
  return (
    <div className="box" id="wallet">
      <h3>Your papers</h3>
      {kinds.length ? (
        <div className="wallet">
          {kinds.map((d) => {
            const have = plan.docs.includes(d.kind);
            const n = usedIn(d.kind, steps).length;
            const label = docLabel(d.kind, walletTexts(d));
            return (
              <button
                key={d.kind}
                className="paper"
                type="button"
                aria-pressed={have}
                onClick={() => openSheet(have ? { type: "paper", kind: d.kind } : { type: "upload", kind: d.kind })}
              >
                <span className="sq">
                  <Tick />
                </span>
                <span>
                  <b>{label}</b>
                </span>
                <span className="ct">{have ? `in ${n} step${n === 1 ? "" : "s"}` : "+ add"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-art" style={{ padding: "18px 12px" }}>
          <Doodle id="e-wallet" />
          <p>None of your steps list papers yet.</p>
        </div>
      )}
      <p style={{ fontSize: ".82rem", color: "var(--ink-3)" }}>Stays on this device. You confirm every number we read.</p>
      <Link className="txt-btn" href="/papers" style={{ justifySelf: "start" }}>
        {more ? `Open my papers · ${more} more` : "Open my papers"}
      </Link>
    </div>
  );
}

/** Facts read from a paper or the simulated bank, waiting for the person's yes. */
export function CheckBox({ s }: { s: SessionSnapshot }) {
  const { openSheet } = useHub();
  const n = s.pending_reviews.length;
  if (!n) return null;
  const rows = s.pending_reviews.reduce((sum, r) => sum + r.rows.length, 0);
  return (
    <div className="box" style={{ boxShadow: "0 0 0 2px var(--door)" }}>
      <p className="mono">Check what we read</p>
      <h3>
        {rows} {rows === 1 ? "number" : "numbers"} to check
      </h3>
      <p style={{ fontSize: ".94rem", color: "var(--ink-2)" }}>
        From {s.pending_reviews.map((r) => r.title).join(" and ")}. Nothing is used until you say it looks right.
      </p>
      <div className="askfoot">
        <button className="btn sm" type="button" onClick={() => openSheet({ type: "review" })}>
          Check them
        </button>
      </div>
    </div>
  );
}
