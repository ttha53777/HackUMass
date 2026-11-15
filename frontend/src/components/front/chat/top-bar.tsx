"use client";

import { vars } from "../css-vars";
import { Mark } from "../mark";
import type { Qid } from "./content";
import type { Dict } from "./i18n";

export type Stop = { id: Qid; short: string; answer: string; done: boolean; cur: boolean };

const RIM = "M12 3.2 C17 3 21 7 20.8 12.2 C20.6 17 17 20.9 11.8 20.8 C6.9 20.6 3.1 17 3.2 11.8 C3.3 7.2 6.8 3.3 12.6 3.6";
const TRAIL = "M0 8 C40 3 80 13 120 8 S200 3 240 8 S320 13 360 8 S440 3 480 8 S560 13 600 8";

/**
 * The conversation's top bar: the door mark opens with progress (--p), an inked
 * trail of stops (done ones can be tapped to change), Start over and Leave quickly.
 */
export function TopBar({
  stops,
  progress,
  at,
  onEdit,
  onRestart,
  onLeave,
  t,
}: {
  stops: Stop[];
  /** 0 to 1: how much is answered. */
  progress: number;
  /** 0 to 1: where the current stop sits along the trail. */
  at: number;
  onEdit: (id: Qid) => void;
  onRestart: () => void;
  onLeave: () => void;
  t: Dict;
}) {
  const UI = t.ui;
  return (
    <header className="c-top wrap" id="ctop" style={vars({ "--p": progress.toFixed(3) })}>
      <Mark label="OpenDoor, back to start" conversation />
      <nav className="trail" id="prog" aria-label="Your progress" style={vars({ "--n": stops.length, "--t": at.toFixed(3) })}>
        <svg className="trail-line" viewBox="0 0 600 16" preserveAspectRatio="none" aria-hidden="true">
          <path className="base" vectorEffect="non-scaling-stroke" d={TRAIL} />
          <path className="fillp" pathLength={1} vectorEffect="non-scaling-stroke" d={TRAIL} />
        </svg>
        <ol id="progSteps">
          {stops.map((s) => {
            const svg = (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path className="rim" d={RIM} />
                {s.done ? <path className="ck" d="M7.6 12.4 L10.6 15.3 L16.4 8.7" /> : null}
              </svg>
            );
            return (
              <li key={s.id} className={s.done ? "is-done" : s.cur ? "is-cur" : undefined} style={{ animation: "none" }}>
                {s.done ? (
                  <button type="button" className="stop done" data-edit={s.id} title={`${s.short}: ${s.answer}`} aria-label={`${UI.change}: ${s.short}`} onClick={() => onEdit(s.id)}>
                    {svg}
                  </button>
                ) : (
                  <span className={s.cur ? "stop cur" : "stop"} aria-current={s.cur ? "step" : undefined}>
                    {svg}
                  </span>
                )}
                <span className="lb">{s.short}</span>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="c-acts">
        <button type="button" className="txt-btn" data-restart title={UI.startOver} onClick={onRestart}>
          <svg aria-hidden="true">
            <use href="#i-restart" />
          </svg>
          <span>{UI.startOver}</span>
        </button>
        <a className="leave" href="https://www.weather.gov" target="_blank" rel="noopener noreferrer" data-leave title="Opens the weather and clears this page" onClick={onLeave}>
          <svg aria-hidden="true">
            <use href="#i-door" />
          </svg>
          {UI.leave}
        </a>
      </div>
      <svg className="c-rule" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength={1} vectorEffect="non-scaling-stroke" d="M0 4.5 C180 2.5 360 6 560 3.8 S880 5.2 1000 4" />
      </svg>
    </header>
  );
}
