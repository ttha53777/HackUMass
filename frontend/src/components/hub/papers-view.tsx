"use client";

import { useMemo } from "react";

import { docLabel } from "@/components/od/doc-kinds";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { walletKinds, walletTexts } from "@/lib/derive";
import { hubSteps, usedIn } from "@/lib/hub-derive";

import { Doodle, Tick, Underline } from "./icons";

/**
 * "Papers": every kind of paper the person's plan asks for, marked ready or still needed.
 * Kept on this device. Adding the paper itself (read for you, then confirmed) comes with
 * the upload drawer; until then a paper is marked ready by hand, as on the old Documents page.
 */
export function PapersView() {
  const { snapshot: s } = useApp();
  const { plan, toggleDoc } = usePlan();
  const toast = useToast();
  const steps = useMemo(() => (s ? hubSteps(s, plan) : []), [s, plan]);
  if (!s) return null;

  const kinds = walletKinds(s, plan);
  const ready = kinds.filter((d) => plan.docs.includes(d.kind));
  const needed = kinds.filter((d) => !plan.docs.includes(d.kind));

  const card = (kind: string, label: string, have: boolean) => {
    const n = usedIn(kind, steps).length;
    return (
      <article key={kind} className={have ? "pcard" : "pcard need"}>
        <div className="pthumb">
          <span className="ey">{have ? "Ready" : "Needed"}</span>
          {have ? (
            <div className="sheet">
              <i style={{ width: "70%" }} />
              <i className="hl" />
              <i style={{ width: "84%" }} />
              <i className="hl" style={{ width: "50%" }} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
              <Doodle id="docs" />
              <h4 style={{ font: "400 1.3rem/1.15 var(--display)" }}>{label}</h4>
            </div>
          )}
        </div>
        <div className="pbody">
          {have ? <h4>{label}</h4> : null}
          <p className="used">
            {n ? (
              <>
                {have ? "Counts in" : "Needed for"} <b>{n}</b> step{n === 1 ? "" : "s"}
              </>
            ) : (
              "Not needed by an open step right now"
            )}
          </p>
        </div>
        <div className="pfoot">
          <button
            className={have ? "txt-btn" : "btn sm"}
            type="button"
            onClick={() => {
              toggleDoc(kind);
              toast(have ? `${label}: marked as not ready.` : `${label}: marked as ready.`);
            }}
          >
            {have ? "Mark as not ready" : "I have this"}
          </button>
        </div>
      </article>
    );
  };

  return (
    <>
      <section className="pv-hero">
        <div>
          <p className="mono">Papers</p>
          <h1>
            Your papers,{" "}
            <em>
              ready when you are.
              <Underline />
            </em>
          </h1>
          <p className="lede">Each one counts in every step that asks for it.</p>
        </div>
      </section>
      <section className="pv-s">
        <div className="sh">
          <div>
            <h2>What your plan asks for</h2>
            <p className="sub">
              {ready.length} ready{needed.length ? ` · ${needed.length} still needed` : ""}
            </p>
          </div>
        </div>
        {kinds.length ? (
          <div className="pgrid2">
            {needed.map((d) => card(d.kind, docLabel(d.kind, walletTexts(d)), false))}
            {ready.map((d) => card(d.kind, docLabel(d.kind, walletTexts(d)), true))}
          </div>
        ) : (
          <div className="empty-art">
            <Doodle id="e-wallet" />
            <h3>No papers asked for yet</h3>
            <p>None of the steps on your plan list papers. Providers may still ask when you contact them.</p>
          </div>
        )}
      </section>
      <p className="priv" style={{ marginTop: 36 }}>
        <span>
          <Doodle id="lock" />
          What you mark here stays on this device.
        </span>
        <span>
          <Tick className="mi" />
          Only each provider decides what they accept.
        </span>
      </p>
    </>
  );
}
