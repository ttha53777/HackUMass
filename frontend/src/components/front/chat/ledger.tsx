"use client";

import { useEffect, useRef, useState } from "react";

import { vars } from "../css-vars";
import { mapSvg } from "./art";
import type { Dict } from "./i18n";
import type { Place } from "./model";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * "Found near you": the places the backend found for the ZIP code, with the fit it
 * reported, a county map with a pin on the town, and a count that ticks up. A
 * bottom sheet on phones. Places already listed keep their spot; new ones slide in.
 */
export function Ledger({ on, town, rows, t }: { on: boolean; town: string; rows: Place[]; t: Dict }) {
  const UI = t.ui;
  const [open, setOpen] = useState(false);
  const n = rows.length;

  // Which rows are new since the last render, so only they animate in (in turn).
  const key = rows.map((r) => r.id).join("|");
  const [hist, setHist] = useState({ key: "", prev: new Set<string>(), cur: new Set<string>() });
  if (hist.key !== key) setHist({ key, prev: hist.cur, cur: new Set(rows.map((r) => r.id)) });
  if (!on && open) setOpen(false);
  const entering = hist.prev.size === 0;
  const base = entering && !(typeof window !== "undefined" && reducedMotion()) ? 350 : 0;

  // The big number counts up from the last value.
  const num = useRef<HTMLElement>(null);
  const last = useRef(0);
  useEffect(() => {
    const el = num.current;
    if (!el) return;
    const from = on ? last.current : 0;
    const to = on ? n : 0;
    last.current = to;
    if (reducedMotion() || from === to) {
      el.textContent = String(to);
      return;
    }
    let raf = 0;
    const start = window.setTimeout(() => {
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, Math.max(0, (t - t0) / 800));
        el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, base);
    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
      el.textContent = String(to);
    };
  }, [on, n, base]);

  let k = 0;
  return (
    <aside className={`ledger${on ? " has" : ""}${open ? " open" : ""}`} id="ledger" aria-label="Places found so far">
      <button className="lg-toggle" id="lgToggle" type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <b>{UI.soFar(on ? n : 0)}</b>
        <svg viewBox="0 0 20 20" className="dd" style={{ filter: "none" }} aria-hidden="true">
          <path d="M4 12 L10 6 L16 12" />
        </svg>
      </button>
      <div className="lg-live">
        <div className="lg-head">
          <p className="mono">{UI.found}</p>
          <div className="lg-count">
            <b id="lgNum" ref={num}>
              0
            </b>
            <span id="lgSub">{n === 1 ? UI.place1 : UI.placeN}</span>
          </div>
        </div>
        <div className="lg-map" id="lgMap" dangerouslySetInnerHTML={{ __html: on ? mapSvg(town) : "" }} />
        <ul className="lg-list" id="lgList">
          {!on ? null : rows.length ? (
            rows.map((r) => {
              const isNew = entering || !hist.prev.has(r.id);
              return (
                <li key={r.id} style={vars({ "--b": `${base}ms`, "--i": isNew ? k++ : 0 })}>
                  <span className="nm">{r.name}</span>
                  <span className={`fit ${r.fit}`}>{t.fit[r.fit]}</span>
                  <span className="pv">{r.provider}</span>
                </li>
              );
            })
          ) : (
            <li className="lg-empty" style={{ display: "block", border: 0 }}>
              {UI.noneYet}
            </li>
          )}
        </ul>
        <p className="lg-note">{UI.note}</p>
      </div>
    </aside>
  );
}
