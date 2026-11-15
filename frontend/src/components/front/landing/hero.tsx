"use client";

import { Rise } from "../rise";
import { SCENE } from "./art";
import { START_LABEL, useEntry } from "./use-entry";

export function Hero() {
  const entry = useEntry();
  return (
    <section className="wrap hero" id="hero" aria-labelledby="hero-h">
      <div className="hero-copy">
        <p className="mono">Free help finder · Hampshire County, Massachusetts</p>
        <h1 id="hero-h" aria-label="Help is closer than it feels.">
          <Rise text="Help is |closer| than it feels." base={120} step={70} />
        </h1>
        <p className="lede">
          For the nights a notice is on the counter and you don&apos;t know who to call. A few plain questions, then the
          help near you and exactly what to do first.
        </p>
        <div className="hero-cta">
          <button className="btn" onClick={(e) => entry.start(e.currentTarget)}>
            {START_LABEL.hero[entry.state]}
            <svg aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </button>
          <button className="txt-btn" onClick={(e) => entry.sample(e.currentTarget)}>
            Watch an example first
          </button>
        </div>
        <div className="assure mono">
          {["No account", "No Social Security number", "Skip anything"].map((t) => (
            <span key={t}>
              <svg aria-hidden="true">
                <use href="#i-check" />
              </svg>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* The doorway drawing; the door swings open as you scroll (--open, set by useLandingMotion). */}
      <div className="scene" id="scene" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SCENE }} />
    </section>
  );
}
