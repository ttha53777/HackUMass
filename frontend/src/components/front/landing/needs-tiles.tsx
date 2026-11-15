"use client";

import { vars } from "../css-vars";
import { Doodle } from "../doodles";
import { NEED } from "../needs";
import { useEntry } from "./use-entry";

const TILES = ["food", "utilities", "housing", "healthcare", "transportation", "phone_internet", "childcare", "mental_health"];

/** Whatever it is, start there: each tile starts the conversation with that need ticked. */
export function NeedsTiles() {
  const entry = useEntry();
  return (
    <section className="needs" aria-labelledby="needs-h">
      <div className="wrap">
        <div className="sec-head">
          <h2 id="needs-h" className="rv">
            Whatever it is, <em>start there.</em>
          </h2>
          <p className="rv" style={vars({ "--rd": "120ms" })}>
            Pick the one that&apos;s loudest right now. You can add the rest once we get going.
          </p>
        </div>
        <div className="tiles">
          {TILES.map((id, i) => (
            <button key={id} className="tile rv" style={vars({ "--rd": `${i * 60}ms` })} onClick={(e) => entry.withNeed(e.currentTarget, id)}>
              <Doodle kind={id} />
              <b>{NEED[id].label}</b>
              <span>{NEED[id].hint}</span>
              <svg className="go" aria-hidden="true">
                <use href="#i-arrow" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
