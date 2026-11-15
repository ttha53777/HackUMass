"use client";

import { useAnswer } from "@/components/session/answer-provider";
import { usePlan } from "@/components/session/plan-state";
import { useToast } from "@/components/shell/toast";
import { reasonLine } from "@/lib/derive";
import { FIT_CLASS, FIT_LABEL, LANES, type HubCase, type HubStep, type Pip } from "@/lib/hub-derive";

import { useHub } from "./hub-state";
import { Arrow, Doodle, Mini, Tick } from "./icons";
import { needIcon, needLabel } from "./needs";

const KIND_LABEL = { gov: "Government", local: "Local" } as const;

function KindPill({ st }: { st: HubStep }) {
  return (
    <span className={`kind ${st.kind}`}>
      <Doodle id={st.kind === "gov" ? "benefits" : "local"} />
      {KIND_LABEL[st.kind]}
    </span>
  );
}

/** What a step's blocking pip asks for, as something to do now. */
function usePipAction(incomeId: string | null) {
  const { openSheet } = useHub();
  return (pip: Pip): (() => void) | null => {
    if (pip.k === "papers" && pip.kind) return () => openSheet({ type: "upload", kind: pip.kind });
    if (pip.k === "income" && incomeId) return () => openSheet({ type: "answers", edit: incomeId });
    return null;
  };
}

/** The first thing standing between the person and this step, as a button. */
function blocker(st: HubStep): Pip | undefined {
  return st.pips.find((p) => !p.ok && p.k !== "form");
}

function Pips({ st, act }: { st: HubStep; act: (p: Pip) => (() => void) | null }) {
  if (!st.pips.length) return null;
  return (
    <div className="pips">
      {st.pips.map((p) => {
        const onClick = p.ok ? null : act(p);
        const icon = p.k === "papers" ? "docs" : p.k === "income" ? "money" : "form";
        const cls = `pip${p.ok ? " ok" : ""}${p.k === "form" && p.sent ? " sent" : ""}`;
        const body = (
          <>
            {p.ok ? <Tick className="mi" /> : <Mini id={icon} />}
            {p.label}
          </>
        );
        return onClick ? (
          <button key={p.k} className={cls} type="button" title={p.label} onClick={onClick}>
            {body}
          </button>
        ) : (
          <span key={p.k} className={cls} title={p.label}>
            {body}
          </span>
        );
      })}
    </div>
  );
}

function DoneCheck({ st }: { st: HubStep }) {
  const { toggleDone } = usePlan();
  const toast = useToast();
  return (
    <button
      className="check"
      type="button"
      aria-pressed={st.done}
      disabled={st.sent}
      onClick={() => {
        toggleDone(st.id);
        if (!st.done) toast("Nice. One step closer to an open door.");
      }}
    >
      <span>
        <Tick />
      </span>
      {st.sent ? "Sent by you" : st.done ? "Done" : "Mark done"}
    </button>
  );
}

export function StepCard({ st, incomeId }: { st: HubStep; incomeId: string | null }) {
  const { moved } = useAnswer();
  const { openSheet, openSpot } = useHub();
  const act = usePipAction(incomeId);
  const b = st.done ? undefined : blocker(st);
  const go = b ? act(b) : null;
  const cls = ["card", `k-${st.kind}`, st.urgent && !st.done ? "urgent" : "", st.done ? "done" : "", moved.has(st.id) ? "flash" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={cls} id={`c-${st.id}`}>
      <div className="top">
        <KindPill st={st} />
        <span className={`fit ${FIT_CLASS[st.fit]}`}>{FIT_LABEL[st.fit]}</span>
      </div>
      <h4>
        <button className="ttl" type="button" onClick={() => openSpot(st.id)}>
          {st.title}
        </button>
      </h4>
      {st.need ? (
        <p className="helpsline">
          <Doodle id={needIcon(st.need)} />
          <span>
            For <b>{needLabel(st.need)}</b>
          </span>
        </p>
      ) : null}
      <p className="why">{reasonLine(st.card)}</p>
      {st.fit === "need" && st.asks[0] && !st.done ? (
        <button
          className="txt-btn"
          type="button"
          style={{ justifySelf: "start", fontSize: ".92rem" }}
          onClick={() => openSheet({ type: "answers", edit: st.asks[0] })}
        >
          {st.asks.length === 1 ? "Answer 1 question to settle this" : `Answer ${st.asks.length} questions to settle this`}
        </button>
      ) : null}
      <Pips st={st} act={act} />
      {b && go ? (
        <button className="go" type="button" onClick={go}>
          <span>{b.label.charAt(0).toUpperCase() + b.label.slice(1)}</span>
          <Arrow />
        </button>
      ) : null}
      <div className="foot">
        <button className="txt-btn more" type="button" onClick={() => openSpot(st.id)}>
          More about this <Arrow />
        </button>
        <DoneCheck st={st} />
      </div>
    </article>
  );
}

export function SlimRow({ st }: { st: HubStep }) {
  const { moved } = useAnswer();
  const { openSpot } = useHub();
  const ok = st.pips.filter((p) => p.ok).length;
  const cls = ["slim", `k-${st.kind}`, st.done ? "done" : "", moved.has(st.id) ? "flash" : ""].filter(Boolean).join(" ");
  return (
    <button className={cls} type="button" id={`c-${st.id}`} onClick={() => openSpot(st.id)}>
      <b>{st.title}</b>
      <span className={`fit ${FIT_CLASS[st.fit]}`}>{FIT_LABEL[st.fit]}</span>
      <span className="sub">
        <span className={`kmini ${st.kind}`}>{KIND_LABEL[st.kind]}</span>
        {st.need ? needLabel(st.need) : null}
        {st.done ? " · done" : st.pips.length ? ` · ${ok} of ${st.pips.length} ready` : ""}
      </span>
    </button>
  );
}

export function NextCard({ st, incomeId }: { st: HubStep | undefined; incomeId: string | null }) {
  const act = usePipAction(incomeId);
  const { openSheet, openSpot } = useHub();
  if (!st) {
    return (
      <div className="next">
        <p className="mono">All caught up</p>
        <h3>The door is wide open.</h3>
        <p>Every step is done. Add a need if something new comes up.</p>
        <div className="row">
          <button className="btn light" type="button" onClick={() => openSheet({ type: "needs" })}>
            Add a need <Arrow />
          </button>
        </div>
      </div>
    );
  }
  const ok = st.pips.filter((p) => p.ok).length;
  const b = blocker(st);
  const go = b ? act(b) : null;
  return (
    <div className="next" id="next">
      <span className="hand note">start here</span>
      <p className="mono">Do this first</p>
      <h3>{st.title}</h3>
      <p>{st.action?.next_step ?? reasonLine(st.card)}</p>
      <div className="meta">
        <span>{st.card.program.provider}</span>
        {st.pips.length ? (
          <span>
            {ok} of {st.pips.length} ready
          </span>
        ) : null}
      </div>
      <div className="row">
        {b && go ? (
          <button className="btn light" type="button" onClick={go}>
            {b.label.charAt(0).toUpperCase() + b.label.slice(1)} <Arrow />
          </button>
        ) : (
          <button className="btn light" type="button" onClick={() => openSpot(st.id)}>
            See how <Arrow />
          </button>
        )}
        <button className="txt-btn lite" type="button" onClick={() => openSpot(st.id)}>
          More about this
        </button>
      </div>
      <svg className="dd doodle" viewBox="0 0 160 110" aria-hidden="true">
        <path d="M10 100 H150 M24 100 V44 L80 12 L136 44 V100 M64 100 V64 H96 V100 M110 56 H126 V70 H110 Z M100 24 V10 H114 V32" strokeWidth={2.6} />
      </svg>
    </div>
  );
}

export function Banner({ which, steps, onChangeZip }: { which: HubCase; steps: HubStep[]; onChangeZip: () => void }) {
  const { openSpot } = useHub();
  if (which === "offline") {
    return (
      <div className="banner quiet">
        <Doodle id="warn" />
        <span>You are offline. Your plan stays on screen; answers wait until you reconnect.</span>
      </div>
    );
  }
  if (which === "nomatch") {
    return (
      <div className="banner info">
        <Doodle id="warn" />
        <span>We have not checked programs for that ZIP code yet.</span>
        <button className="btn" type="button" onClick={onChangeZip}>
          Change ZIP
        </button>
      </div>
    );
  }
  const u = steps.find((st) => st.deadline && !st.done);
  if (which === "urgent" && u) {
    return (
      <div className="banner urgent">
        <Doodle id="warn" />
        <span>
          <b>Do this today.</b> {u.title}
        </span>
        <button className="btn" type="button" onClick={() => openSpot(u.id)}>
          Open
        </button>
      </div>
    );
  }
  return null;
}

export function Filters({ steps }: { steps: HubStep[] }) {
  const { kind, setKind, need, setNeed } = useHub();
  const open = steps.filter((st) => !st.done);
  const opts = [
    { id: null, label: "All", n: open.length },
    { id: "gov" as const, label: "Government", n: open.filter((st) => st.kind === "gov").length },
    { id: "local" as const, label: "Local", n: open.filter((st) => st.kind === "local").length },
  ].filter((o) => o.id === null || o.n > 0 || kind === o.id);
  const needs = [...new Set(open.map((st) => st.need).filter((n): n is string => !!n))];
  return (
    <>
      <div className="filters" role="group" aria-label="Filter the plan">
        {opts.map((o) => (
          <button key={o.label} className="chip" type="button" aria-pressed={kind === o.id} onClick={() => setKind(kind === o.id ? null : o.id)}>
            {o.label} <b style={{ fontWeight: 700, opacity: 0.75 }}>{o.n}</b>
          </button>
        ))}
      </div>
      {needs.length > 2 ? (
        <>
          <p className="flabel">Show what helps with</p>
          <div className="filters needs2" role="group" aria-label="Show what helps with">
            {needs.map((id) => (
              <button key={id} className="chip" type="button" aria-pressed={need === id} onClick={() => setNeed(need === id ? null : id)}>
                <Doodle id={needIcon(id)} />
                {needLabel(id)}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

export function Lanes({ steps, next, incomeId }: { steps: HubStep[]; next: HubStep | undefined; incomeId: string | null }) {
  const { kind, need, setKind, setNeed } = useHub();
  const shown = steps.filter((st) => (!kind || st.kind === kind) && (!need || st.need === need));
  const lanes = LANES.map((l) => {
    const items = shown
      .filter((st) => st.lane === l.id && !(next && st.id === next.id))
      .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.deadline) - Number(a.deadline) || Number(b.urgent) - Number(a.urgent));
    return { ...l, items };
  }).filter((l) => l.items.length);

  if (!lanes.length && (kind || need)) {
    return (
      <div style={{ marginTop: 26 }}>
        <div className="empty-art">
          <Doodle id="e-search" />
          <h3>Nothing in this filter</h3>
          <p>Your other steps are still on the plan.</p>
          <div className="drow">
            <button
              className="btn quiet"
              type="button"
              onClick={() => {
                setKind(null);
                setNeed(null);
              }}
            >
              Show everything
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {lanes.map((l) => {
        const full = l.id === "today";
        return (
          <section className="lane" key={l.id} aria-label={l.label}>
            <div className="lane-h">
              <Doodle id={l.icon} />
              <h3>{l.label}</h3>
              <span className="mono">{l.items.filter((st) => !st.done).length} to do</span>
            </div>
            <div className={full ? "cards" : "stack"}>
              {l.items.map((st) =>
                full && !st.done ? <StepCard key={st.id} st={st} incomeId={incomeId} /> : <SlimRow key={st.id} st={st} />,
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}
