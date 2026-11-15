"use client";

import type { CSSProperties, ReactNode } from "react";

import type { HubCase } from "@/lib/hub-derive";

import { DoorScene } from "./door-scene";
import { Arrow, Underline } from "./icons";

/** How open the door starts for each case (1 = shut). "start" follows progress instead. */
const OPEN: Record<HubCase, number | null> = {
  start: null,
  empty: 1,
  urgent: 1,
  waiting: 0.7,
  done: 0.14,
  offline: 1,
  nomatch: 1,
  loading: 1,
};

function partOfDay(d: Date) {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

type Copy = { eyebrow: string; title: ReactNode; lede: string };

function copyFor(which: HubCase, name: string, place: string): Copy {
  const who = name ? `${name}, ` : "";
  const Who = (rest: string) => (name ? `${name}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));
  const em = (text: string) => (
    <em>
      {text}
      <Underline />
    </em>
  );
  const now = new Date();
  switch (which) {
    case "empty":
      return { eyebrow: "New here", title: <>{Who("tell us what ")}{em("is going on.")}</>, lede: "Pick what you need help with. We build the plan from there." };
    case "urgent":
      return { eyebrow: "One thing cannot wait", title: <>{Who("start with ")}{em("this one")} today.</>, lede: "You told us about a deadline. The green card has the quickest way." };
    case "waiting":
      return { eyebrow: "Sent by you", title: <>{Who("now we ")}{em("wait")} for replies.</>, lede: "Agencies usually answer in days to weeks. Keep your papers handy." };
    case "done":
      return { eyebrow: "All caught up", title: <>{Who("the door is ")}{em("open.")}</>, lede: "Every step is done. Add a need if something new comes up." };
    case "offline":
      return { eyebrow: "You are offline", title: <>Your plan stays {em("on screen.")}</>, lede: "You can read every card while this page is open. Answers wait until you reconnect." };
    case "nomatch":
      return { eyebrow: "Outside our area", title: <>We do not cover {em("that ZIP")} yet.</>, lede: "Check the ZIP code. Local help here is only for the area we have checked." };
    case "loading":
      return { eyebrow: "One moment", title: <>Building {em("your plan.")}</>, lede: "Matching what you told us to programs near you." };
    default:
      return {
        eyebrow: `${now.toLocaleDateString("en-US", { weekday: "long" })} ${partOfDay(now)}${place ? ` · ${place}` : ""}`,
        title: <>{who}here is {em("everything")} in one plan.</>,
        lede: "Your answers built this plan. Start with the green card.",
      };
  }
}

export type HeroAction = { label: string; onClick: () => void; quiet?: boolean };

export function Hero({
  which,
  name,
  place,
  done,
  total,
  actions,
}: {
  which: HubCase;
  name: string;
  place: string;
  done: number;
  total: number;
  actions: HeroAction[];
}) {
  const c = copyFor(which, name, place);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const open = OPEN[which] ?? 1 - 0.86 * (total ? done / total : 0);
  return (
    <section className="hero">
      <div>
        <p className="mono">{c.eyebrow}</p>
        <h1>{c.title}</h1>
        <p className="lede">{c.lede}</p>
        <div className="meter">
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Steps done">
            <i style={{ "--p": `${pct}%` } as CSSProperties} />
          </div>
          <b>
            {done} of {total} steps done
          </b>
        </div>
        {actions.length ? (
          <div className="heroCta">
            {actions.map((a) => (
              <button key={a.label} className={a.quiet ? "btn quiet" : "btn"} type="button" onClick={a.onClick}>
                {a.label} {a.quiet ? null : <Arrow />}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <DoorScene which={which} open={open} />
    </section>
  );
}
