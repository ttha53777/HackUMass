"use client";

import { useMemo, useState } from "react";

import { DETAIL_LABEL, DETAIL_ORDER, type Detail } from "@/components/documents/details-store";
import { helperReads } from "@/components/documents/paper-store";
import { docLabel } from "@/components/od/doc-kinds";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { walletKinds, walletTexts } from "@/lib/derive";
import { hubSteps, usedIn } from "@/lib/hub-derive";

import { useHub } from "./hub-state";
import { Arrow, Doodle, Tick, Underline } from "./icons";
import { Switch } from "./paper-sheets";
import { usePapersHub } from "./papers-context";
import { HubSheets } from "./sheets";
import { Spotlight } from "./spotlight";

const KIND_ICON: Record<string, string> = {
  id: "n-id",
  income: "money",
  member_income: "money",
  heat: "n-heat",
  shutoff: "warn",
  lease: "n-housing",
  owner: "n-housing",
  address: "n-housing",
  dob: "about",
  status: "n-immigration",
  aid: "n-education",
  umass: "n-education",
  notices: "warn",
};
const kindIcon = (k: string) => KIND_ICON[k] ?? "docs";

function DetailRow({ d }: { d: Detail }) {
  const papers = usePapersHub();
  const toast = useToast();
  return (
    <div className="logrow" style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}>
      <div>
        <b>{d.value}</b>
        <small>
          {DETAIL_LABEL[d.key]}
          {d.sourceTitle ? ` · from ${d.sourceTitle}` : ""}
          {d.other ? ` · ${d.other.sourceTitle ?? "another paper"} says ${d.other.value}` : ""}
        </small>
      </div>
      <span style={{ display: "flex", gap: 10 }}>
        {d.confirmed ? (
          <span className="pip ok">
            <Tick className="mi" />
            Confirmed
          </span>
        ) : (
          <button
            className="btn sm"
            type="button"
            onClick={async () => {
              await papers.confirmDetail(d);
              toast(`${DETAIL_LABEL[d.key]} confirmed. Kept on this device.`);
            }}
          >
            Looks right
          </button>
        )}
        <button className="txt-btn" type="button" style={{ fontSize: ".86rem" }} onClick={() => void papers.removeDetail(d)}>
          Remove
        </button>
      </span>
    </div>
  );
}

/** "Papers": each kind of paper the plan asks for, saved once, shown at a counter or used by the helper. */
export function PapersView() {
  const { snapshot: s } = useApp();
  const { plan } = usePlan();
  const { openSheet } = useHub();
  const papers = usePapersHub();
  const [pack, setPack] = useState<string | null>(null);
  const steps = useMemo(() => (s ? hubSteps(s, plan) : []), [s, plan]);
  if (!s) return null;

  const kinds = walletKinds(s, plan);
  const label = (k: string) => docLabel(k, walletTexts(kinds.find((d) => d.kind === k) ?? { kind: k, uses: [] }));
  const saved = kinds.filter((d) => plan.docs.includes(d.kind));
  const needed = kinds.filter((d) => !plan.docs.includes(d.kind) && usedIn(d.kind, steps).length);
  const readable = saved.filter((d) => {
    const p = papers.paperFor(d.kind);
    return p && helperReads(p, d.kind);
  }).length;
  const visits = steps.filter((st) => !st.done && st.kinds.length);
  const packStep = visits.find((st) => st.id === pack) ?? visits[0];
  const details = DETAIL_ORDER.map((k) => papers.details.find((d) => d.key === k)).filter((d): d is Detail => !!d);

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
          <p className="lede">Save each one once. Show it at the counter, or let the helper use it.</p>
        </div>
        <div className={papers.helper ? "helper on" : "helper"}>
          <div className="hh">
            <span className="hi">
              <Doodle id="bot" />
            </span>
            <div>
              <h3>Form helper</h3>
              <p>
                {papers.helper ? (
                  <>
                    <b>On.</b> Can use {readable} of your saved papers and your confirmed details to fill forms. You press Send.
                  </>
                ) : (
                  <>
                    <b>Off.</b> Turn on to let it fill forms from your papers and details.
                  </>
                )}
              </p>
            </div>
            <Switch on={papers.helper} label="Let the form helper use my papers" onChange={papers.setHelper} />
          </div>
          <div className="nevers">
            <span>
              <Doodle id="lock" />
              Never uses an ID number or Social Security number
            </span>
          </div>
        </div>
      </section>

      <section className="pv-s">
        <div className="sh">
          <div>
            <h2>Your papers</h2>
            <p className="sub">
              {saved.length} ready{needed.length ? ` · ${needed.length} your plan still needs` : ""}
            </p>
          </div>
          <button className="btn sm" type="button" onClick={() => openSheet({ type: "upload", kind: null })}>
            + Add a paper
          </button>
        </div>
        {kinds.length ? (
          <div className="pgrid2">
            {saved.map((d) => {
              const paper = papers.paperFor(d.kind);
              const n = usedIn(d.kind, steps).length;
              return (
                <article className="pcard" key={d.kind}>
                  <button className="pthumb" type="button" aria-label={`Open ${label(d.kind)}`} onClick={() => openSheet({ type: "paper", kind: d.kind })}>
                    <span className="ey">
                      <Tick className="mi" />
                      {paper ? "Saved" : "You have it"}
                    </span>
                    <div className="sheet">
                      <i style={{ width: "70%" }} />
                      <i className="hl" />
                      <i style={{ width: "84%" }} />
                      <i className="hl" style={{ width: "50%" }} />
                      <span className="kic">
                        <Doodle id={kindIcon(d.kind)} />
                      </span>
                    </div>
                  </button>
                  <div className="pbody">
                    <h4>{label(d.kind)}</h4>
                    {paper ? <p className="pm">{paper.name}</p> : <p className="pm">No copy saved. Bring the paper itself.</p>}
                    <p className="used">{n ? <>Used in <b>{n}</b> step{n === 1 ? "" : "s"}</> : "Not needed by an open step right now"}</p>
                  </div>
                  <div className="pfoot">
                    {paper ? (
                      <label>
                        <Switch
                          small
                          on={helperReads(paper, d.kind)}
                          label={`Form helper can read ${label(d.kind)}`}
                          onChange={(on) => void papers.setHelperRead(paper, d.kind, on)}
                        />
                        Helper reads
                      </label>
                    ) : (
                      <button className="txt-btn" type="button" onClick={() => openSheet({ type: "upload", kind: d.kind })}>
                        Add a copy
                      </button>
                    )}
                    <button className="txt-btn" type="button" onClick={() => openSheet({ type: "counter", kinds: [d.kind] })}>
                      Show at counter
                    </button>
                  </div>
                </article>
              );
            })}
            {needed.map((d) => {
              const n = usedIn(d.kind, steps).length;
              return (
                <article className="pcard need" key={d.kind}>
                  <div className="pthumb">
                    <span className="ey">Needed</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
                      <Doodle id={kindIcon(d.kind)} />
                      <h4 style={{ font: "400 1.3rem/1.15 var(--display)" }}>{label(d.kind)}</h4>
                    </div>
                  </div>
                  <div className="pbody">
                    <p className="used">
                      Needed for <b>{n}</b> step{n === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="pfoot">
                    <button className="btn sm" type="button" onClick={() => openSheet({ type: "upload", kind: d.kind })}>
                      Add it <Arrow />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-art">
            <Doodle id="e-wallet" />
            <h3>No papers asked for yet</h3>
            <p>None of the steps on your plan list papers. Providers may still ask when you contact them.</p>
          </div>
        )}
      </section>

      {packStep ? (
        <section className="pv-s">
          <div className="sh">
            <div>
              <h2>Going to an appointment?</h2>
              <p className="sub">Pick it and see what to bring.</p>
            </div>
          </div>
          <div className="pack">
            <div className="chips" role="group" aria-label="Where are you going">
              {visits.slice(0, 6).map((st) => (
                <button key={st.id} className="chip" type="button" aria-pressed={packStep.id === st.id} onClick={() => setPack(st.id)}>
                  {st.title}
                </button>
              ))}
            </div>
            <div className="plist">
              {packStep.kinds.map((k) =>
                plan.docs.includes(k) ? (
                  <button key={k} className="ptile" type="button" onClick={() => openSheet({ type: "paper", kind: k })}>
                    <Doodle id={kindIcon(k)} />
                    <b>{label(k)}</b>
                    <small>Ready</small>
                  </button>
                ) : (
                  <button key={k} className="ptile miss" type="button" onClick={() => openSheet({ type: "upload", kind: k })}>
                    <Doodle id={kindIcon(k)} />
                    <b>{label(k)}</b>
                    <small>Missing · add it</small>
                  </button>
                ),
              )}
            </div>
            <div className="drow">
              <button className="btn" type="button" onClick={() => openSheet({ type: "counter", kinds: packStep.kinds.filter((k) => plan.docs.includes(k)) })}>
                Show at the counter <Arrow />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {papers.log.length ? (
        <section className="pv-s">
          <div className="panel2">
            <h3>What the helper did</h3>
            {papers.log.map((l) => (
              <div className="logrow" key={`${l.programId}-${l.at}`}>
                <Doodle id="eye" />
                <div>
                  <b>
                    {l.outcome === "submitted" ? "Sent by you" : l.outcome === "stopped" ? "Stopped" : "Filled"}: {l.title}
                  </b>
                  <small>
                    {new Date(l.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {l.actions} step{l.actions === 1 ? "" : "s"} on the form
                    {l.details ? ` · used ${l.details} of your confirmed details` : " · from your answers"}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {details.length ? (
        <section className="pv-s">
          <div className="panel2">
            <h3>Your details</h3>
            <p className="sub" style={{ color: "var(--ink-2)", fontSize: ".94rem" }}>
              Read from your papers and kept on this device only. The form helper uses only the ones you confirm.
            </p>
            {details.map((d) => (
              <DetailRow key={d.id} d={d} />
            ))}
          </div>
        </section>
      ) : null}

      <HubSheets s={s} />
      <Spotlight />
    </>
  );
}
