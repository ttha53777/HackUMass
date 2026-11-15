"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ConnectBankModal } from "@/components/bank/connect-modal";
import { useApp } from "@/components/session/session-provider";
import { interpretMessage } from "@/lib/api";
import { coreDone, phoneOf } from "@/lib/derive";
import {
  clearDevice,
  readConfirmed,
  readName,
  saveConfirmed,
  saveName,
} from "@/lib/device-state";
import type { AnswerIn, NotedFacts, SessionSnapshot } from "@/lib/types";

import { NEED } from "../needs";
import { Rise } from "../rise";
import {
  CORE,
  CRISIS,
  KIND,
  LANGS,
  RELATED,
  SAMPLE,
  SKIPPABLE,
  cap,
  parseNeeds,
  type Lang,
  type Qid,
} from "./content";
import { DICTS, clearLang, list, needLabel, readLang, saveLang } from "./i18n";
import { Building } from "./building";
import { Ledger } from "./ledger";
import {
  answerText,
  answeredItem,
  chosen,
  isDone,
  needsOf,
  nextAfter,
  numberOf,
  optionsFor,
  order,
  places,
  sampleIncome,
  sizeOf,
  skipAnswer,
  zipOf,
} from "./model";
import {
  CraigsNote,
  QuestionView,
  type Commit,
  type OwnReading,
  type QuestionProps,
} from "./question";

type Initial = QuestionProps["initial"];
import { TopBar } from "./top-bar";

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) =>
  new Promise<void>((r) =>
    setTimeout(r, reducedMotion() ? Math.min(ms, 40) : ms),
  );
const NO_NOTES: NotedFacts = {
  household_size: null,
  household_who: [],
  zip: null,
};

/** What sits under the question: a typing indicator, or the navigator's line and anything that goes with it. */
type Nav =
  | { typing: true }
  | {
      typing?: false;
      id: number;
      text: string;
      extra?:
        | { kind: "rel"; ids: string[]; first: string }
        | { kind: "craigs"; tel: string };
    };

/**
 * The conversation at /start, 1:1 with the design mock's v-chat: one question at a
 * time on a stage, a short acknowledgement between them, the places found filling
 * in beside it. Answers go to the session as they are given (the backend decides
 * what is found and how it fits); only the name stays on this device.
 */
export function Conversation({
  autoSample = false,
  need,
  say,
}: {
  autoSample?: boolean;
  need?: string;
  say?: string;
}) {
  const app = useApp();
  const router = useRouter();
  const s = app.snapshot;

  const latest = useRef(app);
  useEffect(() => {
    latest.current = app;
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [cur, setCur] = useState<Qid>("name");
  const [qKey, setQKey] = useState(0);
  const [initial, setInitial] = useState<Initial>({});
  const [showQ, setShowQ] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [nav, setNav] = useState<Nav | null>(null);
  const [relAdded, setRelAdded] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [nameDone, setNameDone] = useState(false);
  const [auto, setAuto] = useState(false);
  const [lang, setLangState] = useState<Lang>("en");
  const t = DICTS[lang];
  const UI = t.ui;
  // Read in async sequences after the language may have changed.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const setLang = (l: Lang) => {
    setLangState(l);
    saveLang(l);
  };
  const [dense, setDense] = useState(false);
  const [fading, setFading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  // Bumped by anything that replaces the current flow (a change, start over, the example).
  const flow = useRef(0);
  const committing = useRef(false);
  const navId = useRef(0);
  const typed = useRef("");
  const noted = useRef<NotedFacts>(NO_NOTES);
  const seedNeeds = useRef<string[]>([]);
  const relShown = useRef(false);

  const root = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const renderQ = useCallback((id: Qid) => {
    committing.current = false;
    // Starting values: the saved answer, else what the person already mentioned.
    const snap = latest.current.snapshot;
    const answered = answeredItem(snap, id);
    setInitial({
      needs: answered ? needsOf(snap) : seedNeeds.current,
      typed: typed.current,
      zip: zipOf(snap) || noted.current.zip || "",
      size: sizeOf(snap) ?? noted.current.household_size ?? 1,
      picked: answered
        ? chosen(snap, id).filter((x) => x !== "unsure")
        : id === "household_who"
          ? noted.current.household_who
          : [],
    });
    setCur(id);
    setQKey((k) => k + 1);
    setShowQ(true);
    setLeaving(false);
  }, []);

  // Answers that depend on each other go one at a time, each after the run the last one started.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const send = useCallback((body: AnswerIn): Promise<boolean> => {
    const run = queue.current.then(async () => {
      await latest.current.whenIdle();
      const ok = await latest.current.submit(body);
      await latest.current.whenIdle();
      await wait(0);
      return ok;
    });
    queue.current = run.catch(() => undefined);
    return run.catch(() => false);
  }, []);

  const reset = () => {
    flow.current++;
    committing.current = false;
    typed.current = "";
    noted.current = NO_NOTES;
    seedNeeds.current = [];
    relShown.current = false;
    setNav(null);
    setRelAdded([]);
    setName("");
    setNameDone(false);
  };

  // ───────── Start: pick up a session part-way through, or begin ─────────
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !s || app.working) return;
    started.current = true;
    setLangState(readLang());
    if (coreDone(s) && readConfirmed(s.session_id)) {
      router.replace("/home");
      return;
    }
    if (s.answered.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time resume of a session part-way through
      setName(readName());
      setNameDone(true);
      renderQ(nextAfter(s, null, true));
      return;
    }
    if (need && NEED[need]) seedNeeds.current = [need];
    if (say) typed.current = say.slice(0, 300);
    if (autoSample) setAuto(true);
    else setName(readName());
    if (app.expired)
      setNav({ id: ++navId.current, text: DICTS[readLang()].ui.expired });
    renderQ("name");
  }, [s, app.working, app.expired, router, need, say, autoSample, renderQ]);

  // ───────── Reading the person's own words ─────────
  const readOwn = useCallback(async (text: string): Promise<OwnReading> => {
    try {
      await latest.current.whenIdle();
      const id = latest.current.snapshot?.session_id;
      if (!id) throw new Error("no session");
      const r = await interpretMessage(id, {
        question_id: "needs",
        text: text.slice(0, 500),
      });
      noted.current = {
        household_size: r.noted.household_size ?? noted.current.household_size,
        household_who: r.noted.household_who.length
          ? r.noted.household_who
          : noted.current.household_who,
        zip: r.noted.zip ?? noted.current.zip,
      };
      const needs = (r.answer?.selected_option_ids ?? []).filter(
        (n) => NEED[n],
      );
      // The server writes its reply in English; other languages get the template lines instead.
      return {
        needs,
        reply: tRef.current === DICTS.en ? r.reply : null,
        urgent: r.safety === "urgent",
        contacts: r.safety_contacts,
        offTopic: r.off_topic,
      };
    } catch {
      // Offline or rate-limited: fall back to the mock's keyword reading.
      return {
        needs: parseNeeds(text),
        reply: null,
        urgent: CRISIS.test(text),
        contacts: [],
        offTopic: false,
      };
    }
  }, []);

  // ───────── The acknowledgement after an answer ─────────
  const ackFor = (
    c: Exclude<Commit, { qid: "review" }>,
    snap: SessionSnapshot | null,
    nm: string,
  ): string => {
    const T = tRef.current;
    const ACK = T.ack;
    if (c.qid === "name") return c.skipped ? ACK.name0 : ACK.name(nm);
    const ids = c.answer.selected_option_ids ?? [];
    switch (c.qid) {
      case "needs": {
        const labels = needsOf(snap).map((n) => needLabel(T, n).toLowerCase());
        const l = cap(list(T, labels));
        return labels.length >= 3 ? ACK.needsMany(l) : ACK.needsFew(l);
      }
      case "zip":
        return ACK.zipIn(snap?.region?.city ?? "", places(snap).length);
      case "household_size":
        return c.answer.value === 1
          ? ACK.size1
          : ACK.sizeN(Number(c.answer.value));
      case "household_who":
        return ids.includes("60")
          ? ACK.who60
          : ids.includes("child")
            ? ACK.whoChild
            : ACK.whoNone;
      case "utility_urgency":
        return ids.includes("shutoff")
          ? ACK.shutYes
          : ids.includes("behind")
            ? ACK.shutBehind
            : ACK.shutNo;
      case "housing_status":
        return ids.includes("no_stable_housing") ? ACK.houseNone : ACK.houseOk;
      case "income_band":
        return c.skipped ? ACK.incSkip : ACK.incOk;
      default:
        return ACK.other;
    }
  };

  // ───────── Building ─────────
  const build = async () => {
    const snap = latest.current.snapshot;
    // The plan needs the core answers; send the person back to the first one missing.
    const missing = CORE.find(
      (id) => !answeredItem(snap, id) || answeredItem(snap, id)?.skipped,
    );
    if (!snap || missing) {
      renderQ(missing ?? "needs");
      return;
    }
    flow.current++;
    saveConfirmed(snap.session_id);
    setAuto(false);
    setFading(true);
    await wait(500);
    if (!alive.current) return;
    setBuilding(true);
    window.scrollTo(0, 0);
  };

  // ───────── One answer: leave, send, acknowledge, next ─────────
  const commit = async (c: Commit) => {
    if (committing.current) return;
    committing.current = true;
    if (c.qid === "review") return void build();
    const mine = flow.current;
    const gone = () => !alive.current || flow.current !== mine;
    const st = stageRef.current;
    if (st) st.style.minHeight = `${st.offsetHeight}px`;
    setLeaving(true);
    await wait(360);
    if (gone()) return;
    setShowQ(false);
    setNav({ typing: true });
    const t0 = performance.now();

    let nm = name;
    let nd = nameDone;
    let ok = true;
    if (c.qid === "name") {
      nm = c.skipped ? "" : c.name;
      nd = true;
      setName(nm);
      saveName(nm);
      setNameDone(true);
    } else {
      if (c.qid === "needs") typed.current = c.answer.text ?? "";
      ok = await send(c.answer);
    }
    if (gone()) return;
    const snap = latest.current.snapshot;

    let text: string;
    let extra: Extract<Nav, { id: number }>["extra"];
    let next: Qid;
    if (!ok) {
      // The server words its errors in English.
      text =
        (tRef.current === DICTS.en && latest.current.answerError) ||
        tRef.current.ui.failed;
      next = c.qid;
    } else if (c.qid === "zip" && snap?.coverage !== "supported") {
      text = `${tRef.current.ack.zipOut} ${tRef.current.ui.zipOut}`;
      next = "zip";
    } else {
      text = ackFor(c, snap, nm);
      next = nextAfter(snap, c.qid, nd);
      if (c.qid === "needs" && !relShown.current) {
        relShown.current = true;
        const mine = needsOf(snap);
        const rel = [...new Set(mine.flatMap((n) => RELATED[n] ?? []))]
          .filter((n) => !mine.includes(n))
          .slice(0, 2);
        if (rel.length && mine.length)
          extra = {
            kind: "rel",
            ids: rel,
            first: needLabel(tRef.current, mine[0]).toLowerCase(),
          };
      }
      if (
        c.qid === "housing_status" &&
        c.answer.selected_option_ids?.includes("no_stable_housing")
      ) {
        const craigs = snap?.programs.find(
          (p) => p.program.id === "craigs-doors-shelter",
        );
        const tel = phoneOf(craigs?.program.contact) ?? craigs?.program.contact;
        if (tel) extra = { kind: "craigs", tel };
      }
    }
    setCur(next);
    await wait(
      Math.max(
        0,
        Math.min(850, 320 + text.length * 5) - (performance.now() - t0),
      ),
    );
    if (gone()) return;
    setRelAdded([]);
    setNav({ id: ++navId.current, text, extra });
    renderQ(next);
  };

  // "People asking about food often ask about these too": adds a need to the answer already sent.
  const addRel = (id: string) => {
    const mine = needsOf(latest.current.snapshot);
    setRelAdded((a) => [...a, id]);
    if (mine.includes(id)) return;
    const text = typed.current;
    void send(
      text
        ? {
            question_id: "needs",
            selected_option_ids: [...mine, id, "other"],
            text,
          }
        : { question_id: "needs", selected_option_ids: [...mine, id] },
    );
  };

  const edit = (id: Qid) => {
    flow.current++;
    setAuto(false);
    setNav(null);
    renderQ(id);
  };
  const back = () => {
    const ord = order(latest.current.snapshot);
    const i = ord.indexOf(cur);
    if (i > 0) edit(ord[i - 1]);
  };
  const restart = async () => {
    reset();
    setAuto(false);
    setShowQ(false);
    clearDevice();
    await latest.current.restart();
    if (alive.current) renderQ("name");
  };
  const demo = async () => {
    reset();
    if (latest.current.snapshot?.answered.length) {
      setShowQ(false);
      await latest.current.restart();
      if (!alive.current) return;
    }
    setAuto(true);
    renderQ("name");
  };
  const leave = () => {
    flow.current++;
    setAuto(false);
    clearDevice();
    clearLang();
    void latest.current.restart();
    router.replace("/");
  };

  // ───────── After each question appears: snap in, fit the screen, keep it in view ─────────
  const fit = useCallback(() => {
    const v = root.current;
    if (!v) return;
    v.classList.remove("dense");
    let d = false;
    if (window.innerWidth > 980 && window.innerHeight >= 560)
      d = document.documentElement.scrollHeight > window.innerHeight + 2;
    v.classList.toggle("dense", d);
    setDense(d);
  }, []);
  useLayoutEffect(() => {
    const st = stageRef.current;
    if (!st || !showQ) return;
    st.style.transition = "none";
    void st.offsetHeight;
    st.style.transition = "";
    const raf = requestAnimationFrame(() => {
      st.style.minHeight = "";
      fit();
    });
    const top = st.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.55 || top < 0) {
      window.scrollTo({
        top: Math.max(0, top + window.scrollY - window.innerHeight * 0.22),
        behavior: reducedMotion() ? "auto" : "smooth",
      });
    }
    return () => cancelAnimationFrame(raf);
  }, [qKey, showQ, fit]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  // ───────── The places panel glides the question column aside (FLIP) ─────────
  const rail = Boolean(
    s && answeredItem(s, "zip") && s.coverage === "supported",
  );
  const lastLeft = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const prev = lastLeft.current;
    const left = el.offsetLeft;
    if (prev === null || reducedMotion() || window.innerWidth <= 980) return;
    const dx = prev - left;
    if (Math.abs(dx) < 1) return;
    el.style.transition = "none";
    el.style.transform = `translateX(${dx}px)`;
    void el.offsetWidth;
    el.style.transition = "transform 1.1s cubic-bezier(.16,1,.3,1)";
    el.style.transform = "";
    el.addEventListener("transitionend", () => (el.style.transition = ""), {
      once: true,
    });
  }, [rail]);
  useLayoutEffect(() => {
    if (mainRef.current) lastLeft.current = mainRef.current.offsetLeft;
  });

  // ───────── Keyboard: letters pick a row, Enter continues ─────────
  useEffect(() => {
    if (auto || building) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select")) return;
      const st = stageRef.current;
      if (!st) return;
      const kind = KIND[cur];
      if ((kind === "single" || kind === "multi") && /^[a-h]$/i.test(e.key)) {
        const b =
          st.querySelectorAll<HTMLButtonElement>(".opts [data-opt]")[
            e.key.toLowerCase().charCodeAt(0) - 97
          ];
        if (b) {
          e.preventDefault();
          b.classList.add("pressing");
          window.setTimeout(() => b.classList.remove("pressing"), 150);
          b.click();
        }
        return;
      }
      if (e.key === "Enter" && !t?.closest?.("button, a, summary")) {
        const c = st.querySelector<HTMLButtonElement>("[data-continue]");
        if (c && !c.disabled) {
          e.preventDefault();
          c.click();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [auto, building, cur]);

  if (building) return <Building name={name} />;

  // ───────── Derived view ─────────
  const ord = order(s);
  const steps: Qid[] = ord.filter((id) => id !== "review");
  const done = (id: Qid) => isDone(s, id, nameDone);
  const rev = cur === "review";
  const at = steps.indexOf(cur);
  const progress = rev ? 1 : steps.filter(done).length / steps.length;
  const along = rev
    ? 1
    : steps.length > 1
      ? Math.max(0, at) / (steps.length - 1)
      : 0;
  const solo = cur === "name";
  const size = sizeOf(s);

  const options = optionsFor(s, cur, t);
  const samplePick =
    cur === "income_band"
      ? sampleIncome(options)
      : cur === "utility_urgency"
        ? SAMPLE.utility_urgency
        : cur === "housing_status"
          ? SAMPLE.housing_status
          : undefined;

  let navBody: ReactNode = null;
  if (nav?.typing) {
    navBody = (
      <span className="typing" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );
  } else if (nav) {
    navBody = (
      <>
        <p className="nl-text" key={nav.id}>
          <Rise text={nav.text} base={0} step={28} />
        </p>
        {nav.extra?.kind === "rel" ? (
          <div className="rel">
            <p>{UI.rel(nav.extra.first)}</p>
            {nav.extra.ids.map((id) => {
              const added = relAdded.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={added ? "chip added" : "chip"}
                  disabled={added}
                  data-rel={id}
                  onClick={() => addRel(id)}
                >
                  {added ? "✓" : "+"} {needLabel(t, id)}
                </button>
              );
            })}
          </div>
        ) : null}
        {nav.extra?.kind === "craigs" ? (
          <CraigsNote t={t} tel={nav.extra.tel} />
        ) : null}
      </>
    );
  }

  if (app.loadError) {
    navBody = (
      <>
        <p className="nl-text" role="alert">
          {app.loadError}
        </p>
        <div>
          <button
            type="button"
            className="btn"
            onClick={() => void app.restart()}
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  return (
    <div
      id="v-chat"
      className={["view", solo ? "solo" : "", dense ? "dense" : ""]
        .filter(Boolean)
        .join(" ")}
      ref={root}
      lang={LANGS.find((l) => l.id === lang)?.tag ?? "en"}
      style={fading ? { opacity: 0, transition: "opacity .5s" } : undefined}
    >
      <TopBar
        stops={steps.map((id) => ({
          id,
          short: DICTS.en.q[id].short,
          answer: answerText(s, id, name, t),
          done: done(id) && !(id === cur && !rev),
          cur: id === cur && !rev,
        }))}
        progress={progress}
        at={along}
        onEdit={edit}
        onRestart={() => void restart()}
        onLeave={leave}
        t={t}
      />
      <div
        className={["wrap c-grid", solo ? "solo" : "", rail ? "rail" : ""]
          .filter(Boolean)
          .join(" ")}
        id="cgrid"
      >
        <main className="c-main" id="cmain" ref={mainRef}>
          <div className="auto-bar" id="autobar" hidden={!auto}>
            <span>
              <i className="dot" />
              {UI.autoBar(SAMPLE.name)}
            </span>
            <button
              type="button"
              className="txt-btn"
              id="takeover"
              onClick={() => setAuto(false)}
            >
              {UI.takeover}
            </button>
          </div>
          <ol
            className="transcript"
            id="transcript"
            aria-label="Your answers so far"
          />
          <div className="navline" id="navline" aria-live="polite">
            {navBody}
          </div>
          <div
            className={[
              "qstage",
              KIND[cur] === "text" ? "center" : "",
              leaving ? "leaving" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            id="qstage"
            ref={stageRef}
          >
            {showQ ? (
              <QuestionView
                key={qKey}
                qid={cur}
                num={numberOf(s, cur)}
                first={ord[0] === cur}
                name={name}
                size={size}
                auto={auto}
                lang={lang}
                t={t}
                onLang={setLang}
                initial={{ ...initial, name: auto ? "" : name }}
                options={options}
                samplePick={samplePick}
                review={steps.map((id) => ({
                  id,
                  short: t.q[id].short,
                  value: answerText(s, id, name, t),
                }))}
                skipAnswer={SKIPPABLE.has(cur) ? skipAnswer(s, cur) : undefined}
                suggestion={auto ? undefined : s?.bank_suggestions.find((b) => b.question_id === cur)}
                onBank={
                  cur === "income_band" && !auto && !s?.financial_summary
                    ? () => setBankOpen(true)
                    : undefined
                }
                onCommit={(c) => void commit(c)}
                onBack={back}
                onEdit={edit}
                onDemo={() => void demo()}
                readOwn={readOwn}
                onTyped={(t) => {
                  typed.current = t;
                  requestAnimationFrame(fit);
                }}
              />
            ) : null}
          </div>
        </main>
        <Ledger on={rail} town={s?.region?.city ?? ""} rows={places(s)} t={t} />
      </div>
      <ConnectBankModal
        open={bankOpen}
        onClose={() => setBankOpen(false)}
        onConnected={() => {
          // Once the bank is read, carry on. Its income and bills wait on Home as a
          // "simulated" review card, so the income question is usually no longer open;
          // a single bank suggestion for a question still open is offered there.
          flow.current++;
          void latest.current.whenIdle().then(() => {
            if (alive.current) renderQ(nextAfter(latest.current.snapshot, null, true));
          });
        }}
      />
    </div>
  );
}
