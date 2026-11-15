"use client";

import { vars } from "../css-vars";
import { NIGHTS, nightArt } from "./pv";
import { useEntry } from "./use-entry";

/**
 * A short pinned strip. Four paper cards slide past; on each, a drawn knot
 * untangles into one line that runs to a small door, and the door opens onto a
 * real first step. Motion comes from useLandingMotion.
 */
export function FourNights() {
  const entry = useEntry();
  return (
    <section className="pv" id="street" aria-labelledby="pv-h">
      <div className="pv-pin">
        <div className="wrap pv-head">
          <div>
            <p className="mono">Four people · four kinds of night</p>
            <h2 id="pv-h">
              Four different nights. <em>One place to start.</em>
            </h2>
          </div>
          <div className="pv-side">
            <span className="pv-count" aria-hidden="true">
              <span id="pvNum">01</span> <small>/ 04</small>
            </span>
            <p>Composite stories, drawn from situations like these.</p>
          </div>
        </div>
        <div className="pv-stage">
          <div className="pv-track" id="pvTrack">
            {NIGHTS.map((P, i) => (
              <article key={P.who} className="pv-card" id={`pv${i}`} style={vars({ "--tint": P.tint, "--blob": P.blob })}>
                <div className="pv-art">
                  <svg className="pv-svg" viewBox="0 0 520 280" aria-hidden="true" dangerouslySetInnerHTML={{ __html: nightArt(P, i) }} />
                </div>
                <div className="pv-copy">
                  <p className="pv-who">{P.who}</p>
                  <p className="say">{P.say}</p>
                  <p className="pv-step">
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <use href="#i-check" />
                    </svg>
                    <span>{P.step}</span>
                  </p>
                  <button className="txt-btn" onClick={(e) => entry.withWords(e.currentTarget, P.say)}>
                    That&apos;s me. Start here
                    <svg aria-hidden="true">
                      <use href="#i-arrow" />
                    </svg>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
