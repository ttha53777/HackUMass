"use client";

import Link from "next/link";

import { FIN_FRAME } from "./art";
import { START_LABEL, useEntry } from "./use-entry";

/** The closing call to action; its door draws itself in when it scrolls into view (#fin.in). */
export function FinalCta() {
  const entry = useEntry();
  return (
    <section className="wrap fin" id="fin" aria-labelledby="fin-h">
      <div>
        <h2 id="fin-h">
          Your door is open <em>too.</em>
        </h2>
        <p>Whatever&apos;s keeping you up, start there. About three minutes. You can skip anything, go back, or change an answer at any point.</p>
        <div className="hero-cta">
          <button className="btn" onClick={(e) => entry.start(e.currentTarget)}>
            {START_LABEL.fin[entry.state]}
            <svg aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </button>
          <button className="txt-btn" onClick={(e) => entry.sample(e.currentTarget)}>
            Watch an example first
          </button>
        </div>
      </div>
      <svg className="dd frame" viewBox="0 0 240 300" aria-hidden="true" dangerouslySetInnerHTML={{ __html: FIN_FRAME }} />
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="wrap foot">
      <p className="crisis">
        <span>
          In danger right now? Call <b>911</b>.
        </span>
        <span>
          For crisis support any time, call or text <b>988</b>.
        </span>
      </p>
      <p>
        <Link className="txt-btn" href="/behind">
          How OpenDoor works behind the scenes
        </Link>
      </p>
      <p>OpenDoor · a HackUMass project</p>
    </footer>
  );
}
