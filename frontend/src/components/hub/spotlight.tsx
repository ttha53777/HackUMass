"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { docLabel } from "@/components/od/doc-kinds";
import { HowWeChecked } from "@/components/program/how-we-checked";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { answerFor, docsFor, guideNotes, phoneOf, reasonLine } from "@/lib/derive";
import { readName } from "@/lib/device-state";
import { formatDate } from "@/lib/format";
import { FIT_CLASS, FIT_LABEL, stepFor, type HubStep } from "@/lib/hub-derive";
import type { CheckKind, GuideWay } from "@/lib/types";

import { useHub } from "./hub-state";
import { Arrow, Doodle, Tick } from "./icons";
import { needIcon, needLabel } from "./needs";

const WAY_ICON: Record<GuideWay["kind"], string> = {
  phone: "n-phone",
  online: "n-immigration",
  in_person: "about",
  walk_in: "local",
  mail: "docs",
  email: "chat",
};
const WAY_LABEL: Record<GuideWay["kind"], string> = {
  phone: "By phone",
  online: "Online",
  in_person: "In person",
  walk_in: "Walk in",
  mail: "By mail",
  email: "By email",
};
const ACCESS_LABEL: Record<string, string> = { walk_in: "Walk in", register: "Register", call: "Call", apply: "Apply" };

/** Why-list styling per check kind: ticks for what fits, a question for what's open, a dash for the rest. */
const CHECK_CLASS: Partial<Record<CheckKind, string>> = { ask: "q", fail: "n", later: "n", note: "n", unsure: "q" };

const telOf = (phone: string) => `tel:${phone.replace(/[^\d]/g, "")}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sc">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="sc fold">
      <summary>{title}</summary>
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}

/** The best way to act on a step, as a link: the guide's best way, else apply page, else phone. */
export function bestAction(st: HubStep): { label: string; href: string } | null {
  const p = st.card.program;
  const ways = p.guide?.ways ?? [];
  const best = ways.find((w) => w.best) ?? ways[0];
  if (best?.url) return { label: best.kind === "online" ? "Apply online" : best.title, href: best.url };
  if (best?.phone) return { label: `Call ${best.phone}`, href: telOf(best.phone) };
  if (p.apply_url) return { label: "Apply online", href: p.apply_url };
  const phone = phoneOf(p.contact);
  if (phone) return { label: `Call ${phone}`, href: telOf(phone) };
  return null;
}

/** "More about this": one program, everything it takes to act on it, from its own record. */
export function Spotlight() {
  const { snapshot: s } = useApp();
  const { plan, toggleDone } = usePlan();
  const { spot, closeSpot, openSpot, openSheet } = useHub();
  const toast = useToast();
  const body = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    setName(readName());
  }, []);

  useEffect(() => {
    if (!spot) return;
    body.current?.scrollTo(0, 0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSpot();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spot, closeSpot]);

  const st = s && spot ? stepFor(s, plan, spot) : null;
  const open = !!st;

  let content: ReactNode = null;
  if (s && st) {
    const p = st.card.program;
    const g = p.guide;
    const docs = docsFor(p);
    const missing = docs.filter((d) => !plan.docs.includes(d.kind));
    const ways = [...(g?.ways ?? [])].sort((a, b) => Number(b.best) - Number(a.best));
    const phone = ways.find((w) => w.phone)?.phone ?? phoneOf(p.contact);
    const zip = answerFor(s, "zip")?.display_value ?? "";
    const checks = st.card.assessment?.checks ?? [];
    const notes = guideNotes(s, st.card);
    const action = bestAction(st);
    const papers =
      p.documents_needed === null ? "Not listed" : docs.length ? `${docs.length - missing.length} of ${docs.length} ready` : "None listed";
    const glance: [string, string, boolean][] = [
      ["Cost", g?.cost ?? "Ask them", false],
      ["When", g?.when ?? p.program_period ?? "Not listed", false],
      ["Best way", ways[0] ? WAY_LABEL[ways[0].kind] : p.access ? ACCESS_LABEL[p.access] : p.apply_url ? "Online" : "Contact them", false],
      ["Papers", papers, docs.length > 0 && !missing.length],
    ];
    const related = (ids: string[]) =>
      ids.map((id) => stepFor(s, plan, id)).filter((x): x is HubStep => !!x && x.fit !== "out");
    const denied = related(g?.if_denied ?? []);
    const unlocks = related(g?.unlocks ?? []);

    content = (
      <>
        <div className={`sp-h ${st.kind}`}>
          <button className="sp-x" type="button" aria-label="Close" onClick={closeSpot}>
            ×
          </button>
          <div className="sp-row">
            <span className={`kind ${st.kind}`}>
              <Doodle id={st.kind === "gov" ? "benefits" : "local"} />
              {st.kind === "gov" ? "Government" : "Local"}
            </span>
            <span className={`fit ${FIT_CLASS[st.fit]}`}>{FIT_LABEL[st.fit]}</span>
          </div>
          <h2 id="spot-title">{st.title}</h2>
          <div className="sp-by">
            {st.need ? (
              <span>
                <Doodle id={needIcon(st.need)} />
                Helps with <b>{needLabel(st.need)}</b>
              </span>
            ) : null}
            <span>
              <Doodle id={st.kind === "gov" ? "benefits" : "local"} />
              Run by <b>{p.provider}</b>
            </span>
          </div>
          <Doodle id={st.kind === "gov" ? "benefits" : "local"} className="art" />
        </div>

        <div className="sp-b" ref={body}>
          <p style={{ color: "var(--ink-2)" }}>{g?.what ?? p.description}</p>
          <div className="gl">
            {glance.map(([label, value, ok]) => (
              <div key={label} className={ok ? "ok" : undefined}>
                <small>{label}</small>
                <b>{value}</b>
              </div>
            ))}
          </div>

          <Section title="Why it may fit you">
            <ul>
              {(checks.length ? checks : [{ kind: "note" as CheckKind, text: reasonLine(st.card), evidence: null, question_id: null }]).map((c, i) => (
                <li key={i} className={CHECK_CLASS[c.kind]}>
                  <Tick className="mi" />
                  <span>
                    {c.text}
                    {c.kind === "ask" && c.question_id ? (
                      <>
                        {" "}
                        <button className="txt-btn" type="button" onClick={() => openSheet({ type: "answers", edit: c.question_id })}>
                          Answer it
                        </button>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
              {notes.map((n) => (
                <li key={n}>
                  <Tick className="mi" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="How to get it">
            <div style={{ display: "grid", gap: 10 }}>
              {ways.length ? (
                ways.map((w) => (
                  <div key={`${w.kind}-${w.title}`} className={w.best ? "way best" : "way"}>
                    <Doodle id={WAY_ICON[w.kind]} />
                    <div>
                      <span className="wl">{WAY_LABEL[w.kind]}</span>
                      <b>{w.title}</b>
                      <small>{w.detail}</small>
                    </div>
                    {w.phone ? (
                      <a className="call" href={telOf(w.phone)}>
                        {w.phone}
                      </a>
                    ) : w.url ? (
                      <a className="call" href={w.url} target="_blank" rel="noopener noreferrer">
                        Open
                      </a>
                    ) : w.best ? (
                      <span className="tag2">Quickest</span>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="way best">
                  <Doodle id={p.access === "walk_in" ? "local" : p.apply_url ? "n-immigration" : "n-phone"} />
                  <div>
                    <span className="wl">{p.first_step ? "First step" : "Get in touch"}</span>
                    <b>{p.first_step?.title ?? `Contact ${p.provider}`}</b>
                    <small>{p.first_step?.detail ?? p.contact ?? "Use the provider's page to get in touch."}</small>
                  </div>
                  {action ? (
                    <a className="call" href={action.href} target={action.href.startsWith("tel:") ? undefined : "_blank"} rel="noopener noreferrer">
                      {action.href.startsWith("tel:") ? action.label.replace("Call ", "") : "Open"}
                    </a>
                  ) : null}
                </div>
              )}
              {p.hours?.length ? (
                <div className="way">
                  <Doodle id="cal" />
                  <div>
                    <span className="wl">Hours they post</span>
                    {p.hours.map((h) => (
                      <small key={`${h.label}-${h.time}`}>
                        <b style={{ display: "inline", fontSize: "inherit" }}>{h.label}</b> · {h.time}
                      </small>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="Bring">
            {docs.length ? (
              <>
                <div className="bring">
                  {docs.map((d) =>
                    plan.docs.includes(d.kind) ? (
                      <span key={d.kind} className="doc have">
                        <Tick className="mi" />
                        {docLabel(d.kind, d.texts)}
                      </span>
                    ) : (
                      <button key={d.kind} className="doc" type="button" onClick={() => openSheet({ type: "upload", kind: d.kind })}>
                        + {docLabel(d.kind, d.texts)}
                      </button>
                    ),
                  )}
                </div>
                {missing.length ? <p className="sp-n" style={{ marginTop: 8 }}>Tap a missing paper to add it. It counts in every step that needs it.</p> : null}
                <Fold title="Their exact list">
                  <ul>
                    {(p.documents_needed ?? []).map((t) => (
                      <li key={t} className="n">
                        <Tick className="mi" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </Fold>
              </>
            ) : (
              <p style={{ color: "var(--ink-2)", fontSize: ".96rem" }}>
                {g?.no_documents_note ??
                  (p.documents_needed === null ? "They don't list papers online. Ask what to bring when you contact them." : "They don't ask for papers.")}
              </p>
            )}
          </Section>

          {g?.safety_note ? (
            <div className="banner info" style={{ marginBottom: 0 }}>
              <Doodle id="warn" />
              <span>{g.safety_note}</span>
            </div>
          ) : null}

          {phone ? (
            <Fold title="What to say on the phone">
              <div className="how" style={{ display: "grid" }}>
                <div className="script">
                  Hi, my name is <i>{name || "your name"}</i>. I live in <i>{zip || "your ZIP code"}</i>, and I would like to ask about{" "}
                  {g?.short_name ?? p.name}.
                </div>
                <p className="safe">A way to start the call. Say it in your own words if you like.</p>
              </div>
            </Fold>
          ) : null}

          {g?.ask_them.length ? (
            <Section title="Ask them">
              <ul>
                {g.ask_them.map((q) => (
                  <li key={q} className="q">
                    <Tick className="mi" />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Fold title="If they say no">
            <ul>
              <li className="n">
                <Tick className="mi" />
                <span>Ask them why, and whether you can appeal or apply again if something changes.</span>
              </li>
            </ul>
            {denied.length ? (
              <>
                <p className="sp-n" style={{ margin: "10px 0 8px" }}>
                  Other help for the same need:
                </p>
                <div className="unl">
                  {denied.map((x) => (
                    <button key={x.id} type="button" onClick={() => openSpot(x.id)}>
                      <span className={`kmini ${x.kind}`}>{x.kind === "gov" ? "Government" : "Local"}</span>
                      {x.title}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </Fold>

          {unlocks.length ? (
            <Fold title="One yes can open more">
              <p className="sp-n" style={{ marginBottom: 8 }}>
                These list {g?.short_name ?? "this program"} as a way to qualify.
              </p>
              <div className="unl">
                {unlocks.map((x) => (
                  <button key={x.id} type="button" onClick={() => openSpot(x.id)}>
                    <span className={`kmini ${x.kind}`}>{x.kind === "gov" ? "Government" : "Local"}</span>
                    {x.title}
                  </button>
                ))}
              </div>
            </Fold>
          ) : null}

          <div className="sc fold" style={{ paddingTop: 12 }}>
            <HowWeChecked snapshot={s} card={st.card} />
          </div>

          <p className="sp-n">
            Checked against{" "}
            <a href={p.info_url} target="_blank" rel="noopener noreferrer">
              the provider&apos;s page
            </a>{" "}
            on {formatDate(p.verified_on)}
            {p.program_period ? ` · ${p.program_period}` : ""}. Only the agency can approve you. We never press Send or sign for you.
          </p>
        </div>

        <div className="sp-f">
          {action && !st.done ? (
            <a className="go" href={action.href} target={action.href.startsWith("tel:") ? undefined : "_blank"} rel="noopener noreferrer">
              <span>{action.label}</span>
              <Arrow />
            </a>
          ) : (
            <button className="btn quiet" type="button" onClick={closeSpot}>
              Close
            </button>
          )}
          {st.fit !== "out" && st.fit !== "have" ? (
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
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      {open ? <div className="scrim on" onClick={closeSpot} aria-hidden="true" /> : null}
      <div
        className={`spot${open ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={open ? "spot-title" : undefined}
        aria-label={open ? undefined : "Program details"}
        aria-hidden={!open}
        inert={!open}
      >
        {content}
      </div>
    </>
  );
}
