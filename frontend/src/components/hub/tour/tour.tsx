"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { DEMO_BASE } from "@/components/documents/paper-store";
import { createSession, getSession, submitAnswer } from "@/lib/api";
import { addFillerPaper, confirmDetails, FILLER_SCOPES, getFillerState, setAutoRead } from "@/lib/filler";
import type { AnswerIn, SessionSnapshot } from "@/lib/types";

import { useHub } from "../hub-state";
import { usePapersHub } from "../papers-context";
import { createEngine, STOP, type Engine } from "./engine";

/** Fired by the nav's "Watch demo" button (hub-shell.tsx). */
export const TOUR_EVENT = "od:tour-start";

const CHAPTERS = [
  { k: "Her plan", t: "Maya told us her situation once. Now every program she might get is in one list, most urgent first." },
  { k: "Bank, not typing", t: "Instead of typing her income, she links a bank. Read-only, and simulated for this demo." },
  { k: "AI fills the form", t: "The AI fills her application from her papers, live, in its own browser. She watches every field." },
];

/** Maya's fictional papers the Filler reads in the background, so the form fills without asking. */
const DEMO_PAPERS = ["photo-id", "proof-of-address", "household-members", "pay-stub", "electric-bill"];

/** The demo person's answers (fictional), as onboarding would have left them: heat, groceries, a toddler. */
const START: AnswerIn[] = [
  { question_id: "needs", selected_option_ids: ["utilities", "food", "housing"] },
  { question_id: "zip", value: "01002" },
  { question_id: "household_size", value: 2 },
  { question_id: "household_who", selected_option_ids: ["child"] },
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
 * Lets the Filler read Maya's fictional papers on the demo session and confirms what it found,
 * so the form fills from them. Runs while the tour shows the plan and the bank. Best effort:
 * without the Filler the form simply asks for more.
 */
async function seedPapers(sessionId: string): Promise<void> {
  try {
    await setAutoRead(sessionId, true, FILLER_SCOPES.map((x) => x.id));
    await Promise.all(
      DEMO_PAPERS.map(async (name) => {
        const res = await fetch(`${DEMO_BASE}/${name}.pdf`);
        if (!res.ok) return;
        await addFillerPaper(sessionId, await res.blob(), `${name}.pdf`, null);
      }),
    );
    for (let i = 0; i < 40; i++) {
      const st = await getFillerState(sessionId);
      if (!st || !st.papers.some((p) => p.status === "queued" || p.status === "reading")) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await confirmDetails(sessionId);
  } catch {
    // No Filler here, or a paper failed: the form asks for what is missing.
  }
}

/**
 * "Watch demo": a 30-second walk through the real app on a throwaway session. A doodle cursor
 * taps the real buttons; the person's own session, plan, papers and answers are untouched, and
 * come back when the tour stops. It runs one form fill on a practice form, and never presses Send.
 */
export function Tour() {
  const app = useApp();
  const { plan } = usePlan();
  const hub = useHub();
  const papers = usePapersHub();
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();

  const [on, setOn] = useState(false);
  const [done, setDone] = useState(false);
  const [chapter, setChapter] = useState(-1);
  const [line, setLine] = useState("");
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
      const seeded = seedPapers(prepared.session_id);
      const say = (i: number, t = CHAPTERS[i].t) => {
        setChapter(i);
        setLine(t);
      };
      await E.sleep(600);
      E.setCur(window.innerWidth * 0.62, window.innerHeight * 0.72);
      cursor.current.classList.add("on");
      await E.sleep(600);

      // 1: her plan (~4 s)
      say(0);
      const nx = await E.waitFor(".next");
      await E.show(nx);
      E.annotate(".next", "most urgent first", { pad: 8 });
      await E.point(".next h3", { fx: 0.6 });
      await E.sleep(2600);
      E.clearAnn();

      // 2: bank, not typing (~8 s)
      say(1);
      latest.current.hub.openSheet({ type: "bank" });
      await E.waitFor(".drawer .bk-card:not(.sk)", 8000);
      // Maya works part time, so pick the matching simulated profile.
      const card = [...document.querySelectorAll<HTMLElement>(".drawer .bk-card:not(.sk)")].find((b) => /part-time/i.test(b.textContent ?? ""));
      if (card) await E.tap(card, { after: 250 });
      await E.tap(".drawer .agree", { after: 250 });
      await E.tap('.drawer [data-tour="connect"]', { after: 200 });
      say(1, "It reads 90 days of transactions, works out her monthly income, and tests it against each program's limit.");
      const skip = await E.waitFor(".drawer .af-skip", 10000);
      await E.sleep(1100);
      await E.tap(skip, { after: 200 });
      const flowDone = await E.waitFor('.drawer [data-tour="flow-done"]', 10000);
      await E.show(flowDone);
      E.annotate(".drawer .af-go", "", { pad: 6 });
      await E.sleep(900);
      E.clearAnn();
      await E.tap(flowDone, { after: 300 });
      const check = await E.waitFor('.drawer [data-tour="looks-right"]', 10000);
      say(1, "It finds her monthly income and her bills. Nothing is used until she says it looks right.");
      E.annotate(".drawer .found", "income and bills, found for her", { pad: 6, below: true });
      await E.sleep(1800);
      await E.tap(check, { after: 400 });
      await E.tap(".drawer .xbtn", { after: 300 });

      // 3: AI fills the form (~15 s)
      say(2, "First the AI reads her papers: ID, lease, pay stub, electric bill. She agreed to that.");
      await Promise.race([seeded, E.sleep(3000)]);
      const s3 = latest.current.app.snapshot;
      const formId = s3?.automatable_program_ids.find((x) => x === "capv-fuel-assistance") ?? s3?.automatable_program_ids[0];
      if (!formId) throw new Error("no form");
      latest.current.hub.openSheet({ type: "form", id: formId });
      const pre = await E.waitFor(".drawer .fl-pre", 25000);
      say(2, "Before typing anything, it shows every value it will use and which paper it came from.");
      E.annotate(pre, "every value, and its source", { pad: 6 });
      await E.sleep(1500);
      E.clearAnn();
      await E.tap(".drawer .fl-pre .fl-actions .btn:not(.quiet)", { after: 300 });
      say(2);
      const viewer = await E.waitFor(".drawer .fl-left", 8000);
      E.annotate(viewer, "the AI typing, live", { pad: 6 });
      await E.point(viewer, { fx: 0.5, fy: 0.4 });
      // Let it fill; skip anything it would ask, so the demo keeps moving. It stops at the
      // signature (Your turn) or at the review: either way the last step is Maya's.
      const t0 = Date.now();
      let mine: HTMLElement | null = null;
      while (Date.now() - t0 < 20000) {
        mine = document.querySelector<HTMLElement>(".drawer .fl-banner");
        if (mine) break;
        const skip = document.querySelector<HTMLElement>(".drawer .fl-question .txt-btn");
        if (skip) await E.tap(skip, { after: 300 });
        else await E.sleep(300);
      }
      E.clearAnn();
      if (mine) {
        say(2, "Every field filled from her papers. Signing and pressing Send stay with Maya. The AI never sends.");
        E.annotate(".drawer .fl-left", "filled in seconds", { pad: 6 });
        await E.sleep(1400);
        E.annotate(mine, "she signs and sends, not the AI", { pad: 6, below: true });
        await E.point(mine, { fx: 0.4 });
        await E.sleep(2200);
        E.clearAnn();
      }
      await E.tap(".drawer .xbtn", { after: 400 });
      await E.moveTo(window.innerWidth - 60, window.innerHeight - 40, 700);
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
  }, [router, finish, toast]);

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
                  <span className="txt">Her programs in one list, income from her bank, and a form the AI filled. Maya presses Send.</span>
                </>
              ) : c ? (
                <>
                  <span className="mono">
                    {chapter + 1} of {CHAPTERS.length} · {c.k}
                  </span>
                  <span className="txt" key={line}>
                    {line}
                  </span>
                </>
              ) : (
                <>
                  <span className="mono">OpenDoor · a 30-second walk-through</span>
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
