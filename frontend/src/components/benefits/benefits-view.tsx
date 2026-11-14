"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Landmark, Lock, X } from "lucide-react";

import { matchesNeed, NeedFilter, needsIn } from "@/components/od/need-filter";
import { btn, CatIcon, Disclaimer, Panel, StatusPill } from "@/components/od/ui";
import { useDrawer } from "@/components/program/drawer";
import { useAnswer } from "@/components/session/answer-provider";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import {
  asksFor,
  benefits,
  cardById,
  checksOf,
  openIds,
  readiness,
  shortName,
  stageOf,
  statusLabel,
  tailoring,
  toneOf,
  type Tone,
} from "@/lib/derive";
import { STAGE_LABEL } from "@/lib/device-state";
import type { ProgramCard, SessionSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

const HOW = ["See if you qualify", "Get your papers ready", "Apply", "Hear back"];

const PRIORITY: Record<Tone, number> = { fit: 0, maybe: 1, open: 2, later: 3, checking: 4, have: 5, out: 9 };

/** A node in an "unlocks" chain, colored by that program's status. */
export function ProgramNode({ snapshot, id, small }: { snapshot: SessionSnapshot; id: string; small?: boolean }) {
  const { openProgram } = useDrawer();
  const card = cardById(snapshot, id);
  if (!card) return null;
  const tone = toneOf(card);
  const cls = cn(
    "rounded-xl text-left font-extrabold",
    small ? "px-2.5 py-[7px] text-[11.5px]" : "px-3 py-[9px] text-xs",
    tone === "fit" || tone === "have" ? "bg-brand-soft text-brand-text" : tone === "maybe" ? "bg-amber text-amber-ink" : tone === "later" ? "bg-lav text-lav-ink" : "bg-surface-2 text-ink",
    tone === "out" && "line-through opacity-60",
  );
  const label = `${shortName(card.program)} (${statusLabel(card, openIds(snapshot))})`;
  return card.program.guide ? (
    <Link href={`/benefits/${card.program.guide.slug}`} className={cls} title={label}>
      {shortName(card.program)}
    </Link>
  ) : (
    <button type="button" className={cls} title={label} onClick={() => openProgram(id)}>
      {shortName(card.program)}
    </button>
  );
}

function BenefitCard({ card }: { card: ProgramCard }) {
  const { snapshot } = useApp();
  const { plan } = usePlan();
  const { moved } = useAnswer();
  const { openProgram } = useDrawer();
  if (!snapshot || !card.program.guide) return null;
  const g = card.program.guide;
  const tone = toneOf(card);
  const stage = stageOf(plan, card.program.id);
  const asks = asksFor(card, openIds(snapshot)).length + tailoring(snapshot, card).open.length;
  const r = readiness(card.program, plan);
  const reason =
    tone === "out" ? checksOf(card, "fail")[0]?.text : tone === "later" ? checksOf(card, "later")[0]?.text : checksOf(card, "pass", "have")[0]?.text;
  const ReasonIcon = tone === "out" ? X : tone === "later" ? Lock : Check;
  const cta = tone === "have" ? "See what it unlocks" : stage ? "Continue the guide" : tone === "open" ? "How to use it" : "Start the guide";

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px] shadow-card transition-[border-color,box-shadow] duration-300 hover:border-gov-line",
        moved.has(card.program.id) && "shadow-[0_0_0_3px_var(--brand-line)]",
      )}
    >
      <div className="flex items-start gap-3">
        <CatIcon category={card.program.categories[0]} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[16.5px] font-extrabold tracking-[-0.4px]">{g.short_name}</h3>
          <div className="mt-[3px] text-[11.5px] font-bold leading-[1.45] text-faint">{g.decided_by}</div>
        </div>
        <StatusPill tone={stage === "approved" ? "fit" : stage === "denied" ? "out" : stage ? "open" : tone}>
          {stage ? STAGE_LABEL[stage] : statusLabel(card, openIds(snapshot))}
        </StatusPill>
      </div>
      <p className="text-[12.5px] leading-[1.6] text-muted-foreground">{g.what}</p>
      {reason ? (
        <p className="-mt-1 flex gap-1.5 text-[11px] font-bold text-faint">
          <ReasonIcon aria-hidden className="mt-px size-3.5 shrink-0" />
          <span className="line-clamp-2">{reason}</span>
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Questions", asks ? `${asks} to answer` : "All set", asks ? "text-amber-ink" : "text-brand-text"],
          ["Documents", r.total ? `${r.got} of ${r.total} ready` : "Ask them", r.total && r.got === r.total ? "text-brand-text" : ""],
          ["When", g.when, ""],
        ].map(([k, v, c]) => (
          <div key={k} className="min-w-0 rounded-xl bg-surface-2 px-2.5 py-[9px]">
            <small className="mb-[3px] block text-[10px] font-extrabold uppercase tracking-[0.8px] text-faint">{k}</small>
            <b className={cn("block truncate text-[12.5px]", c)} title={v}>
              {v}
            </b>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <Link href={`/benefits/${g.slug}`} className={btn("gov", "sm")}>
          {cta} <ArrowRight aria-hidden />
        </Link>
        <button type="button" className={btn("link")} onClick={() => openProgram(card.program.id)}>
          Program details <ArrowRight aria-hidden />
        </button>
      </div>
    </article>
  );
}

export function BenefitsView() {
  const { snapshot } = useApp();
  const { plan } = usePlan();
  const [need, setNeed] = useState("all");
  if (!snapshot) return null;

  const all = benefits(snapshot).filter((c) => c.program.guide);
  const needs = needsIn(all);
  const filter = needs.includes(need) ? need : "all";
  const shown = all.filter((c) => matchesNeed(c, filter));
  const live = shown
    .filter((c) => toneOf(c) !== "out")
    .sort(
      (a, b) =>
        Number(!!stageOf(plan, b.program.id)) - Number(!!stageOf(plan, a.program.id)) || PRIORITY[toneOf(a)] - PRIORITY[toneOf(b)],
    );
  const out = shown.filter((c) => toneOf(c) === "out");
  const chains = all
    .filter((c) => toneOf(c) !== "out")
    .map((c) => ({
      card: c,
      kids: (c.program.guide?.unlocks ?? []).filter((id) => {
        const k = cardById(snapshot, id);
        return k && toneOf(k) !== "out";
      }),
    }))
    .filter((x) => x.kids.length);

  return (
    <>
      <header className="relative mb-6 overflow-hidden rounded-[28px] bg-gov px-5 py-6 min-[751px]:px-8 min-[751px]:py-8">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-surface opacity-[0.07]" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[11.5px] font-extrabold text-gov-ink">
            <Landmark aria-hidden className="size-3.5" />
            Government benefits
          </span>
          <h1 className="mb-2 mt-3.5 text-[clamp(28px,3.4vw,40px)] font-extrabold leading-[1.1] tracking-[-1.4px]">Benefits you may qualify for</h1>
          <p className="max-w-[560px] text-[15.5px] leading-[1.6] text-ink/80">
            Pick one and we&apos;ll walk you through it, step by step. Only the agency can say yes, but we&apos;ll get you ready.
          </p>
          <ol aria-label="How each guide works" className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {HOW.map((t, i) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-2 rounded-full bg-surface/70 py-1.5 pl-1.5 pr-3 text-[12.5px] font-extrabold backdrop-blur-sm">
                  <span className="grid size-5 place-items-center rounded-full bg-gov-ink text-[10.5px] text-surface">{i + 1}</span>
                  {t}
                </span>
                {i < HOW.length - 1 ? <ArrowRight aria-hidden className="size-3.5 text-gov-ink opacity-60" /> : null}
              </li>
            ))}
          </ol>
        </div>
      </header>

      <NeedFilter needs={needs} value={filter} onChange={setNeed} />

      <h2 className="sr-only">Benefits that may fit you</h2>
      {live.length ? (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))]">
          {live.map((c) => (
            <BenefitCard key={c.program.id} card={c} />
          ))}
        </div>
      ) : (
        <Panel className="text-[13px] leading-[1.7] text-muted-foreground">
          None of the government benefits we track match what you picked. You can add a need on About you.
        </Panel>
      )}

      {chains.length ? (
        <Panel className="mt-[22px]">
          <div className="mb-2 flex items-baseline justify-between gap-2.5">
            <h2 className="text-[15px] font-extrabold">One yes opens more</h2>
            <span className="text-xs text-faint">Apply for these first</span>
          </div>
          {chains.map(({ card, kids }) => (
            <div
              key={card.program.id}
              className="grid items-center gap-2.5 border-t border-line py-3 first-of-type:border-t-0 first-of-type:pt-1 min-[620px]:grid-cols-[auto_26px_minmax(0,1fr)]"
            >
              <div>
                <ProgramNode snapshot={snapshot} id={card.program.id} />
              </div>
              <ArrowRight aria-hidden className="size-[18px] rotate-90 text-faint min-[620px]:rotate-0" />
              <div className="flex flex-wrap gap-1.5">
                {kids.map((id) => (
                  <ProgramNode key={id} snapshot={snapshot} id={id} small />
                ))}
              </div>
            </div>
          ))}
          <p className="mt-2.5 text-[11.5px] leading-[1.6] text-muted-foreground">
            The programs on the right list the one on the left as a way to qualify. Getting it approved early saves paperwork later.
          </p>
        </Panel>
      ) : null}

      {out.length ? (
        <details className="mt-[22px] rounded-[20px] border border-line bg-surface px-5 py-4">
          <summary className="cursor-pointer text-sm font-extrabold">
            Not a fit right now <span className="font-semibold text-faint">· {out.length}</span>
          </summary>
          {out.map((c) => (
            <div key={c.program.id} className="mt-2.5 flex items-center justify-between gap-2.5 border-t border-line pt-2.5 text-[12.5px]">
              <div className="min-w-0">
                <strong>{shortName(c.program)}</strong>
                <small className="block text-[11.5px] leading-normal text-muted-foreground">{checksOf(c, "fail")[0]?.text}</small>
              </div>
              <Link href={`/benefits/${c.program.guide!.slug}`} className={btn("link")}>
                See why <ArrowRight aria-hidden />
              </Link>
            </div>
          ))}
        </details>
      ) : null}
      <Disclaimer className="mt-6" />
    </>
  );
}
