"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAnswer } from "@/components/session/answer-provider";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { clearDevice } from "@/lib/device-state";
import { needsOf, PROVENANCE_LABEL, provenanceOf } from "@/lib/hub-derive";
import type { AnsweredItem, Question, SessionSnapshot } from "@/lib/types";

import { BankSheet } from "./bank-sheet";
import { ChatSheet } from "./chat-sheet";
import { Drawer, DrawerHead } from "./drawer";
import { FormSheet } from "./form-sheet";
import { useHub, type Sheet } from "./hub-state";
import { Arrow, Doodle } from "./icons";
import { ALL_NEEDS, NEED_GROUPS, needIcon } from "./needs";
import { CounterSheet, PaperSheet, ReviewSheet, UploadSheet } from "./paper-sheets";
import { QuestionInput } from "./question-input";

const LABEL: Record<Sheet["type"], string> = {
  needs: "Add a need",
  answers: "Your answers",
  upload: "Add a paper",
  paper: "Saved paper",
  counter: "Show this at the counter",
  review: "Check what we read",
  bank: "Connect a bank",
  form: "Fill the form for me",
  chat: "Talk it through",
};

/** The hub's drawers. Only one is open at a time (useHub().sheet). */
export function HubSheets({ s }: { s: SessionSnapshot }) {
  const { sheet, closeSheet } = useHub();
  // A new key per drawer and target, so a flow starts fresh (e.g. "Add another").
  const key = sheet ? JSON.stringify(sheet.type === "answers" ? { type: "answers" } : sheet) : "none";
  return (
    <Drawer open={!!sheet} label={sheet ? LABEL[sheet.type] : "Drawer"} onClose={closeSheet} full={sheet?.type === "counter"} chat={sheet?.type === "chat"}>
      <div key={key} style={{ display: "contents" }}>
        {sheet?.type === "needs" ? <NeedsSheet s={s} /> : null}
        {sheet?.type === "answers" ? <AnswersSheet s={s} edit={sheet.edit} /> : null}
        {sheet?.type === "upload" ? <UploadSheet s={s} kind={sheet.kind} /> : null}
        {sheet?.type === "paper" ? <PaperSheet s={s} kind={sheet.kind} /> : null}
        {sheet?.type === "counter" ? <CounterSheet s={s} kinds={sheet.kinds} /> : null}
        {sheet?.type === "review" ? <ReviewSheet s={s} /> : null}
        {sheet?.type === "bank" ? <BankSheet s={s} /> : null}
        {sheet?.type === "form" ? <FormSheet s={s} id={sheet.id} /> : null}
        {sheet?.type === "chat" ? <ChatSheet s={s} /> : null}
      </div>
    </Drawer>
  );
}

function NeedsSheet({ s }: { s: SessionSnapshot }) {
  const { closeSheet, openSheet } = useHub();
  const { answer, working } = useAnswer();
  const toast = useToast();
  const [q, setQ] = useState("");
  const chosen = needsOf(s);

  const toggle = (id: string) => {
    const on = chosen.includes(id);
    if (on && chosen.length === 1) {
      toast("Keep at least one. Add another first, then take this one off.");
      return;
    }
    void answer({ question_id: "needs", selected_option_ids: on ? chosen.filter((n) => n !== id) : [...chosen, id] });
  };

  const words = q.trim().toLowerCase();
  const match = (id: string) => {
    const n = ALL_NEEDS.find((x) => x.id === id);
    return !words || (n ? `${n.label} ${n.hint}`.toLowerCase().includes(words) : false);
  };
  const groups = NEED_GROUPS.map((g) => ({ ...g, ids: g.ids.filter(match) })).filter((g) => g.ids.length);

  return (
    <>
      <DrawerHead eyebrow="Add a need" title="What do you need help with?" onClose={closeSheet} />
      <div className="dbody">
        <p>Pick any. Each one adds steps. Take one off any time.</p>
        <label className="psearch">
          <Doodle id="search" />
          <span className="sr">Search needs</span>
          <input type="search" placeholder="Search, like rent or diapers" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="chatlink" type="button" onClick={() => openSheet({ type: "chat" })}>
          <Doodle id="chat" />
          <span>Not sure which? Tell us in your own words.</span>
        </button>
        <div style={{ display: "grid", gap: 14 }}>
          {groups.length ? (
            groups.map((g) => (
              <div className="pgroup" key={g.label}>
                <h4>{g.label}</h4>
                <div className="pgrid">
                  {g.ids.map((id) => {
                    const n = ALL_NEEDS.find((x) => x.id === id)!;
                    return (
                      <button key={id} className="pneed" type="button" aria-pressed={chosen.includes(id)} disabled={working} onClick={() => toggle(id)}>
                        <Doodle id={needIcon(id)} />
                        <b>{n.label}</b>
                        <small>{n.hint}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-art" style={{ padding: "24px 12px" }}>
              <Doodle id="e-search" />
              <h3>No match</h3>
              <p>Try other words. If nothing fits, Dial 211 for free help finding services.</p>
            </div>
          )}
        </div>
        <div className="drow">
          <button className="btn" type="button" onClick={closeSheet}>
            Done · {chosen.length} on your plan <Arrow />
          </button>
        </div>
      </div>
    </>
  );
}

type Row = { question: Question; item: AnsweredItem | null };

function AnswersSheet({ s, edit }: { s: SessionSnapshot; edit: string | null }) {
  const { closeSheet, openSheet } = useHub();
  const { restart } = useApp();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Everything the plan is based on, then the questions still open.
  const answered: Row[] = s.answered.map((a) => ({ question: a.question, item: a }));
  const seen = new Set(answered.map((r) => r.question.id));
  const rows: Row[] = [...answered, ...s.open_questions.filter((o) => !seen.has(o.question.id)).map((o) => ({ question: o.question, item: null }))];

  useEffect(() => {
    if (edit) document.getElementById(`ar-${edit}`)?.scrollIntoView({ block: "center" });
  }, [edit]);

  const setEdit = (id: string | null) => openSheet({ type: "answers", edit: id });

  const startOver = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      timer.current = window.setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    clearDevice();
    await restart();
    router.replace("/");
  };

  return (
    <>
      <DrawerHead eyebrow="About you" title="Your answers" onClose={closeSheet} />
      <div className="dbody">
        <p>This is everything your plan is based on. Change any answer and the plan updates right away.</p>
        <div>
          {rows.map(({ question, item }) => {
            const editing = edit === question.id;
            const skipped = !!item?.skipped;
            const label = s.profile_summary.find((p) => p.field === question.target_field)?.label ?? question.prompt;
            const prov = item && !skipped ? provenanceOf(s, question.target_field) : null;
            return (
              <div className={`ar${skipped ? " skipped" : ""}`} key={question.id} id={`ar-${question.id}`}>
                <div className="k">
                  <span>
                    {label}
                    {prov ? <span className={`src${prov === "user_reported" ? "" : " doc"}`}>{PROVENANCE_LABEL[prov]}</span> : null}
                  </span>
                  <button className="txt-btn" type="button" onClick={() => setEdit(editing ? null : question.id)}>
                    {editing ? "Cancel" : item && !skipped ? "Edit" : "Answer"}
                  </button>
                </div>
                <b>{item ? (skipped ? "Skipped" : item.display_value) : "Not answered yet"}</b>
                {editing ? (
                  <div className="edit">
                    <p style={{ fontWeight: 700 }}>{question.prompt}</p>
                    {question.reason ? <p className="qwhy">{question.reason}</p> : null}
                    <QuestionInput question={question} current={item ?? undefined} onSent={() => setEdit(null)} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="drow">
          <button className="btn" type="button" onClick={closeSheet}>
            Done <Arrow />
          </button>
          <button className="txt-btn" type="button" style={{ color: "var(--alert)" }} onClick={() => void startOver()} aria-live="polite">
            {confirmReset ? "Tap again to clear everything" : "Start over"}
          </button>
        </div>
      </div>
    </>
  );
}
