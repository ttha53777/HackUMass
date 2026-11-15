"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { readName } from "@/lib/device-state";
import { caseOf, hubSteps, incomeQuestionId, nextUp, progress } from "@/lib/hub-derive";

import { AskBox, CheckBox, Told, WalletBox } from "./aside-parts";
import { Hero, type HeroAction } from "./hero";
import { useHub } from "./hub-state";
import { Doodle } from "./icons";
import { Banner, Filters, Lanes, NextCard } from "./plan-parts";
import { HubSheets } from "./sheets";
import { Shortcuts } from "./shortcuts";
import { Spotlight } from "./spotlight";
import { WebPlaces } from "./web-places";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

function Skeletons() {
  return (
    <div className="skels">
      <div className="skel b" />
      <div className="skel l" style={{ width: "40%" }} />
      <div className="cards">
        <div className="skel c" />
        <div className="skel c" />
      </div>
    </div>
  );
}

/** "Your plan": the whole plan on one page, built from the session snapshot. */
export function PlanHub() {
  const { snapshot: s, refresh, demo } = useApp();
  const { plan } = usePlan();
  const { openSheet, openSpot } = useHub();
  const online = useOnline();
  const [name, setName] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    setName(readName());
  }, []);

  const steps = useMemo(() => (s ? hubSteps(s, plan) : []), [s, plan]);
  if (!s) return null;

  const which = caseOf(s, steps, online);
  const next = nextUp(steps);
  const { done, total } = progress(steps);
  const incomeId = incomeQuestionId(s);
  const zip = s.answered.find((a) => a.question_id === "zip")?.display_value ?? "";
  const place = [s.region?.city, zip].filter(Boolean).join(" ");
  const toNext = () => (next ? openSpot(next.id) : undefined);
  const changeZip = () => openSheet({ type: "answers", edit: "zip" });

  const actions: HeroAction[] =
    which === "empty"
      ? [
          { label: "Talk it through", onClick: () => openSheet({ type: "chat" }) },
          { label: "Pick from a list", onClick: () => openSheet({ type: "needs" }), quiet: true },
        ]
      : which === "urgent"
        ? [{ label: "Do it now", onClick: toNext }]
        : which === "waiting"
          ? [{ label: "See what is next", onClick: toNext, quiet: true }]
          : which === "done"
            ? [{ label: "Add a need", onClick: () => openSheet({ type: "needs" }) }]
            : which === "offline"
              ? [{ label: "Try again", onClick: () => void refresh(), quiet: true }]
              : which === "nomatch"
                ? [{ label: "Change my ZIP", onClick: changeZip }]
                : [];

  return (
    <>
      <Hero which={which} name={demo ? "Maya" : name} place={place} done={done} total={total} actions={actions} />
      <Told s={s} steps={steps} />
      {which !== "loading" && which !== "nomatch" ? <Shortcuts s={s} steps={steps} /> : null}

      <div className="plan" id="plan">
        <section aria-label="Your plan">
          <div className="sec-head">
            <h2>
              Your plan, <em>in order.</em>
            </h2>
          </div>
          <Banner which={which} steps={steps} onChangeZip={changeZip} />
          {which === "loading" ? (
            <Skeletons />
          ) : !steps.length ? (
            <div className="empty-art">
              <Doodle id="e-plan" />
              <h3>Nothing on your plan yet</h3>
              <p>
                {which === "nomatch"
                  ? "Change your ZIP code to see help near you."
                  : "Pick what you need help with. Each one adds steps."}
              </p>
              <div className="drow">
                <button className="btn" type="button" onClick={() => openSheet({ type: "needs" })}>
                  Pick from a list
                </button>
              </div>
            </div>
          ) : (
            <>
              <Filters steps={steps} />
              <NextCard st={next} incomeId={incomeId} />
              <Lanes steps={steps} next={next} incomeId={incomeId} />
            </>
          )}
          {which !== "loading" && which !== "offline" ? <WebPlaces /> : null}
          <p className="sp-n" style={{ marginTop: 24 }}>
            Matches are potential, never official: only each provider decides. Facts come from the providers&apos; own pages.
          </p>
        </section>

        <aside>
          <CheckBox s={s} />
          <AskBox s={s} />
          <WalletBox s={s} steps={steps} />
        </aside>
      </div>

      <HubSheets s={s} />
      <Spotlight />
    </>
  );
}
