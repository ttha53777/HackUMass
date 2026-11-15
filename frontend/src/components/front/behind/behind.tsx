"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { vars } from "../css-vars";
import { LandingNav } from "../landing/nav";
import { START_LABEL, useEntry } from "../landing/use-entry";
import { Rise } from "../rise";
import { FORM_DEMO, FORM_POINT_ART, LOOP_MAP, RULE_ART, TEAM_ART } from "./art";
import { MOMENTS, ROWS, type MomentKey } from "./checklist";
import { useBehindMotion } from "./use-behind-motion";

const SEQ = [
  ["You answer", "One question at a time. Tap, type, or skip it."],
  ["The coordinator looks", "It checks what changed and picks the one helper who should go next."],
  ["The Listener files it", "Your answer becomes a fact. Anything from a bank or a document waits until you confirm it."],
  ["The Finder looks nearby", "It pulls programs that serve your ZIP code from the list our team checked by hand."],
  ["The Checker sorts them", "Each program's rules against your answers: likely, possibly, or need more info."],
  ["The Planner orders steps", "Most urgent first, with phone numbers and links copied from the source."],
  ["You get one next question", "Only the question that would make your results clearer."],
];

/** A paper and a magnifier, for the Document Reader (drawn for the app; the mock has no such card). */
const DOC_READER_ART = `<path class="f-paper" d="M22 12 L70 12 L84 26 L84 90 L22 90Z"/><path d="M70 12 L70 26 L84 26"/><path d="M34 36 L66 36 M34 50 L62 50 M34 64 L52 64"/><circle class="f-sun" cx="76" cy="66" r="15"/><path d="M87 77 L102 92" stroke-width="4"/>`;

type Card = { code: string; title: string; body: string; never: string; art: string; hub?: boolean; optional?: boolean; rd: number };

const TEAM: Card[] = [
  {
    hub: true,
    code: "Administrator",
    title: "The Coordinator",
    body: "Sits in the middle. After every answer it decides which helper goes next, then waits for that helper to hand its work back.",
    never: "uses AI to decide. It follows the same checklist every time.",
    art: TEAM_ART[0],
    rd: 0,
  },
  {
    code: "User Intelligence",
    title: "The Listener",
    body: "Turns what you tell us into tidy facts. If your bank or a document disagrees with you, your answer stands and we ask you which is right.",
    never: "overwrites something you told us.",
    art: TEAM_ART[1],
    rd: 0,
  },
  {
    code: "Program Discovery",
    title: "The Finder",
    body: "Looks through the list our team checked by hand and picks the programs that serve your ZIP code and match what you need.",
    never: "makes up a program, a link or a phone number.",
    art: TEAM_ART[2],
    rd: 80,
  },
  {
    code: "Eligibility",
    title: "The Checker",
    body: "Compares each program's published rules with your answers and labels it likely, possibly, or needs more info.",
    never: "says yes for a program. Only the program can.",
    art: TEAM_ART[3],
    rd: 160,
  },
  {
    code: "Action Planning",
    title: "The Planner",
    body: "Puts your next steps in order: anything urgent first, then what fits best, with what to bring and what to say.",
    never: "invents a deadline.",
    art: TEAM_ART[4],
    rd: 0,
  },
  {
    optional: true,
    code: "Document Agent",
    title: "The Document Reader",
    body: "If you add a paper, like a bill or a letter, it reads only the details that kind of paper is allowed to give, and hands them to the Listener.",
    never: "uses a detail from a paper before you confirm it.",
    art: DOC_READER_ART,
    rd: 80,
  },
  {
    optional: true,
    code: "Browser agent",
    title: "The Form Helper",
    body: "If you ask, it fills in an application in a real browser while you watch, then tells the coordinator whether it was sent.",
    never: "presses Send, signs for you, or reads your actual details.",
    art: TEAM_ART[5],
    rd: 160,
  },
];

const FORM_POINTS = [
  {
    b: "It sees the page, not your details.",
    p: (
      <>
        It types a placeholder like <code>{"{{phone}}"}</code>. Our server swaps in your real number, so the AI never reads it.
      </>
    ),
  },
  { b: "It stops at anything that counts.", p: <>Signatures, Social Security numbers and the final Send button are always yours to do.</> },
  { b: "It reports back to the coordinator.", p: <>When you&apos;re done, your plan updates: sent, or worth a call to check.</> },
];

const RULES = [
  { b: "Facts come from the checked list.", p: "Programs, links and phone numbers only come from the list our team checked by hand." },
  {
    b: "AI can reword, never decide.",
    p: "Code decides every result. AI may only make the wording plainer, and any wording that adds a number, link or date gets thrown out.",
  },
  { b: "A maybe stays a maybe.", p: "If we don't know something, the label says so. Only the program itself can tell you yes." },
  { b: "You press Send.", p: "The form helper stops at every Submit, Sign or Agree button and hands the page to you." },
];

function PauseButton({ onChange }: { onChange: (paused: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <button
      id="agPause"
      aria-pressed={on}
      onClick={() => {
        onChange(!on);
        setOn(!on);
      }}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path
          d={on ? "M3 1.5 L10.5 6 L3 10.5Z" : "M3 1.5 V10.5 M9 1.5 V10.5"}
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          fill={on ? "currentColor" : "none"}
        />
      </svg>
      <span>{on ? "Play" : "Pause"}</span>
    </button>
  );
}

/** Behind the scenes: how the coordinator and its helpers work, 1:1 with the design mock. */
export function Behind() {
  const root = useRef<HTMLDivElement>(null);
  const [moment, setMoment] = useState<MomentKey>("zip");
  const entry = useEntry();
  const motion = useBehindMotion(root);

  return (
    <div className="view" id="v-agents" ref={root}>
      <LandingNav id="agshell" behind />

      <section className="wrap ag-hero" aria-labelledby="agH">
        <div className="ag-hero-copy">
          <div>
            <p className="mono">Behind the door · How OpenDoor works</p>
            <h1 id="agH" aria-label="Four agents, one coordinator.">
              <Rise text="Four agents, one |coordinator.|" base={120} step={70} />
            </h1>
          </div>
          <p className="lede">
            Every time you answer, a coordinator agent decides which agent should go next. Each agent does one job, hands its work
            back, and then you get your next question.
          </p>
        </div>

        <div className="ag-live">
          <div className="ag-map">
            <svg
              className="ag-svg"
              viewBox="0 0 760 500"
              role="img"
              aria-label="A coordinator sits in the middle with the Listener, Finder, Checker and Planner around it, and you below. A note travels from you to the coordinator, out to each helper and back, and then a question comes back to you."
              dangerouslySetInnerHTML={{ __html: LOOP_MAP }}
            />
          </div>
          <div className="ag-side">
            <ol className="ag-seq" id="agSeq">
              {SEQ.map(([b, s], i) => (
                <li key={b} className={i === 0 ? "on" : undefined}>
                  <span className="n">{i + 1}</span>
                  <span>
                    <b>{b}</b>
                    <small>{s}</small>
                  </span>
                </li>
              ))}
            </ol>
            <div className="ag-ctl">
              <span>Slowed down so you can watch. In the app, a turn takes under a second.</span>
              <PauseButton onChange={motion.setPaused} />
            </div>
          </div>
        </div>
      </section>

      <section className="ag-sec" aria-labelledby="agTeamH">
        <div className="wrap">
          <div className="sec-head">
            <h2 id="agTeamH" className="rv">
              Meet the <em>team.</em>
            </h2>
            <p className="rv" style={vars({ "--rd": "120ms" })}>
              Each helper has one job and one rule it never breaks. None of them talk to each other directly. Everything goes
              through the coordinator.
            </p>
          </div>
          <div className="ag-team">
            {TEAM.map((c) => (
              <article key={c.title} className={c.hub ? "ag-card hub rv" : "ag-card rv"} style={c.rd ? vars({ "--rd": `${c.rd}ms` }) : undefined}>
                {c.optional ? <p className="ex-tag mono">Optional</p> : null}
                <svg className="dd" viewBox="0 0 120 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: c.art }} />
                <p className="code">In the code: {c.code}</p>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <p className="never">
                  <b>Never</b>
                  <span>{c.never}</span>
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ag-sec" aria-labelledby="agCheckH">
        <div className="wrap ag-check">
          <div>
            <h2 id="agCheckH" className="ag-h2 rv">
              The coordinator&apos;s <em>checklist.</em>
            </h2>
            <p className="ag-intro rv" style={vars({ "--rd": "100ms" })}>
              It never guesses. After each answer it reads this list from the top and stops at the first line that&apos;s true. That
              helper does its job, hands its work back, and the coordinator starts again from the top. It stops when it needs you.
            </p>
            <div className="ag-scen rv" style={vars({ "--rd": "180ms" })}>
              <p>Pick a moment to watch</p>
              <div className="ag-scen-btns" role="group" aria-label="Moments">
                {MOMENTS.map((m) => (
                  <button
                    key={m.key}
                    aria-pressed={moment === m.key}
                    onClick={() => {
                      setMoment(m.key);
                      motion.play(m.key);
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <ol className="ag-log" id="agLog" aria-live="polite" aria-label="What happened, in order" />
            </div>
          </div>
          <div className="ag-list rv" style={vars({ "--rd": "120ms" })}>
            <svg className="ag-pen" id="agPen" aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
            <header>
              <b>Every turn, top to bottom</b>
              <span className="mono">Coordinator</span>
            </header>
            <ol id="agRows">
              {ROWS.map((r) => (
                <li key={r.q} className="ag-row">
                  <span className="bx">
                    <svg viewBox="0 0 16 16">
                      <path pathLength={1} d="M3 8.5 L6.5 12 L13 4" />
                    </svg>
                  </span>
                  <span className="q">{r.q}</span>
                  <span className={`go ${r.kind}`}>
                    <i />
                    {r.go}
                  </span>
                </li>
              ))}
            </ol>
            <p className="foot">Each helper can run at most twice per turn, so a turn always finishes.</p>
          </div>
        </div>
      </section>

      <section className="ag-sec" aria-labelledby="agFormH">
        <div className="wrap ag-fh">
          <div>
            <h2 id="agFormH" className="ag-h2 rv">
              One more helper, <em>only if you ask.</em>
            </h2>
            <ul className="ag-pts">
              {FORM_POINTS.map((x, i) => (
                <li key={x.b} className="rv" style={vars({ "--rd": `${(i + 1) * 80}ms` })}>
                  <svg className="dd" viewBox="0 0 120 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: FORM_POINT_ART[i] }} />
                  <div>
                    <b>{x.b}</b>
                    <p>{x.p}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rv" style={vars({ "--rd": "120ms" })}>
            <div className="ag-demo" id="agDemo" aria-hidden="true" dangerouslySetInnerHTML={{ __html: FORM_DEMO }} />
            <button className="ag-replay txt-btn" id="agReplay" onClick={motion.replay}>
              Play it again
            </button>
          </div>
        </div>
      </section>

      <section className="ag-sec" aria-labelledby="agRulesH">
        <div className="wrap">
          <div className="sec-head">
            <h2 id="agRulesH" className="rv">
              Rules every helper <em>follows.</em>
            </h2>
            <p className="rv" style={vars({ "--rd": "120ms" })}>
              They&apos;re written into the code, so no helper can talk its way around them.
            </p>
          </div>
          <ul className="ag-rules">
            {RULES.map((x, i) => (
              <li key={x.b} className="rv" style={i ? vars({ "--rd": `${i * 80}ms` }) : undefined}>
                <svg className="dd" viewBox="0 0 120 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: RULE_ART[i] }} />
                <b>{x.b}</b>
                <p>{x.p}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="wrap ag-fin" aria-labelledby="agFinH">
        <h2 id="agFinH" className="rv">
          That&apos;s the whole <em>team.</em>
        </h2>
        <p className="rv" style={vars({ "--rd": "100ms" })}>
          Four helpers, one coordinator, and you deciding what happens next.
        </p>
        <div className="hero-cta rv" style={vars({ "--rd": "180ms" })}>
          <button className="btn" onClick={(e) => entry.start(e.currentTarget)}>
            {START_LABEL.fin[entry.state]}
            <svg aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </button>
          <Link className="txt-btn" href="/">
            Back to the front page
          </Link>
        </div>
      </section>
    </div>
  );
}
