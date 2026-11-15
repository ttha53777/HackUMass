"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { AnswerIn, SafetyContact } from "@/lib/types";

import { vars } from "../css-vars";
import { Doodle } from "../doodles";
import { NEED, NEEDS } from "../needs";
import { Rise } from "../rise";
import { HELLO, person, pinSvg, zipMap } from "./art";
import { KIND, LANGS, SAMPLE, SKIPPABLE, type Lang, type Opt, type Qid } from "./content";
import { list, needLabel, type Dict } from "./i18n";
import { ZIPS } from "./zips";

const LETTERS = "ABCDEFGH";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 40) : ms));

/** What reading the person's own words found. */
export type OwnReading = { needs: string[]; reply: string | null; urgent: boolean; contacts: SafetyContact[]; offTopic: boolean };

export type Commit =
  | { qid: "name"; name: string; skipped: boolean }
  | { qid: "review" }
  | { qid: Exclude<Qid, "name" | "review">; answer: AnswerIn; skipped?: boolean };

export type ReviewRow = { id: Qid; short: string; value: string };

export type QuestionProps = {
  qid: Qid;
  /** "01", "02"… or ✓. */
  num: string;
  first: boolean;
  name: string;
  size: number | null;
  auto: boolean;
  lang: Lang;
  /** The words, in the chosen language. */
  t: Dict;
  onLang: (lang: Lang) => void;
  /** Starting values: the saved answer, or what the person already mentioned. */
  initial: { name?: string; needs?: string[]; typed?: string; zip?: string; size?: number; picked?: string[] };
  options: Opt[];
  /** The example's pick for this question. */
  samplePick?: string;
  review: ReviewRow[];
  skipAnswer?: AnswerIn;
  onCommit: (c: Commit) => void;
  onBack: () => void;
  onEdit: (id: Qid) => void;
  onDemo: () => void;
  /** Read the person's own words on the server (falls back to keywords). */
  readOwn: (text: string) => Promise<OwnReading>;
  onTyped: (text: string) => void;
};

/** {911}-style placeholders as copyable numbers. */
function nums(text: string, map: Record<string, string> = {}): ReactNode {
  return text.split(/\{(\w+)\}/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="num">
        {map[part] ?? part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function SafetyNote({ t, contacts = [] }: { t: Dict; contacts?: SafetyContact[] }) {
  const [title, danger, crisis, keep] = t.ui.safety;
  return (
    <div className="safety" role="alert">
      <b>{title}</b>
      <span>{nums(danger)}</span>
      <span>{nums(crisis)}</span>
      {contacts.map((c) => (
        <span key={c.name}>
          {c.name}: <span className="num">{c.contact}</span>
        </span>
      ))}
      <span>{keep}</span>
    </div>
  );
}

export function CraigsNote({ t, tel }: { t: Dict; tel: string }) {
  const [a, b] = t.ui.craigs;
  return (
    <div className="safety" role="alert">
      <b>{a}</b>
      <span>{nums(b, { tel })}</span>
    </div>
  );
}

const Tick = () => (
  <svg viewBox="0 0 16 16">
    <path pathLength={1} d="M3 8.5 L6.5 12 L13 4" />
  </svg>
);

/** Sets a controlled input's value as if typed, so React sees it. */
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * One question on the stage, 1:1 with the mock's renderQ: the eyebrow, the rising
 * title, the reason, the answer controls for its kind, and the actions row. It
 * remounts for every question shown, so its entrance animations replay.
 */
export function QuestionView(p: QuestionProps) {
  const t = p.t;
  const UI = t.ui;
  const q = p.qid === "name" ? null : t.q[p.qid];
  const kind = KIND[p.qid];
  const stage = useRef<HTMLDivElement>(null);
  const hello = t.hello;

  // ───────── Drafts ─────────
  const [nameDraft, setNameDraft] = useState(p.initial.name ?? "");
  const [needs, setNeeds] = useState<string[]>(p.initial.needs ?? []);
  const [own, setOwn] = useState(p.initial.typed ?? "");
  const [ownOut, setOwnOut] = useState<ReactNode[]>([]);
  const [reading, setReading] = useState(false);
  const [zip, setZip] = useState(p.initial.zip ?? "");
  const [zipFocus, setZipFocus] = useState(false);
  const [size, setSize] = useState(p.initial.size ?? 1);
  const [picked, setPicked] = useState<string[]>(p.initial.picked ?? []);
  const committed = useRef(false);

  const firstWord = (v: string) => (v.trim().split(/\s+/)[0] || "").slice(0, 24);
  const nm = firstWord(nameDraft);
  const zipOk = zip.length === 5 && Boolean(ZIPS[zip]);

  const commit = (c: Commit) => {
    if (committed.current) return;
    committed.current = true;
    p.onCommit(c);
  };
  const cont = () => {
    switch (kind) {
      case "text":
        return commit({ qid: "name", name: nm, skipped: !nm });
      case "needs":
        if (!needs.length) return;
        return commit({
          qid: "needs",
          answer: own.trim()
            ? { question_id: "needs", selected_option_ids: [...needs, "other"], text: own.trim().slice(0, 500) }
            : { question_id: "needs", selected_option_ids: needs },
        });
      case "zip":
        if (!zipOk) return;
        return commit({ qid: "zip", answer: { question_id: "zip", value: zip } });
      case "count":
        return commit({ qid: "household_size", answer: { question_id: "household_size", value: size } });
      case "multi":
        if (!picked.length) return;
        return commit({ qid: p.qid as "household_who", answer: { question_id: p.qid, selected_option_ids: picked } });
      case "review":
        return commit({ qid: "review" });
    }
  };
  const skip = () => {
    if (p.skipAnswer) commit({ qid: p.qid as "income_band", answer: p.skipAnswer, skipped: true });
  };
  const disabled =
    (kind === "needs" && !needs.length) || (kind === "zip" && !zipOk) || (kind === "multi" && !picked.length);

  // ───────── Own words ─────────
  const addOwn = async (text = own) => {
    const words = text.trim();
    if (!words || reading) return;
    p.onTyped(words);
    setReading(true);
    const r = await p.readOwn(words);
    setReading(false);
    const out: ReactNode[] = [];
    if (r.urgent) out.push(<SafetyNote key="safety" t={t} contacts={r.contacts} />);
    if (r.offTopic) out.push(<p key="off" className="matched">{UI.offTopic}</p>);
    else {
      if (r.reply) out.push(<p key="reply" className="matched">{r.reply}</p>);
      const found = r.needs.filter((id) => NEED[id]);
      if (found.length) {
        setNeeds((cur) => [...new Set([...cur, ...found])]);
        out.push(<p key="marked" className="matched">{UI.marked(list(t, found.map((n) => needLabel(t, n))))}</p>);
      } else if (!r.urgent && !r.reply) out.push(<p key="kept" className="matched">{UI.kept}</p>);
    }
    setOwnOut(out);
  };
  // Words carried in from the landing page ("That's me") are read straight away.
  const seeded = useRef(false);
  useEffect(() => {
    if (kind !== "needs" || seeded.current || !p.initial.typed || p.initial.needs?.length) return;
    seeded.current = true;
    void addOwn(p.initial.typed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // ───────── Single choice: pick, then move on ─────────
  const pick = (id: string) => {
    if (kind === "multi") {
      const only = p.options.find((o) => o.id === id)?.only;
      setPicked((cur) => {
        if (cur.includes(id)) return cur.filter((x) => x !== id);
        const onlies = p.options.filter((o) => o.only).map((o) => o.id);
        return only ? [id] : [...cur.filter((x) => !onlies.includes(x)), id];
      });
      return;
    }
    setPicked([id]);
    window.setTimeout(
      () => commit({ qid: p.qid as "housing_status", answer: { question_id: p.qid, selected_option_ids: [id] } }),
      reducedMotion() ? 0 : 520,
    );
  };

  // ───────── The ZIP map ─────────
  const mapMarkup = useMemo(() => zipMap(), []);
  const zmap = useRef<HTMLDivElement>(null);
  const pinned = useRef("");
  const shown = useRef(false);
  useEffect(() => {
    const svg = zmap.current?.querySelector("svg");
    const pin = zmap.current?.querySelector<SVGGElement>("#zpin");
    if (kind !== "zip" || !svg || !pin) return;
    const t = zip.length === 5 ? (ZIPS[zip] ?? "") : "";
    const cands = zip.length >= 3 && !t ? new Set(Object.entries(ZIPS).filter(([z]) => z.startsWith(zip)).map(([, n]) => n)) : null;
    svg.querySelectorAll<SVGGElement>(".tw").forEach((g) => {
      const lit = t ? g.dataset.t === t : Boolean(cands?.has(g.dataset.t ?? ""));
      g.classList.toggle("lit", lit);
      g.classList.toggle("dim", (Boolean(t) || Boolean(cands?.size)) && !lit);
    });
    svg.classList.toggle("out", zip.length === 5 && !t);
    if (t !== pinned.current) {
      pinned.current = t;
      pin.style.setProperty("--pd", shown.current ? "0s" : ".9s");
      pin.innerHTML = t ? pinSvg(t) : "";
      svg.classList.toggle("pinned", Boolean(t));
    }
    shown.current = zip.length > 0;
  }, [kind, zip]);

  // ───────── The language picker's sliding marker ─────────
  const track = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (kind !== "text") return;
    const place = (still: boolean) => {
      const ind = track.current?.querySelector<HTMLElement>(".lg-ind");
      const b = track.current?.querySelector<HTMLElement>(`[data-lang="${p.lang}"]`);
      if (!ind || !b) return;
      ind.classList.toggle("still", still);
      ind.style.setProperty("--x", `${b.offsetLeft}px`);
      ind.style.setProperty("--w", `${b.offsetWidth}px`);
      if (still) requestAnimationFrame(() => ind.classList.remove("still"));
    };
    place(!placed.current);
    placed.current = true;
    const onResize = () => place(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [kind, p.lang]);
  // The bubble says "hi!" in the chosen language, with a little pop.
  const helloRef = useRef<HTMLDivElement>(null);
  const firstLang = useRef(true);
  useEffect(() => {
    const hi = helloRef.current?.querySelector("#helloHi");
    const g = helloRef.current?.querySelector("#helloHiG");
    if (!hi) return;
    hi.textContent = hello.hi;
    hi.setAttribute("font-size", hello.hi.length > 5 ? "19" : "23");
    if (firstLang.current) {
      firstLang.current = false;
      return;
    }
    g?.classList.remove("pop");
    void g?.getBoundingClientRect();
    g?.classList.add("pop");
  }, [hello.hi]);

  // ───────── Focus, unless the example is playing ─────────
  useEffect(() => {
    if (p.auto) return;
    const t = window.setTimeout(() => {
      const root = stage.current;
      if (!root) return;
      const target =
        kind === "text" ? root.querySelector<HTMLElement>("#f-name") : kind === "zip" ? root.querySelector<HTMLElement>("#f-zip") : root.querySelector<HTMLElement>("#qt");
      target?.focus({ preventScroll: true });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount
  }, []);

  // ───────── The example, played for you ─────────
  useEffect(() => {
    if (!p.auto) return;
    let live = true;
    const root = stage.current!;
    const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s);
    const press = async (el: HTMLElement | null) => {
      if (!el || !live) return;
      el.classList.add("pressing");
      await wait(160);
      el.classList.remove("pressing");
      if (live) el.click();
      await wait(420);
    };
    const typeOut = async (input: HTMLInputElement | null, text: string, ms: number) => {
      if (!input) return;
      for (const ch of text) {
        if (!live) return;
        typeInto(input, input.value + ch);
        await wait(ms);
      }
    };
    void (async () => {
      await wait(1300);
      if (!live) return;
      if (kind === "text") {
        await typeOut($("#f-name"), SAMPLE.name, 110);
        await wait(700);
      }
      if (kind === "needs") for (const id of SAMPLE.needs) await press($(`[data-opt="${id}"]`));
      if (kind === "zip") {
        $<HTMLInputElement>("#f-zip")?.focus({ preventScroll: true });
        await typeOut($("#f-zip"), SAMPLE.zip, 170);
        await wait(700);
      }
      if (kind === "count") {
        for (let i = 1; i < SAMPLE.size; i++) await press($("[data-inc]"));
        await wait(300);
      }
      if (kind === "multi") for (const id of SAMPLE.who) await press($(`[data-opt="${id}"]`));
      if (kind === "single") {
        if (p.samplePick) await press($(`[data-opt="${p.samplePick}"]`));
        else await press($("[data-skip]"));
        return;
      }
      if (kind === "review") await wait(1400);
      if (!live) return;
      const c = $<HTMLButtonElement>("[data-continue]");
      if (c && !c.disabled) await press(c);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per question shown, stops when the example does
  }, [p.auto]);

  // ───────── Head ─────────
  const title = kind === "text" ? hello.title : q!.prompt({ name: p.name, size: p.size });
  const head = (
    <>
      <p className="q-eye mono">
        <span className="qn">{kind === "text" ? "01" : p.num}</span>
        <span className="bar" />
        {kind === "text" ? hello.eye : q!.eye}
      </p>
      <h2 className="q-title" id="qt" tabIndex={-1}>
        <Rise key={title} text={title} base={kind === "text" ? 40 : 80} step={48} />
      </h2>
      <p className="q-why">
        <svg aria-hidden="true">
          <use href="#i-why" />
        </svg>
        <span>{kind === "text" ? hello.why : q!.why}</span>
      </p>
    </>
  );

  // ───────── Body ─────────
  let body: ReactNode = null;
  if (kind === "text") {
    const meet = nm ? hello.meet(nm) : "";
    body = (
      <>
        <div className={`namebox${nm ? " has" : ""}`} id="namebox">
          <span className="uline">
            <input
              className="field big"
              id="f-name"
              autoComplete="given-name"
              placeholder={hello.ph}
              maxLength={30}
              value={nameDraft}
              aria-labelledby="qt"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") cont();
              }}
            />
          </span>
          <svg className="pen" viewBox="0 0 520 16" preserveAspectRatio="none" aria-hidden="true">
            <path className="rest" vectorEffect="non-scaling-stroke" d="M8 9 C130 5 330 12 512 7" />
            <path className="on" pathLength={1} d="M8 9 C130 5 330 12 512 7" />
          </svg>
          <p className="nick" aria-hidden="true">
            <svg className="dd" viewBox="0 0 46 34">
              <path d="M44 6 C30 3 14 10 5 26 M5 26 L3 15 M5 26 L15 23" />
            </svg>
            {hello.nick}
          </p>
        </div>
        <p className="hi-prev" id="hiPrev" aria-live="polite" key={meet ? "on" : "off"}>
          {meet}
        </p>
      </>
    );
  } else if (kind === "needs") {
    // The mock's six main cards, plus any other need already chosen (from the landing page or the person's words).
    const cards = NEEDS.filter((n) => n.primary || needs.includes(n.id));
    body = (
      <>
        <div className="opts stag" role="group" aria-labelledby="qt">
          {cards.map((n, i) => (
            <button
              key={n.id}
              type="button"
              className="opt"
              style={vars({ "--i": i })}
              data-opt={n.id}
              aria-pressed={needs.includes(n.id)}
              onClick={() => setNeeds((cur) => (cur.includes(n.id) ? cur.filter((x) => x !== n.id) : [...cur, n.id]))}
            >
              <Doodle kind={n.id} className="sm" />
              <b>{t.needs[n.id]?.[0] ?? n.label}</b>
              <small>{t.needs[n.id]?.[1] ?? n.hint}</small>
              <span className="tick">
                <Tick />
              </span>
            </button>
          ))}
        </div>
        <div className="own-box">
          <label className="sr" htmlFor="f-own">
            {UI.ownPh}
          </label>
          <div className="own-field">
            <input
              id="f-own"
              maxLength={300}
              placeholder={UI.ownPh}
              value={own}
              onChange={(e) => setOwn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addOwn();
                }
              }}
            />
            <button type="button" className="btn" data-own disabled={reading} onClick={() => void addOwn()}>
              {reading ? "…" : UI.add}
            </button>
          </div>
          <div id="ownOut">
            {ownOut.length ? ownOut : p.initial.typed && p.initial.needs?.length ? <p className="matched">{UI.matchedFrom(list(t, needs.map((n) => needLabel(t, n))))}</p> : null}
          </div>
        </div>
      </>
    );
  } else if (kind === "zip") {
    const town = zip.length === 5 ? ZIPS[zip] : undefined;
    body = (
      <div className={`zip${zip.length ? " show" : ""}`} id="zipwrap">
        <div className="zip-in">
          <div className="zbox" id="zbox">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={[zip[i] ? "has" : "", zipFocus && i === Math.min(zip.length, 4) ? "cur" : ""].filter(Boolean).join(" ") || undefined}>
                {zip[i] ?? ""}
              </span>
            ))}
            <input
              id="f-zip"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={zip}
              aria-labelledby="qt"
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              onFocus={() => setZipFocus(true)}
              onBlur={() => setZipFocus(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") cont();
              }}
            />
          </div>
          <p className={zip.length === 5 && !town ? "ztown out" : "ztown"} id="ztown" aria-live="polite">
            {zip.length === 5 ? (town ? `${town}, MA` : UI.zipOut) : ""}
          </p>
        </div>
        <div className="zmap" id="zmap" aria-hidden="true" ref={zmap} dangerouslySetInnerHTML={{ __html: mapMarkup }} />
      </div>
    );
  } else if (kind === "count") {
    const set = (n: number) => setSize(Math.max(1, Math.min(10, n)));
    body = (
      <>
        <div className="count">
          <button type="button" className="stp" data-dec aria-label={UI.fewer} onClick={() => set(size - 1)}>
            <svg className="dd" viewBox="0 0 20 20" style={{ filter: "none" }}>
              <path d="M4 10 L16 10" />
            </svg>
          </button>
          <output id="cnt" aria-live="polite">
            {size === 10 ? "10+" : size}
          </output>
          <button type="button" className="stp" data-inc aria-label={UI.more} onClick={() => set(size + 1)}>
            <svg className="dd" viewBox="0 0 20 20" style={{ filter: "none" }}>
              <path d="M4 10 L16 10 M10 4 L10 16" />
            </svg>
          </button>
        </div>
        <div className="people" id="people" aria-hidden="true">
          {Array.from({ length: size }, (_, i) => (
            <span key={i} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: person(i) }} />
          ))}
        </div>
      </>
    );
  } else if (kind === "multi" || kind === "single") {
    body = (
      <div className="opts list stag" role={kind === "single" ? "radiogroup" : "group"} aria-labelledby="qt">
        {p.options.map((o, i) => {
          const on = picked.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              className="opt"
              role={kind === "single" ? "radio" : undefined}
              style={vars({ "--i": i })}
              data-opt={o.id}
              aria-pressed={on}
              aria-checked={kind === "single" ? on : undefined}
              onClick={() => pick(o.id)}
            >
              <span className="key">
                <i>{LETTERS[i]}</i>
                <Tick />
              </span>
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  } else if (kind === "review") {
    body = (
      <div className="review stag">
        {p.review.map((r, i) => (
          <button key={r.id} type="button" style={vars({ "--i": i })} data-edit={r.id} onClick={() => p.onEdit(r.id)}>
            <span className="rq">{r.short}</span>
            <span className="ra">{r.value || UI.notAnswered}</span>
            <span className="re">{UI.change}</span>
          </button>
        ))}
      </div>
    );
  }

  // ───────── Actions ─────────
  const showCont = kind !== "single";
  const acts = (
    <div className="q-acts">
      {p.first ? null : (
        <button type="button" className="back" data-back onClick={p.onBack}>
          <svg aria-hidden="true">
            <use href="#i-arrow" />
          </svg>
          {UI.back}
        </button>
      )}
      <span className="sp" />
      {!showCont && p.options.length ? (
        <span className="kbd" aria-hidden="true">
          {UI.press(LETTERS[p.options.length - 1])}
        </span>
      ) : null}
      {SKIPPABLE.has(p.qid) ? (
        <button type="button" className="txt-btn" data-skip onClick={skip}>
          {p.qid === "income_band" ? UI.rather : UI.skip}
        </button>
      ) : null}
      {showCont ? (
        <>
          <span className="kbd" aria-hidden="true">
            Enter ↵
          </span>
          <button type="button" className="btn" data-continue disabled={disabled} onClick={cont}>
            {kind === "review" ? UI.plan : kind === "text" ? hello.cont : UI.cont}
            <svg aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </button>
        </>
      ) : null}
      {kind === "text" && !p.auto ? (
        <button type="button" className="btn quiet" data-demo onClick={p.onDemo}>
          {hello.demo}
          <svg viewBox="0 0 16 16" aria-hidden="true" style={{ width: ".85em", height: ".85em" }}>
            <path fill="currentColor" d="M4 2.5 L13 8 L4 13.5Z" />
          </svg>
        </button>
      ) : null}
    </div>
  );

  const tag = LANGS.find((l) => l.id === p.lang)?.tag ?? "en";
  return (
    <div ref={stage} style={{ display: "contents" }} lang={kind === "text" ? tag : undefined}>
      {kind === "text" ? (
        <>
          <div className="langs" role="radiogroup" aria-label="Language">
            <svg className="dd lg-globe" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3.5 12 H20.5 M12 3 C8.4 7 8.4 17 12 21 M12 3 C15.6 7 15.6 17 12 21" />
            </svg>
            <div className="lg-track" ref={track}>
              <span className="lg-ind" aria-hidden="true" />
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  data-lang={l.id}
                  lang={l.tag}
                  aria-checked={l.id === p.lang}
                  onClick={(e) => {
                    if (l.id === p.lang) return;
                    e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
                    p.onLang(l.id);
                  }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <div ref={helloRef} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: HELLO }} />
        </>
      ) : null}
      {head}
      <div className="q-body">{body}</div>
      {acts}
    </div>
  );
}
