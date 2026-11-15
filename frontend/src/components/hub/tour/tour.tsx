"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { createSession, getSession, submitAnswer } from "@/lib/api";
import { hubSteps } from "@/lib/hub-derive";
import type { AnswerIn, SessionSnapshot } from "@/lib/types";

import { useHub } from "../hub-state";
import { usePapersHub } from "../papers-context";
import { createEngine, STOP, type Engine } from "./engine";

/** Fired by the nav's "Watch demo" button (hub-shell.tsx). */
export const TOUR_EVENT = "od:tour-start";

const CHAPTERS = [
  { k: "Say it in words", t: "Maya doesn't fill out a screener. She just says what is wrong." },
  { k: "It listens", t: "OpenDoor picks out what she needs, and the fact that makes one urgent." },
  { k: "One plan, in order", t: "Her plan is rebuilt and sorted by deadline. The urgent step comes first." },
  { k: "Know what to do", t: "Each program opens up: what it costs, what to say, and a plan B if they say no." },
  { k: "Papers, once", t: "One copy of her bill counts in every step that needs it." },
  { k: "No typing income", t: "A read-only, simulated bank link suggests her income and bills. She confirms them." },
  { k: "She presses Send", t: "The form helper can fill the application in a practice browser. Only Maya signs and sends it." },
  { k: "The door opens", t: "Fast-forward her week: each step done swings the door wider." },
];

const SAY = "I got a shutoff notice for my heat, I have a toddler, and we are almost out of groceries.";

/** The demo person's starting answers (fictional): enough for a plan, before she says more. */
const START: AnswerIn[] = [
  { question_id: "needs", selected_option_ids: ["housing"] },
  { question_id: "zip", value: "01002" },
  { question_id: "household_size", value: 2 },
  { question_id: "household_who", selected_option_ids: ["none"] },
];

const CIRCLE = (
  <svg className="dd" viewBox="0 0 52 52" aria-hidden="true">
    <path pathLength={1} d="M30 5 C14 3 4 14 5 27 C6 41 18 48 30 46 C42 44 49 33 47 22 C45 12 36 6 24 7" strokeWidth={2.2} />
  </svg>
);

async function idle(id: string, snap: SessionSnapshot): Promise<SessionSnapshot> {
  let s = snap;
  for (let i = 0; s.busy && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 400));
    s = await getSession(id);
  }
  return s;
}

/** A new session with the demo person's starting answers, ready for the plan page. */
async function prepareDemo(): Promise<SessionSnapshot> {
  let s = await createSession();
  for (const a of START) s = await idle(s.session_id, await submitAnswer(s.session_id, a));
  return s;
}

/**
 * "Watch demo": a 70-second walk through the real app on a throwaway session. A doodle cursor
 * taps the real buttons; the person's own session, plan, papers and answers are untouched, and
 * come back when the tour stops. It never starts a form run (that drives a paid browser and model)
 * and never presses Send.
 */
export function Tour() {
  const app = useApp();
  const { plan, toggleDone } = usePlan();
  const hub = useHub();
  const papers = usePapersHub();
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();

  const [on, setOn] = useState(false);
  const [done, setDone] = useState(false);
  const [chapter, setChapter] = useState(-1);
  const cursor = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const run = useRef(0);
  const engine = useRef<Engine | null>(null);

  // Latest app state, readable from inside the async story.
  const latest = useRef({ app, plan, hub, papers, path });
  useEffect(() => {
    latest.current = { app, plan, hub, papers, path };
  });

  const root = () => document.querySelector<HTMLElement>(".od-hub");

  const finish = useCallback(async (quiet = false) => {
    run.current++;
    engine.current?.reset();
    root()?.classList.remove("touring");
    setOn(false);
    setDone(false);
    setChapter(-1);
    const L = latest.current;
    L.hub.closeSheet();
    L.hub.closeSpot();
    L.hub.setChat(() => []);
    if (L.app.demo) {
      await L.papers.clearAll();
      await L.app.endDemo();
      if (!quiet) toast("Back to your own plan. Nothing from the demo was kept.");
    }
  }, [toast]);

  const start = useCallback(async () => {
    if (!cursor.current || !body.current || !trail.current) return;
    const id = ++run.current;
    const alive = () => run.current === id;
    const E = createEngine({ cursor: cursor.current, body: body.current, trail: trail.current, root: root() ?? document.body }, alive);
    engine.current = E;
    setOn(true);
    setDone(false);
    setChapter(-1);
    root()?.classList.add("touring");
    try {
      if (latest.current.path !== "/home") {
        router.push("/home");
        await E.waitFor(".hero", 10000);
      }
      latest.current.hub.closeSheet();
      latest.current.hub.closeSpot();
      latest.current.hub.setChat(() => []);
      window.scrollTo(0, 0);
      const prepared = await prepareDemo();
      if (!alive()) return;
      latest.current.app.beginDemo(prepared);
      await E.sleep(900);
      E.setCur(window.innerWidth * 0.62, window.innerHeight * 0.72);
      cursor.current.classList.add("on");
      await E.sleep(1400);

      // 1: say it
      setChapter(0);
      await E.tap('[data-tour="chat"]', { after: 700 });
      await E.typeIn(".drawer .cbox textarea", SAY);
      await E.sleep(350);
      await E.tap('[data-tour="send"]', { after: 300 });

      // 2: it listens
      setChapter(1);
      await E.waitFor('.drawer .heard [data-tour="add"]', 12000);
      await E.sleep(300);
      E.annotate(".drawer .heard .hn", "from one sentence", { pad: 6 });
      await E.sleep(1500);
      E.annotate(".drawer .heard .facts", "and the urgent part", { pad: 6, below: true });
      await E.sleep(1900);
      await E.tap('.drawer .heard [data-tour="add"]', { after: 900 });
      await E.tap('.drawer [data-tour="seeplan"]', { after: 900 });

      // 3: the plan
      setChapter(2);
      await E.glide(null, 0, 900);
      await E.sleep(300);
      E.annotate(".hero h1", "rebuilt for today", { pad: 12, below: true, left: true });
      await E.sleep(1600);
      E.clearAnn();
      const nx = await E.waitFor(".next");
      await E.show(nx);
      E.annotate(".next", "deadline first", { pad: 8 });
      await E.point(".next h3", { fx: 0.6 });
      await E.sleep(1700);

      // 4: the spotlight
      setChapter(3);
      await E.tap('.next [data-tour="more"]', { after: 900 });
      const gl = await E.waitFor(".spot.on .gl");
      await E.sleep(300);
      E.annotate(gl, "cost, timing, papers", { pad: 6, below: true });
      await E.point(gl, { fx: 0.45 });
      await E.sleep(1700);
      E.clearAnn();
      const folds = [...document.querySelectorAll<HTMLDetailsElement>(".spot.on details.fold")];
      const no = folds.find((d) => /say no/i.test(d.textContent ?? ""));
      if (no) {
        await E.tap(no.querySelector("summary") as HTMLElement, { after: 500 });
        E.annotate(no, "a plan B, too", { pad: 6 });
        await E.sleep(1600);
      }
      await E.tap(".spot.on .sp-x", { after: 700 });

      // 5: papers, once
      setChapter(4);
      const s5 = latest.current.app.snapshot;
      const steps5 = s5 ? hubSteps(s5, latest.current.plan) : [];
      const kind = ["heat", "income", "lease", "id"].find((k) => steps5.some((st) => st.kinds.includes(k))) ?? null;
      latest.current.hub.openSheet({ type: "upload", kind });
      await E.sleep(800);
      const sample = await E.waitFor(".drawer .samples .smp");
      await E.tap(sample, { after: 400 });
      const after = await Promise.race([E.waitFor('.drawer [data-tour="looks-right"]', 20000), E.waitFor(".drawer .reuse", 20000)]);
      if (after.matches('[data-tour="looks-right"]')) {
        E.annotate(".drawer .found", "read for her, on request", { pad: 6, below: true });
        await E.sleep(1700);
        await E.tap(after, { after: 800 });
      }
      const reuse = await E.waitFor(".drawer .reuse", 12000);
      E.annotate(reuse, "one paper, many steps", { pad: 6, below: true });
      await E.point(reuse, { fx: 0.6 });
      await E.sleep(1700);
      await E.tap(".drawer .xbtn", { after: 700 });

      // 6: no typing income
      setChapter(5);
      latest.current.hub.openSheet({ type: "bank" });
      await E.sleep(900);
      await E.waitFor(".drawer .opts .opt", 8000);
      await E.tap(".drawer .agree", { after: 350 });
      await E.tap('.drawer [data-tour="connect"]', { after: 300 });
      const check = await E.waitFor('.drawer [data-tour="looks-right"]', 20000);
      E.annotate(".drawer .found", "simulated, read-only", { pad: 6, below: true });
      await E.sleep(1700);
      await E.tap(check, { after: 900 });
      await E.tap(".drawer .xbtn", { after: 700 });

      // 7: she presses Send (shown, never started)
      setChapter(6);
      const s7 = latest.current.app.snapshot;
      const formId = s7?.automatable_program_ids.find((x) => x === "capv-fuel-assistance") ?? s7?.automatable_program_ids[0];
      if (formId) {
        latest.current.hub.openSheet({ type: "form", id: formId });
        await E.sleep(900);
        const gate = [...document.querySelectorAll<HTMLElement>(".drawer .txt-btn")].find((b) => /asks me instead/i.test(b.textContent ?? ""));
        if (gate) await E.tap(gate, { after: 700 });
        const ready = await E.waitFor(".drawer .found", 8000).catch(() => null);
        if (ready) {
          E.annotate(ready, "filled from her answers", { pad: 6, below: true });
          await E.sleep(1500);
        }
        const promise = document.querySelector(".drawer .promise");
        if (promise) {
          E.annotate(promise, "only Maya presses Send", { pad: 6, below: true });
          await E.point(promise as HTMLElement, { fx: 0.4 });
          await E.sleep(1900);
        }
        await E.tap(".drawer .xbtn", { after: 700 });
      } else {
        await E.sleep(2200);
      }

      // 8: the door opens
      setChapter(7);
      await E.glide(null, 0, 1100);
      await E.sleep(400);
      await E.point(".meter b", { fx: 0.9 });
      E.annotate(".meter", "", { pad: 8 });
      await E.sleep(900);
      const s8 = latest.current.app.snapshot;
      const left = s8 ? hubSteps(s8, latest.current.plan).filter((st) => !st.done) : [];
      for (let i = 0; i < left.length; i++) {
        if (!alive()) throw STOP;
        toggleDone(left[i].id); // the demo session's plan is never saved
        await E.press();
        await E.sleep(i === left.length - 1 ? 200 : 380);
      }
      E.clearAnn();
      await E.sleep(900);
      E.annotate(".scene", "the door is open", { pad: -30, below: true });
      await E.point(".scene", { fx: 0.62, fy: 0.5 });
      await E.sleep(2600);
      E.clearAnn();
      await E.moveTo(window.innerWidth - 60, window.innerHeight - 40, 900);
      cursor.current?.classList.remove("on");
      root()?.classList.remove("touring");
      setDone(true);
    } catch (e) {
      if (e !== STOP) {
        // Something on the page didn't appear in time: stop cleanly and give the person their plan back.
        await finish(true);
        toast("The demo stopped early. Your own plan is back, unchanged.");
      }
    }
  }, [router, toggleDone, finish, toast]);

  useEffect(() => {
    const onStart = () => void start();
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, [start]);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && void finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, finish]);

  // Leaving the hub mid-tour still returns the person's session.
  useEffect(
    () => () => {
      if (latest.current.app.demo) void latest.current.app.endDemo();
    },
    [],
  );

  const c = chapter >= 0 ? CHAPTERS[chapter] : null;
  return (
    <>
      <div className="shield" aria-hidden="true" />
      <svg className="cur-trail" aria-hidden="true">
        <path ref={trail} d="" />
      </svg>
      <div className="cursor" ref={cursor} aria-hidden="true">
        <div className="cur-body" ref={body}>
          <svg viewBox="0 0 40 46">
            <g style={{ filter: "url(#pen2)" }}>
              <path
                d="M6.6 6.2 C6.9 15 6.6 25 7.4 35.4 L14.6 28.9 L20.4 41.6 C21.2 43.2 22.9 43.6 24.4 42.8 L26.6 41.6 C27.9 40.8 28.2 39.4 27.5 38 L21.7 25.8 L31.6 25.3 Z"
                fill="var(--ink)"
                opacity=".22"
                transform="translate(1.6 1.8)"
              />
              <path
                d="M5 4 C5.3 13 5 23 5.8 33.2 L13 26.7 L18.8 39.4 C19.6 41 21.3 41.4 22.8 40.6 L25 39.4 C26.3 38.6 26.6 37.2 25.9 35.8 L20.1 23.6 L30 23.1 Z"
                fill="var(--door)"
                stroke="var(--ink)"
                strokeWidth={2.3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle cx="16.4" cy="22.6" r="1.5" fill="var(--brass)" />
            </g>
          </svg>
        </div>
        <svg className="cur-burst" viewBox="-30 -30 60 60">
          {["M0 -11 L0 -20", "M9 -7 L16 -13", "M11 3 L20 5", "M-9 -7 L-15 -13", "M-11 4 L-19 7", "M4 12 L7 20"].map((d) => (
            <path key={d} pathLength={1} d={d} />
          ))}
        </svg>
      </div>
      {on ? (
        <div className="dock">
          <div className="tourbar" role="status" aria-live="polite">
            <div className="tnum">
              {chapter >= 0 || done ? CIRCLE : null}
              {done ? "✓" : chapter >= 0 ? chapter + 1 : ""}
            </div>
            <div className="cap">
              {done ? (
                <>
                  <span className="mono">That is OpenDoor</span>
                  <span className="txt">One sentence in. A plan, papers counted once, and Maya presses Send.</span>
                </>
              ) : c ? (
                <>
                  <span className="mono">
                    {chapter + 1} of {CHAPTERS.length} · {c.k}
                  </span>
                  <span className="txt" key={chapter}>
                    {c.t}
                  </span>
                </>
              ) : (
                <>
                  <span className="mono">OpenDoor · a 70-second walk-through</span>
                  <span className="txt">Meet Maya. Her heat is about to be shut off. This runs on a separate demo plan.</span>
                </>
              )}
            </div>
            <div className="acts">
              {done ? (
                <>
                  <button className="btn quiet" type="button" onClick={() => void finish(true).then(() => window.dispatchEvent(new Event(TOUR_EVENT)))}>
                    Replay
                  </button>
                  <button className="btn" type="button" onClick={() => void finish()}>
                    Back to my plan
                  </button>
                </>
              ) : (
                <button className="btn quiet" type="button" onClick={() => void finish()}>
                  Stop
                </button>
              )}
            </div>
            <div className="tprog">
              <i style={{ width: `${done ? 100 : ((chapter + 1) / CHAPTERS.length) * 100}%` }} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
