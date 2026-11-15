"use client";

import { useEffect, useRef, useState } from "react";

import { useAnswer } from "@/components/session/answer-provider";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { interpretMessage, isApiError } from "@/lib/api";
import { hubSteps, needsOf, selectedIds } from "@/lib/hub-derive";
import type { AnswerIn, SessionSnapshot } from "@/lib/types";

import { DrawerHead } from "./drawer";
import { useHub, type ChatMsg } from "./hub-state";
import { Arrow, Doodle, Tick } from "./icons";
import { needLabel, needIcon } from "./needs";

const STARTERS = [
  "I got a shutoff notice",
  "I'm behind on rent and I have two kids",
  "I just lost my job and I'm hungry",
  "I'm pregnant and need help with food",
];

/** How a proposed follow-up reads on the "Here is what I heard" card. Interface copy only. */
const FACT_LABEL: Record<string, Record<string, string>> = {
  utility_issues: { shutoff: "Shutoff notice", broken: "Heat is broken", heat: "Paying for heat", bills: "Bills too high" },
  housing_need: { tonight: "Need a place tonight", behind: "Behind on rent", search: "Looking for housing" },
  household_who: { child: "Child under 5 or pregnancy", "60": "Someone 60 or older", "55": "Someone 55 to 59" },
};
const factLabels = (a: AnswerIn) => (a.selected_option_ids ?? []).map((id) => FACT_LABEL[a.question_id]?.[id] ?? id);

const PICKS = ["food", "utilities", "housing", "healthcare", "employment", "childcare"];

/**
 * "Talk it through": the person describes things in their own words. The backend reads the
 * message (a proposal only), the card shows what it heard, and nothing is added until they tap
 * Add to my plan. Safety lines come from curated records and are shown first.
 */
export function ChatSheet({ s }: { s: SessionSnapshot }) {
  const { closeSheet, chat, setChat } = useHub();
  const { answer } = useAnswer();
  const { plan } = usePlan();
  const app = useApp();
  const toast = useToast();
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [adding, setAdding] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // Latest snapshot and plan, readable after awaiting answers.
  const latest = useRef({ s: app.snapshot, plan });
  useEffect(() => {
    latest.current = { s: app.snapshot, plan };
  });

  useEffect(() => {
    if (!chat.length) setChat(() => [{ r: "bot", kind: "text", t: "Tell me what is going on, in your own words. I turn it into steps. You decide what goes on your plan, and only you press Send." }]);
  }, [chat.length, setChat]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [chat.length, thinking]);

  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus(), 350);
    return () => window.clearTimeout(t);
  }, []);

  const push = (...msgs: ChatMsg[]) => setChat((cur) => [...cur, ...msgs]);

  const send = async (raw: string) => {
    const said = raw.trim();
    if (!said || thinking) return;
    setText("");
    push({ r: "me", t: said });
    setThinking(true);
    try {
      const out = await interpretMessage(s.session_id, { question_id: "needs", text: said });
      const replies: ChatMsg[] = [];
      if (out.safety === "urgent") replies.push({ r: "bot", kind: "safety", contacts: out.safety_contacts });
      if (out.off_topic) {
        replies.push({ r: "bot", kind: "text", t: "I can only help find support near you. Tell me what you need help with, like food, heat or rent." });
      } else {
        const needs = out.answer?.selected_option_ids ?? [];
        const facts = out.proposed ?? [];
        if (out.reply) replies.push({ r: "bot", kind: "text", t: out.reply });
        if (needs.length || facts.length) {
          replies.push({ r: "bot", kind: "heard", needs, facts, sel: Object.fromEntries(needs.map((n) => [n, true])), done: false });
        } else if (out.safety !== "urgent") {
          replies.push({ r: "bot", kind: "pick", t: "I could not tell which kind of help that is. Tap the closest one, or say a little more.", opts: PICKS });
        }
        if (out.unsupported_needs.length) {
          replies.push({ r: "bot", kind: "text", t: "Some of that is outside what we can search here. Dial 211 any time for free help finding services." });
        }
      }
      push(...replies);
    } catch (e) {
      push({ r: "bot", kind: "text", t: isApiError(e) ? e.message : "I couldn't read that just now. Try again in a moment." });
    } finally {
      setThinking(false);
    }
  };

  const toggle = (i: number, id: string) =>
    setChat((cur) => cur.map((m, j) => (j === i && m.r === "bot" && m.kind === "heard" && !m.done ? { ...m, sel: { ...m.sel, [id]: !m.sel[id] } } : m)));

  const add = async (i: number) => {
    const m = chat[i];
    if (!m || m.r !== "bot" || m.kind !== "heard" || m.done || adding) return;
    setAdding(true);
    try {
      const snap = latest.current.s;
      if (!snap) return;
      const before = new Set(snap.programs.map((c) => c.program.id));
      const current = needsOf(snap);
      const wanted = m.needs.filter((n) => m.sel[n] && !current.includes(n));
      if (wanted.length) await answer({ question_id: "needs", selected_option_ids: [...current, ...wanted] }, { quiet: true });
      // Facts go only to questions the backend has open (or already answered) now.
      for (const fact of m.facts) {
        const now = latest.current.s;
        if (!now) break;
        const askable = now.open_questions.some((o) => o.question.id === fact.question_id) || now.answered.some((a) => a.question_id === fact.question_id);
        if (!askable) continue;
        const prior = now.answered.find((a) => a.question_id === fact.question_id);
        // A multi-choice answer keeps what the person already picked ("none" gives way to a real pick).
        const merged =
          prior && prior.question.type === "multi_select"
            ? { ...fact, selected_option_ids: [...new Set([...selectedIds(prior), ...(fact.selected_option_ids ?? [])])].filter((id) => id !== "none") }
            : fact;
        await answer(merged, { quiet: true });
      }
      const after = latest.current.s;
      const steps = after ? hubSteps(after, latest.current.plan) : [];
      const added = after ? after.programs.filter((c) => !before.has(c.program.id)).length : 0;
      const urgent = steps.find((st) => st.deadline && !st.done);
      setChat((cur) => cur.map((x, j) => (j === i && x.r === "bot" && x.kind === "heard" ? { ...x, done: true } : x)));
      push({
        r: "bot",
        kind: "added",
        t: added ? `Added ${added} step${added === 1 ? "" : "s"} to your plan` : "Your plan is updated",
        sub: urgent ? `Most urgent: ${urgent.title}.` : "Start with the green card.",
      });
      toast(added ? `Got it. ${added} new ${added === 1 ? "program" : "programs"} to look at.` : "Got it. Your plan is updated.");
    } finally {
      setAdding(false);
    }
  };

  const pick = (id: string) => {
    push({ r: "me", t: needLabel(id) }, { r: "bot", kind: "heard", needs: [id], facts: [], sel: { [id]: true }, done: false });
  };

  const onPlan = needsOf(s);

  return (
    <>
      <DrawerHead eyebrow="Talk it through" title="What is going on?" onClose={closeSheet} />
      <div className="msgs" ref={box} aria-live="polite">
        {chat.map((m, i) => {
          if (m.r === "me") {
            return (
              <div className="msg me" key={i}>
                <div className="bub">{m.t}</div>
              </div>
            );
          }
          if (m.kind === "text") {
            return (
              <div className="msg" key={i}>
                <div className="bub">{m.t}</div>
              </div>
            );
          }
          if (m.kind === "safety") {
            return (
              <div className="msg" key={i}>
                <div className="safety">
                  <h4>Your safety comes first.</h4>
                  <p>
                    If you are in danger right now, call <b>911</b>. If you might hurt yourself, call or text <b>988</b>.
                  </p>
                  {m.contacts.length ? (
                    <ul style={{ margin: 0, paddingLeft: "1.1em" }}>
                      {m.contacts.map((c) => (
                        <li key={c.name}>
                          <b>{c.name}</b>: {c.contact}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="drow">
                    <a href="tel:911">Call 911</a>
                    <a href="tel:988">Call 988</a>
                  </div>
                </div>
              </div>
            );
          }
          if (m.kind === "pick") {
            return (
              <div className="msg" key={i}>
                <div className="bub">{m.t}</div>
                <div className="qr">
                  {m.opts.map((id) => (
                    <button key={id} type="button" onClick={() => pick(id)}>
                      {needLabel(id)}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          if (m.kind === "added") {
            return (
              <div className="msg" key={i}>
                <div className="added">
                  <h4>{m.t}</h4>
                  <p style={{ color: "var(--ink-2)" }}>{m.sub}</p>
                  <div className="drow">
                    <button className="btn sm" type="button" data-tour="seeplan" onClick={closeSheet}>
                      See my plan <Arrow />
                    </button>
                  </div>
                </div>
              </div>
            );
          }
          const newOnes = m.needs.filter((id) => m.sel[id] && !onPlan.includes(id)).length;
          return (
            <div className="msg" key={i}>
              <div className="heard">
                <h4>Here is what I heard</h4>
                {m.needs.length ? (
                  <div className="hn">
                    {m.needs.map((id) => {
                      const already = onPlan.includes(id) && !m.done;
                      return (
                        <button
                          key={id}
                          className={`hrow${already ? " on-plan" : ""}`}
                          type="button"
                          aria-pressed={!!m.sel[id] || already}
                          disabled={m.done || already}
                          onClick={() => toggle(i, id)}
                        >
                          <Doodle id={needIcon(id)} />
                          <span>
                            <b>{needLabel(id)}</b>
                            <small>{already ? "Already on your plan" : "Adds its steps"}</small>
                          </span>
                          <span className="sq">
                            <Tick />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {m.facts.length ? (
                  <div>
                    <p className="mono" style={{ marginBottom: 6 }}>
                      Also picked up
                    </p>
                    <div className="facts">
                      {m.facts.flatMap(factLabels).map((f) => (
                        <span className="fact" key={f}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {m.done ? (
                  <p className="mono">Added to your plan</p>
                ) : (
                  <div className="drow">
                    <button className={`btn sm${(newOnes || m.facts.length) && !adding ? "" : " dis"}`} type="button" data-tour="add" disabled={(!newOnes && !m.facts.length) || adding} onClick={() => void add(i)}>
                      {adding ? "Adding…" : "Add to my plan"} <Arrow />
                    </button>
                    <span className="chint">Nothing is sent anywhere.</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {thinking ? (
          <div className="msg">
            <div className="bub typing" aria-label="Reading">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : null}
      </div>
      <div className="composer">
        {chat.length <= 1 ? (
          <div className="starters">
            {STARTERS.map((t) => (
              <button key={t} type="button" onClick={() => void send(t)}>
                {t}
              </button>
            ))}
          </div>
        ) : null}
        <div className="cbox">
          <textarea
            ref={input}
            rows={1}
            maxLength={500}
            placeholder="For example: I got a shutoff notice and I have two kids"
            aria-label="Describe what is going on"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <button className="btn" type="button" data-tour="send" disabled={!text.trim() || thinking} onClick={() => void send(text)}>
            Send
          </button>
        </div>
        <p className="chint">Enter to send. This is not a crisis line: call 911 if you are in danger, or call or text 988.</p>
      </div>
    </>
  );
}
