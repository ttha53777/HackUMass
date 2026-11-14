"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Footprints, HandHeart, MapPin, Moon, Phone, FileText, type LucideIcon } from "lucide-react";

import { matchesNeed, NeedFilter, needsIn } from "@/components/od/need-filter";
import { btn, CAT_CLASS, Disclaimer, Panel } from "@/components/od/ui";
import { useDrawer } from "@/components/program/drawer";
import { ProgramCard } from "@/components/program/program-card";
import { useApp } from "@/components/session/session-provider";
import { checksOf, dayName, localHelp, toneOf, weekEvents } from "@/lib/derive";
import type { LocalAccess } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCESS: { key: LocalAccess; icon: LucideIcon; title: string; sub: string }[] = [
  { key: "walk_in", icon: Footprints, title: "Walk in, no sign-up", sub: "Show up during open hours. Nothing to fill out." },
  { key: "register", icon: MapPin, title: "Sign up when you arrive, or ahead online", sub: "A short registration, often the same day." },
  { key: "call", icon: Phone, title: "Call to get started", sub: "A phone call is the first step. Staff take it from there." },
  { key: "apply", icon: FileText, title: "A short local application", sub: "A form or referral, reviewed by the local group." },
];

/** The next 7 days of posted drop-in times. Programs without posted hours are left out, and we say so. */
function WeekCalendar() {
  const { snapshot } = useApp();
  const { openProgram } = useDrawer();
  if (!snapshot) return null;
  const days = weekEvents(snapshot).filter((d) => d.events.length);
  const unposted = localHelp(snapshot).filter((c) => !c.program.hours?.length && ["fit", "open", "maybe"].includes(toneOf(c))).length;

  return (
    <>
      {days.length ? (
        <ol className="flex flex-col">
          {days.map((day) => (
            <li key={day.offset} className="grid grid-cols-[62px_minmax(0,1fr)] gap-3 border-t border-line py-[11px] first:border-t-0 first:pt-0.5">
              <div className="text-[11px] font-extrabold uppercase leading-[1.3] tracking-[0.8px] text-muted-foreground">
                {dayName(day, true)}
                <strong className={cn("block font-display text-xl normal-case tracking-[-0.5px] tabular-nums", day.offset === 0 ? "text-brand-text" : "text-ink")}>
                  {day.date.getDate()}
                </strong>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                {day.events.map(({ card, entry }) => (
                  <button
                    key={`${card.program.id}-${entry.label}`}
                    type="button"
                    onClick={() => openProgram(card.program.id)}
                    className={cn(
                      "flex w-full items-baseline justify-between gap-2.5 rounded-[10px] px-[9px] py-2 text-left text-[11.5px] leading-[1.4]",
                      CAT_CLASS[card.program.categories[0]]?.split(" ")[0] ?? "bg-surface-2",
                    )}
                  >
                    <strong className="text-[12.5px] text-ink">{entry.label}</strong>
                    <small className="shrink-0 font-bold tabular-nums text-muted-foreground">{entry.time}</small>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[12.5px] leading-[1.6] text-muted-foreground">None of your programs post drop-in hours this week. Call or apply any day.</p>
      )}
      {unposted ? (
        <p className="mt-2.5 flex items-start gap-2 text-[11.5px] leading-[1.6] text-muted-foreground">
          <Moon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand-text" />
          <span>
            {unposted} more {unposted === 1 ? "place doesn't" : "places don't"} post hours we could confirm. Call before you go.
          </span>
        </p>
      ) : null}
    </>
  );
}

export function LocalView() {
  const { snapshot } = useApp();
  const { openProgram } = useDrawer();
  const [need, setNeed] = useState("all");
  if (!snapshot) return null;

  const all = localHelp(snapshot);
  const needs = needsIn(all);
  const filter = needs.includes(need) ? need : "all";
  const shown = all.filter((c) => matchesNeed(c, filter));
  const out = shown.filter((c) => toneOf(c) === "out");
  const live = shown.filter((c) => toneOf(c) !== "out");
  const groups = ACCESS.map((a) => ({ ...a, items: live.filter((c) => c.program.access === a.key) })).filter((g) => g.items.length);
  const ungrouped = live.filter((c) => !ACCESS.some((a) => a.key === c.program.access));
  const zip = snapshot.profile_summary.find((p) => p.field === "zip")?.display_value;

  return (
    <>
      <div className="mb-[22px]">
        <span className="inline-flex items-center gap-[7px] rounded-full bg-loc py-[5px] pl-2 pr-[11px] text-[11px] font-extrabold text-loc-ink">
          <HandHeart aria-hidden className="size-3.5" />
          Local help
        </span>
        <h1 className="my-2 text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.12] tracking-[-1.4px]">
          Help from groups near {zip ? `ZIP ${zip}` : "you"}.
        </h1>
        <p className="max-w-[640px] text-[14.5px] leading-[1.7] text-muted-foreground">
          Food pantries, hot meals, shelter, clinics and community programs run by local nonprofits. Most don&apos;t need a long application.
          Sorted by how you get started.
        </p>
      </div>

      <NeedFilter needs={needs} value={filter} onChange={setNeed} />

      <div className="grid items-start gap-[22px] min-[1101px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-[22px]">
          {groups.length || ungrouped.length ? (
            <>
              {groups.map(({ key, icon: Icon, title, sub, items }) => (
                <section key={key} aria-labelledby={`g-${key}`}>
                  <div className="mb-1 flex items-baseline justify-between gap-2.5">
                    <h2 id={`g-${key}`} className="flex items-center gap-2 text-lg font-extrabold tracking-[-0.6px]">
                      <Icon aria-hidden className="size-[18px] text-brand-text" />
                      {title}
                    </h2>
                    <span className="text-xs text-faint">{items.length}</span>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">{sub}</p>
                  <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
                    {items.map((c) => (
                      <ProgramCard key={c.program.id} card={c} />
                    ))}
                  </div>
                </section>
              ))}
              {ungrouped.length ? (
                <section>
                  <h2 className="mb-3 text-lg font-extrabold tracking-[-0.6px]">More local help</h2>
                  <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
                    {ungrouped.map((c) => (
                      <ProgramCard key={c.program.id} card={c} />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <Panel className="text-[13px] text-muted-foreground">No local programs match this filter.</Panel>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Panel>
            <div className="mb-2.5 flex items-baseline justify-between gap-2.5">
              <h2 className="text-[15px] font-extrabold">Open this week</h2>
              <span className="text-xs text-faint">Drop-in times</span>
            </div>
            <WeekCalendar />
          </Panel>
          <Panel>
            <h2 className="mb-1.5 text-[15px] font-extrabold">Also applying for a benefit?</h2>
            <p className="mb-2.5 text-[12.5px] leading-[1.6] text-muted-foreground">
              Local help works today. Government benefits take longer but last. Many people do both.
            </p>
            <Link href="/benefits" className={btn("ghost", "sm")}>
              See government benefits <ArrowRight aria-hidden />
            </Link>
          </Panel>
        </aside>
      </div>

      {out.length ? (
        <details className="mt-[22px] rounded-[20px] border border-line bg-surface px-5 py-4">
          <summary className="cursor-pointer text-sm font-extrabold">
            Not a fit right now <span className="font-semibold text-faint">· {out.length}</span>
          </summary>
          {out.map((c) => (
            <div key={c.program.id} className="mt-2.5 flex items-center justify-between gap-2.5 border-t border-line pt-2.5 text-[12.5px]">
              <div className="min-w-0">
                <strong>{c.program.name}</strong>
                <small className="block text-[11.5px] leading-normal text-muted-foreground">{checksOf(c, "fail")[0]?.text}</small>
              </div>
              <button type="button" className={btn("link")} onClick={() => openProgram(c.program.id)}>
                Why <ArrowRight aria-hidden />
              </button>
            </div>
          ))}
        </details>
      ) : null}
      <Disclaimer className="mt-6" />
    </>
  );
}
