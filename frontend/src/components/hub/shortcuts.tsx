"use client";

import { usePlan } from "@/components/session/plan-state";
import { walletKinds } from "@/lib/derive";
import type { HubStep } from "@/lib/hub-derive";
import type { SessionSnapshot } from "@/lib/types";

import { useHub } from "./hub-state";
import { Doodle } from "./icons";

function Tile({ on, icon, title, text, action }: { on: boolean; icon: string; title: string; text: string; action: React.ReactNode }) {
  return (
    <div className={on ? "tl on" : "tl"}>
      <Doodle id={icon} className="ic2" />
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * "Shortcuts · optional": add a paper once, connect a (simulated) bank, let the helper fill a
 * form. Each saves typing; none is needed. The form tile shows only when the helper can fill one.
 */
export function Shortcuts({ s, steps }: { s: SessionSnapshot; steps: HubStep[] }) {
  const { plan } = usePlan();
  const { openSheet, openSpot } = useHub();
  const kinds = walletKinds(s, plan);
  const have = kinds.filter((d) => plan.docs.includes(d.kind));
  const firstMissing = kinds.find((d) => !plan.docs.includes(d.kind));
  const reuse = steps.filter((st) => !st.done && st.kinds.some((k) => plan.docs.includes(k))).length;
  const bank = !!s.financial_summary;
  // Forms the helper can fill, among open steps; "ready" means nothing blocks them.
  const forms = steps.filter((st) => !st.done && st.pips.some((p) => p.k === "form" && !p.ok));
  const readyForms = forms.filter((st) => !st.pips.some((p) => !p.ok && p.k !== "form"));
  const firstForm = readyForms[0] ?? forms[0];
  const sentAny = steps.some((st) => st.sent);
  if (!kinds.length && !steps.length) return null;
  return (
    <>
      <p className="mono sc-label">Shortcuts · optional</p>
      <div className="tiles hub-tiles">
        {kinds.length ? (
          <Tile
            on={have.length > 1}
            icon="docs"
            title="Add a paper once"
            text={`${have.length} of ${kinds.length} ready${reuse ? ` · used in ${reuse} step${reuse === 1 ? "" : "s"}` : ""}`}
            action={
              <button className="btn sm" type="button" onClick={() => openSheet({ type: "upload", kind: firstMissing?.kind ?? null })}>
                Add
              </button>
            }
          />
        ) : null}
        <Tile
          on={bank}
          icon="money"
          title="Connect a bank"
          text={bank ? "Connected · read-only · simulated" : "Skip typing income and bills"}
          action={
            bank ? (
              <button className="txt-btn" type="button" onClick={() => openSheet({ type: "bank" })}>
                Manage
              </button>
            ) : (
              <button className="btn sm" type="button" onClick={() => openSheet({ type: "bank" })}>
                Connect
              </button>
            )
          }
        />
        {forms.length || sentAny ? (
          <Tile
            on={sentAny}
            icon="form"
            title="Fill the form for me"
            text={firstForm ? `${readyForms.length} ready · you press Send` : "All forms sent"}
            action={
              firstForm ? (
                <button
                  className="btn sm"
                  type="button"
                  onClick={() => (readyForms.length ? openSheet({ type: "form", id: firstForm.id }) : openSpot(firstForm.id))}
                >
                  {readyForms.length ? "Fill" : "Get ready"}
                </button>
              ) : null
            }
          />
        ) : null}
      </div>
    </>
  );
}
