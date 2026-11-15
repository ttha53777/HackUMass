"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { EligibilityStatus, ProgramCard, SessionSnapshot } from "@/lib/types";

import { Arrow, Tick } from "./icons";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * 2026 federal poverty guideline (48 states), yearly. Lifeline's sourced limit is 135% of it
 * ($21,546 for one person), which is where these come from.
 */
const fpl = (size: number) => 15960 + 5680 * (size - 1);

const PERIOD_FACTOR: Record<string, number> = { month: 1, year: 12, week: 12 / 52 };

type Verdict = "fits" | "over" | "under" | "ask";

type Match = {
  id: string;
  name: string;
  provider: string;
  /** Monthly figures, so every row reads the same way. */
  yours: number;
  limit: number | null;
  bound: "max" | "min";
  verdict: Verdict;
};

type Findings = {
  monthly: number;
  sources: { label: string; kind: string; amount: number }[];
  bills: { label: string; amount: number; late: boolean }[];
  period: string | null;
  household: number | null;
  matches: Match[];
  otherChecked: number;
  mayQualify: ProgramCard[];
  needAnswer: number;
};

const FIT: EligibilityStatus[] = ["likely_eligible", "possibly_eligible"];

function householdSize(s: SessionSnapshot): number | null {
  const item = s.profile_summary.find((p) => p.field === "household_size");
  const n = item ? parseInt(item.display_value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Everything the flow shows, read from the snapshot once the backend has finished. */
function findings(s: SessionSnapshot): Findings | null {
  const f = s.financial_summary;
  if (!f) return null;
  const sources = f.income_sources.map((i) => ({ label: i.label, kind: i.kind, amount: i.avg_monthly }));
  const monthly = sources.length ? sources.reduce((a, b) => a + b.amount, 0) : f.avg_monthly_deposits;
  const household = householdSize(s);

  const matches: Match[] = [];
  let otherChecked = 0;
  for (const card of s.programs) {
    const p = card.program;
    const reqs = p.requirements.filter(
      (r) => (r.kind === "income_max" || r.kind === "income_min") && (r.field == null || r.field === "monthly_income"),
    );
    if (!reqs.length) {
      otherChecked++;
      continue;
    }
    // The verdict is the Eligibility Agent's own, per requirement; nothing is re-decided here.
    const crit = (id: string) => card.assessment?.criteria.find((c) => c.requirement_id === id)?.result ?? "unknown";
    const failed = reqs.find((r) => crit(r.id) === "not_met");
    const unknown = reqs.some((r) => crit(r.id) === "unknown");
    const shown = failed ?? reqs.find((r) => r.kind === "income_max") ?? reqs[0];
    const factor = PERIOD_FACTOR[shown.period ?? "month"] ?? 1;
    let raw: number | null = null;
    if (typeof shown.value === "number") raw = shown.value;
    else if (shown.value && typeof shown.value === "object" && household != null) {
      const v = (shown.value as Record<string, unknown>)[String(household)];
      raw = typeof v === "number" ? v : null;
    }
    matches.push({
      id: p.id,
      name: p.name,
      provider: p.provider,
      yours: monthly,
      limit: raw != null ? raw / factor : null,
      bound: shown.kind === "income_min" ? "min" : "max",
      verdict: failed ? (failed.kind === "income_min" ? "under" : "over") : unknown ? "ask" : "fits",
    });
  }
  // Ones that fit first, so the good news reads first.
  const rank: Record<Verdict, number> = { fits: 0, ask: 1, under: 2, over: 3 };
  matches.sort((a, b) => rank[a.verdict] - rank[b.verdict]);

  const passed = new Set(matches.filter((m) => m.verdict === "fits").map((m) => m.id));
  const mayQualify = s.programs
    .filter((c) => c.assessment && FIT.includes(c.assessment.status))
    .sort((a, b) => Number(passed.has(b.program.id)) - Number(passed.has(a.program.id)));
  const needAnswer = s.programs.filter((c) => c.assessment?.status === "insufficient_information").length;

  return {
    monthly,
    sources,
    bills: f.bills.map((b) => ({ label: b.payee, amount: b.avg_monthly, late: b.status === "overdue" })),
    period: f.period_start && f.period_end ? `${shortDate(f.period_start)} – ${shortDate(f.period_end)}` : null,
    household,
    matches: matches.slice(0, 6),
    otherChecked,
    mayQualify,
    needAnswer,
  };
}

/** Counts up to `to` over `ms`. */
function useCountUp(to: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

/** Reveals 0..n items, one every `ms`, while `run` is on. */
function useStagger(n: number, run: boolean, ms: number) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!run || shown >= n) return;
    const t = window.setTimeout(() => setShown((x) => x + 1), shown === 0 ? 250 : ms);
    return () => window.clearTimeout(t);
  }, [run, shown, n, ms]);
  return shown;
}

/* ---------- panels under the step being worked on ---------- */

function Ledger({ f, active }: { f: Findings | null; active: boolean }) {
  const rows = f
    ? [
        ...f.sources.map((s) => ({ key: `in-${s.label}`, label: s.label, amount: s.amount, in: true, late: false, kind: s.kind })),
        ...f.bills.map((b) => ({ key: `out-${b.label}`, label: b.label, amount: b.amount, in: false, late: b.late, kind: "bill" })),
      ]
    : [];
  const shown = useStagger(rows.length, !!f && active, 260);
  return (
    <div className="af-panel af-ledger">
      <div className="af-ph">
        <span className="mono">Simulated account · read-only</span>
        <span className="mono">{f?.period ?? "Last 90 days"}</span>
      </div>
      {!f ? (
        <div className="af-wait">
          {[72, 54, 64, 46].map((w, i) => (
            <div className="af-row sk" key={i} style={{ animationDelay: `${i * 120}ms` }}>
              <i style={{ width: `${w}%` }} />
              <i />
            </div>
          ))}
          <p className="af-note live">
            <Dots />
            Pulling deposits and bills from the sandbox bank
          </p>
        </div>
      ) : (
        <ul>
          {rows.slice(0, active ? shown : rows.length).map((r) => (
            <li className="af-row" key={r.key}>
              <span className="lbl">
                {r.label}
                <small>
                  {r.in ? (r.kind === "benefit" ? "Benefit deposit" : r.kind === "wages" ? "Paycheck" : "Deposit") : r.late ? "Bill · behind" : "Recurring bill"}
                </small>
              </span>
              <b className={r.in ? "in" : r.late ? "late" : "out"}>
                {r.in ? "+" : "−"}
                {money(r.amount)}
                <small>/mo</small>
              </b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dots() {
  return (
    <span className="af-dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function IncomeTally({ f }: { f: Findings }) {
  const v = useCountUp(f.monthly);
  const yearly = f.monthly * 12;
  const pct = f.household ? Math.round((yearly / fpl(f.household)) * 100) : null;
  return (
    <div className="af-panel af-income">
      <span className="mono">Household income the bank shows</span>
      <div className="af-big">
        {money(v)}
        <small> a month</small>
      </div>
      {f.sources.length ? (
        <div className="af-split">
          {f.sources.map((s) => (
            <span key={s.label}>
              <i className={s.kind} />
              {s.label} · {money(s.amount)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="af-facts">
        <span>
          <b>{money(yearly)}</b>
          <small>a year</small>
        </span>
        <span>
          <b>{f.household ?? "?"}</b>
          <small>{f.household ? "in household" : "household size"}</small>
        </span>
        <span>
          <b>{pct != null ? `${pct}%` : "?"}</b>
          <small>of poverty line</small>
        </span>
      </div>
    </div>
  );
}

const VERDICT: Record<Verdict, string> = {
  fits: "Under the limit",
  over: "Over the limit",
  under: "Below its range",
  ask: "Needs one answer",
};

function MatchRow({ m, household, scale }: { m: Match; household: number | null; scale: number }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDrawn(true), 60);
    return () => window.clearTimeout(t);
  }, []);
  const you = (m.yours / scale) * 100;
  const lim = m.limit != null ? (m.limit / scale) * 100 : null;
  return (
    <li className={`af-match ${m.verdict}`}>
      <div className="af-mh">
        <span className="nm">
          {m.name}
          <small>{m.provider}</small>
        </span>
        <span className="vd">
          {m.verdict === "fits" ? <Tick /> : null}
          {VERDICT[m.verdict]}
        </span>
      </div>
      <div className="af-meter" aria-hidden="true">
        <i className="you" style={{ width: drawn ? `${you}%` : 0 }} />
        {lim != null ? <i className="lim" style={{ left: `${lim}%`, opacity: drawn ? 1 : 0 }} /> : null}
      </div>
      <p className="af-cmp">
        You {money(m.yours)}/mo
        {m.limit != null
          ? ` · ${m.bound === "max" ? "limit" : "range starts at"} ${money(m.limit)}/mo${household ? ` for ${household}` : ""}`
          : household
            ? " · no limit listed for this household size"
            : " · limit depends on household size"}
      </p>
    </li>
  );
}

function Matcher({ f, active }: { f: Findings; active: boolean }) {
  const shown = useStagger(f.matches.length, active, 750);
  // One scale for every row: your income sits still, each program's limit lands where it falls.
  const scale = Math.max(f.monthly, ...f.matches.map((m) => m.limit ?? 0)) * 1.08 || 1;
  const list = active ? f.matches.slice(0, shown) : f.matches;
  const checking = active && shown < f.matches.length ? f.matches[shown] : null;
  return (
    <div className="af-panel af-matcher">
      <div className="af-ph">
        <span className="mono">Income tests · 2026 guidelines</span>
        <span className="mono">
          {list.length}/{f.matches.length}
        </span>
      </div>
      {list.length ? (
        <ul>
          {list.map((m) => (
            <MatchRow key={m.id} m={m} household={f.household} scale={scale} />
          ))}
        </ul>
      ) : null}
      {checking ? (
        <p className="af-note live">
          <Dots />
          Checking {checking.name}
        </p>
      ) : !f.matches.length ? (
        <p className="af-note">None of your programs has an income test.</p>
      ) : f.otherChecked ? (
        <p className="af-note">
          + {f.otherChecked} more program{f.otherChecked === 1 ? "" : "s"} with no income test, re-checked on area, age and needs
        </p>
      ) : null}
    </div>
  );
}

function Result({ f }: { f: Findings }) {
  const n = useCountUp(f.mayQualify.length, 700);
  return (
    <div className="af-panel af-result">
      <div className="af-big">
        {Math.round(n)}
        <small> program{f.mayQualify.length === 1 ? "" : "s"} you may qualify for</small>
      </div>
      {f.mayQualify.length ? (
        <ul>
          {f.mayQualify.slice(0, 4).map((c, i) => (
            <li key={c.program.id} style={{ animationDelay: `${i * 90}ms` }}>
              <Tick />
              <span>{c.program.name}</span>
              <small>{c.assessment?.status === "likely_eligible" ? "Likely" : "Possibly"}</small>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="af-note">
        Nothing from the bank counts until you confirm it{f.needAnswer ? ` · ${f.needAnswer} more need one answer from you` : ""}.
      </p>
    </div>
  );
}

/* ---------- the flow ---------- */

type StageKey = "consent" | "route" | "read" | "income" | "match" | "plan";

type Stage = {
  key: StageKey;
  who: string;
  title: string;
  detail: (f: Findings | null) => string;
  /** How long it stays the active step once it can run. */
  ms: (f: Findings | null) => number;
  /** Stays active until the backend has really finished. */
  needsBackend: boolean;
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const STAGES: Stage[] = [
  {
    key: "consent",
    who: "You → OpenDoor",
    title: "Your consent goes to the server",
    detail: () => "Nothing is read without it",
    ms: () => 900,
    needsBackend: false,
  },
  {
    key: "route",
    who: "Administrator",
    title: "Routes the new bank evidence",
    detail: () => "To the Profile Agent, the only agent that edits your profile",
    ms: () => 1000,
    needsBackend: false,
  },
  {
    key: "read",
    who: "Profile Agent · Nessie",
    title: "Reads 90 days of transactions",
    detail: (f) =>
      f ? `${plural(f.sources.length, "income source")} · ${plural(f.bills.length, "recurring bill")}` : "Deposits, bills and spending. Keeps monthly totals only",
    ms: (f) => 1100 + (f ? (f.sources.length + f.bills.length) * 260 : 0),
    needsBackend: true,
  },
  {
    key: "income",
    who: "Profile Agent",
    title: "Works out your monthly income",
    detail: (f) => (f ? `${money(f.monthly)} a month · unconfirmed until you say so` : "From deposits only"),
    ms: () => 2400,
    needsBackend: true,
  },
  {
    key: "match",
    who: "Eligibility Agent",
    title: "Matches your income to programs",
    detail: (f) => (f ? `${plural(f.matches.length, "income test")} against published limits` : "Against each program's published limit"),
    ms: (f) => 1100 + (f ? f.matches.length * 750 : 0),
    needsBackend: true,
  },
  {
    key: "plan",
    who: "Administrator",
    title: "Updates your plan",
    detail: (f) => (f ? `${f.mayQualify.length} may fit · next, you check what it found` : "Then asks you to check what it found"),
    ms: () => 0,
    needsBackend: true,
  },
];

/**
 * The agents at work while the bank is linked: reading the simulated account, working out
 * income, then testing it against each program's income limit, one at a time. The first steps
 * run on a timer; the rest wait for the backend, so every number shown is the real result.
 * `onComplete` fires when the person moves on.
 */
export function AgentFlow({ finished, s, onComplete }: { finished: boolean; s: SessionSnapshot; onComplete: () => void }) {
  const [at, setAt] = useState(0);
  const found = useMemo(() => (finished ? findings(s) : null), [finished, s]);
  // Freeze the first finished reading so later polls don't reshuffle rows mid-animation.
  const [f, setF] = useState<Findings | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (found && !once.current) {
      once.current = true;
      setF(found);
    }
  }, [found]);
  const last = STAGES.length - 1;

  useEffect(() => {
    if (at >= last) return;
    const stage = STAGES[at];
    if (stage.needsBackend && !f) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setAt((x) => x + 1), reduce ? 400 : stage.ms(f));
    return () => window.clearTimeout(t);
  }, [at, f, last]);

  // Backend finished but returned no bank summary: don't hang on the reading step.
  useEffect(() => {
    if (finished && !s.financial_summary) {
      const t = window.setTimeout(onComplete, 600);
      return () => window.clearTimeout(t);
    }
  }, [finished, s.financial_summary, onComplete]);

  const allDone = at >= last && !!f;

  // Keep the newest line in view as panels grow, the way a log follows its tail.
  const list = useRef<HTMLOListElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => tail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const progress = allDone ? STAGES.length : at;

  return (
    <div className="aflow">
      <div className="aflow-h">
        <span className="mono">Agents at work</span>
        <span className="mono ct">
          {progress}/{STAGES.length}
        </span>
      </div>
      <div className="aflow-bar" aria-hidden="true">
        <i style={{ width: `${(progress / STAGES.length) * 100}%` }} />
      </div>
      <ol ref={list} aria-live="polite">
        {STAGES.map((stage, i) => {
          if (i > at) return null;
          const complete = i < at || allDone;
          const active = i === at && !allDone;
          return (
            <li key={stage.key} className={`af-step ${complete ? "ok" : "now"}`}>
              <span className="dot" aria-label={complete ? "Done" : "Working"}>
                {complete ? <Tick /> : null}
              </span>
              <div className="af-body">
                <div className="txt">
                  <span className="who">{stage.who}</span>
                  <b>{stage.title}</b>
                  <small>{stage.detail(f)}</small>
                </div>
                {stage.key === "read" && active ? <Ledger f={f} active /> : null}
                {stage.key === "income" && f && active ? <IncomeTally f={f} /> : null}
                {stage.key === "match" && f && (active || allDone) ? <Matcher f={f} active={active} /> : null}
                {stage.key === "plan" && f && allDone ? <Result f={f} /> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {allDone ? (
        <div className="drow af-go">
          <button className="btn" type="button" data-tour="flow-done" onClick={onComplete}>
            Check what it found <Arrow />
          </button>
        </div>
      ) : f && at >= 2 ? (
        <button className="txt-btn af-skip" type="button" onClick={() => setAt(last)}>
          Skip ahead
        </button>
      ) : null}
      <div ref={tail} className="af-tail" aria-hidden="true" />
    </div>
  );
}
