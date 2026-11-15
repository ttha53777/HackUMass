"use client";

import { useWebResources } from "@/components/home/web-resources";

import { Doodle } from "./icons";
import { needIcon } from "./needs";

/**
 * "Other places to look · not checked": web results for needs with no checked program nearby.
 * Kept apart from the plan, never with a fit badge or a step. Empty when web search is off.
 */
export function WebPlaces() {
  const groups = useWebResources();
  if (!groups.length) return null;
  return (
    <section className="lane" aria-labelledby="web-places">
      <div className="lane-h">
        <Doodle id="search" />
        <h3 id="web-places">Other places to look</h3>
        <span className="mono">not checked</span>
      </div>
      <p className="sp-n" style={{ marginBottom: 12 }}>
        We don&apos;t have checked programs for these yet, so we searched the web. We haven&apos;t checked these; confirm details with the organization.
      </p>
      <div className="stack">
        {groups.map((g) => (
          <div className="slim" key={g.need} style={{ cursor: "default" }}>
            <b style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Doodle id={needIcon(g.need)} className="mi" />
              {g.label}
            </b>
            <span className="sub" style={{ display: "grid", gap: 4 }}>
              {g.results.map((r) => (
                <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: "var(--door)" }}>
                  {r.title} <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>· {r.domain}</span>
                </a>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
