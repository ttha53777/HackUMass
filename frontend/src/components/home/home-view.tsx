"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Check, CircleHelp, HandHeart, Landmark, Sparkles, UserRound, Wallet } from "lucide-react";

import { HouseArt } from "@/components/front-door/house-art";
import { docLabel } from "@/components/od/doc-kinds";
import { btn, CallChip, Callout, Disclaimer, ProgressBar, SectionHead } from "@/components/od/ui";
import { useDrawer } from "@/components/program/drawer";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import {
  actionFor,
  answerFor,
  benefits,
  dayName,
  isStepDone,
  liveCount,
  localHelp,
  nextStep,
  phoneOf,
  planItems,
  readiness,
  stageOf,
  stepOf,
  walletKinds,
  walletTexts,
  weekEvents,
} from "@/lib/derive";
import { readName, STAGE_LABEL } from "@/lib/device-state";
import { plural } from "@/lib/format";
import type { ProgramCard } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ConfirmCard } from "@/components/evidence/evidence-cards";

import { SharpenCard } from "./sharpen-card";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const guideHref = (card: ProgramCard) => (card.program.guide ? `/benefits/${card.program.guide.slug}` : null);

function Tag({ track }: { track: "benefit" | "local" }) {
  return (
    <span className={cn("shrink-0 rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold", track === "benefit" ? "bg-gov text-gov-ink" : "bg-loc text-loc-ink")}>
      {track === "benefit" ? "Government" : "Local"}
    </span>
  );
}

function Glance({ icon: Icon, tint, small, title, note, onClick, href }: {
  icon: typeof Check;
  tint: string;
  small: string;
  title: ReactNode;
  note: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tint)}>
        <Icon aria-hidden className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <small className="text-[10.5px] font-extrabold uppercase tracking-[1.2px] text-faint">{small}</small>
        <b className="text-sm leading-[1.35]">{title}</b>
        <em className="text-xs not-italic leading-normal text-muted-foreground">{note}</em>
      </span>
    </>
  );
  const cls = "flex min-w-0 items-start gap-3 rounded-[18px] border border-transparent bg-surface-2 p-4 text-left transition-colors hover:border-line";
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export function HomeView() {
  const { snapshot } = useApp();
  const { plan, toggleDone } = usePlan();
  const { openProgram, openQuestion } = useDrawer();
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    setName(readName());
  }, []);
  if (!snapshot) return null;

  const items = planItems(snapshot, plan);
  const todo = items.filter((c) => !isStepDone(plan, c.program.id));
  const doneN = items.length - todo.length;
  const ns = nextStep(snapshot, plan);
  const leadId = ns.kind === "resume" || ns.kind === "plan" ? ns.card.program.id : null;
  const rest = todo.filter((c) => c.program.id !== leadId);
  const shownRest = showAll ? rest : rest.slice(0, 3);

  const govLive = liveCount(benefits(snapshot));
  const locLive = liveCount(localHelp(snapshot));
  const inProgress = Object.values(plan.apps).filter((a) => a.stage === "gather" || a.stage === "applied").length;

  const nextEvent = weekEvents(snapshot).flatMap((day) => day.events.map((ev) => ({ ...ev, day })))[0];
  const wallet = walletKinds(snapshot, plan);
  const walletGot = wallet.filter((d) => plan.docs.includes(d.kind)).length;
  const firstMissing = wallet.find((d) => !plan.docs.includes(d.kind));
  const q0 = snapshot.open_questions[0];
  const zip = answerFor(snapshot, "zip");
  const household = snapshot.profile_summary.find((p) => p.field === "household_size")?.display_value;

  // ---- hero copy, by kind of next step
  let eyebrow = "All caught up";
  let title = "Every step on your plan is done.";
  let text = "Check back when something changes. You can update any answer on About you.";
  let soon = false;
  let caveat: string | null = null;
  let actions: ReactNode = (
    <Link href="/about" className={btn("ghost")}>
      Review your answers
    </Link>
  );
  if (ns.kind === "resume") {
    const g = ns.card.program.guide!;
    const r = readiness(ns.card.program, plan);
    eyebrow = "Pick up where you left off";
    title = `Finish your ${g.short_name} application`;
    text = r.total
      ? `${r.got} of ${r.total} documents ready. The guide shows exactly what's left.`
      : "The guide walks you through how to apply and what to ask.";
    actions = (
      <Link href={guideHref(ns.card)!} className={btn("primary")}>
        Continue the guide <ArrowRight aria-hidden />
      </Link>
    );
  } else if (ns.kind === "plan") {
    const p = ns.card.program;
    const step = stepOf(p);
    eyebrow = `Your next step · ${p.track === "benefit" ? "government benefit" : "local help"}`;
    const action = actionFor(snapshot, p.id);
    title = step.title;
    // The Action Planning agent owns the order and the wording of each step.
    text = action?.next_step ?? step.detail;
    soon = action?.urgency === "high";
    caveat = action?.uncertainty ?? null;
    const href = guideHref(ns.card);
    actions = href ? (
      <Link href={href} className={btn("primary")}>
        Open the step-by-step guide <ArrowRight aria-hidden />
      </Link>
    ) : (
      <>
        <CallChip phone={phoneOf(p.contact)} className="bg-surface" />
        <button type="button" className={btn("ghost", "sm")} onClick={() => openProgram(p.id)}>
          Details
        </button>
        <button
          type="button"
          className={btn("text", "sm")}
          onClick={() => {
            toggleDone(p.id);
            toast("Nice. On to the next one.");
          }}
        >
          <Check aria-hidden /> Mark as done
        </button>
      </>
    );
  } else if (ns.kind === "question") {
    eyebrow = "Your next step";
    title = "Answer one question to see more";
    text = `${ns.open.question.prompt} It affects ${plural(ns.open.affects.length, "program")}.`;
    actions = (
      <button type="button" className={btn("primary")} onClick={() => openQuestion(ns.open.question)}>
        Answer it <ArrowRight aria-hidden />
      </button>
    );
  }

  return (
    <>
      <section className="mb-[30px] grid overflow-hidden rounded-[28px] bg-plan text-plan-ink min-[861px]:grid-cols-[minmax(0,1fr)_minmax(240px,34%)]">
        <div className="flex min-w-0 flex-col gap-3 px-[22px] pb-6 pt-7 min-[751px]:px-9 min-[751px]:pb-[30px] min-[751px]:pt-[34px]">
          <p className="text-[11px] font-extrabold uppercase tracking-[2px] text-plan-muted">
            {greeting()}
            {name ? `, ${name}` : ""}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-[7px] self-start rounded-full bg-surface py-[5px] pl-2 pr-[11px] text-[11.5px] font-extrabold text-brand-text">
            <Sparkles aria-hidden className="size-3.5" />
            {eyebrow}
          </p>
          {soon ? (
            <span className="-mt-1 self-start rounded-full bg-amber px-[11px] py-[5px] text-[11.5px] font-extrabold text-amber-ink">Do this soon</span>
          ) : null}
          <h1 className="mt-0.5 max-w-[560px] text-[clamp(26px,3vw,38px)] font-extrabold leading-[1.12] tracking-[-1.5px]">{title}</h1>
          <p className="max-w-[520px] text-[15px] leading-[1.65] text-plan-muted">{text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">{actions}</div>
          {caveat ? <p className="max-w-[560px] text-xs leading-relaxed text-plan-muted">{caveat}</p> : null}
          {items.length ? (
            <div className="mt-2.5 flex items-center gap-3 text-xs font-bold tabular-nums text-plan-muted">
              <ProgressBar value={doneN} total={items.length} className="w-[140px]" track="bg-plan-track" />
              <span>
                {doneN} of {items.length} steps done
              </span>
            </div>
          ) : null}
        </div>
        <HouseArt open className="hidden min-h-[280px] !rounded-none min-[861px]:block" label="A house with its door open among green hills" />
      </section>

      {snapshot.coverage === "unsupported" ? (
        <Callout tone="warn" className="-mt-2 mb-6">
          {zip ? `ZIP ${zip.display_value} is outside the area we cover, so most local programs won't match. ` : "Your ZIP is outside the area we cover. "}
          {zip ? (
            <button type="button" className="font-extrabold underline" onClick={() => openQuestion(zip.question)}>
              Change ZIP
            </button>
          ) : null}
        </Callout>
      ) : null}

      <div className="mb-[30px] grid items-start gap-[22px] min-[1101px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {rest.length ? (
            <section className="mb-[30px]">
              <SectionHead title="After that">
                {rest.length > 3 ? (
                  <button type="button" className={btn("link")} onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
                    {showAll ? "Show less" : `Show all ${rest.length}`} <ArrowRight aria-hidden />
                  </button>
                ) : null}
              </SectionHead>
              <ol className="flex flex-col gap-2">
                {shownRest.map((c, i) => {
                  const href = guideHref(c);
                  const stage = stageOf(plan, c.program.id);
                  const inner = (
                    <>
                      <span className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-brand-soft text-[13px] font-extrabold tabular-nums text-brand-text">
                        {i + 2}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <b className="text-sm">{stepOf(c.program).title}</b>
                        <small className="truncate text-xs text-muted-foreground">
                          {href
                            ? `${stage ? `${STAGE_LABEL[stage]} · ` : ""}Step-by-step guide`
                            : (actionFor(snapshot, c.program.id)?.rationale ?? c.program.provider)}
                        </small>
                      </span>
                      {actionFor(snapshot, c.program.id)?.urgency === "high" ? (
                        <span className="shrink-0 rounded-full bg-amber px-[9px] py-[3px] text-[10.5px] font-extrabold text-amber-ink">Do this soon</span>
                      ) : null}
                      <Tag track={c.program.track} />
                      <ArrowRight aria-hidden className="size-4 shrink-0 text-faint" />
                    </>
                  );
                  const cls =
                    "flex w-full items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition-[border-color,transform] hover:translate-x-0.5 hover:border-brand-line";
                  return (
                    <li key={c.program.id}>
                      {href ? (
                        <Link href={href} className={cls}>
                          {inner}
                        </Link>
                      ) : (
                        <button type="button" className={cls} onClick={() => openProgram(c.program.id)}>
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          <section>
            <SectionHead title="Explore your options" />
            <div className="grid gap-3.5 min-[620px]:grid-cols-2">
              <Link
                href="/benefits"
                className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface px-[18px] pb-4 pt-[18px] transition-[border-color,transform] hover:-translate-y-px hover:border-gov-line"
              >
                <span className="inline-flex items-center gap-[7px] self-start rounded-full bg-gov py-[5px] pl-2 pr-[11px] text-[11px] font-extrabold text-gov-ink">
                  <Landmark aria-hidden className="size-3.5" />
                  Government benefits
                </span>
                <div className="flex items-start gap-3.5">
                  <span className="font-display text-[34px] font-extrabold leading-none tracking-[-1.5px] tabular-nums">{govLive}</span>
                  <span>
                    <h3 className="text-base font-extrabold tracking-[-0.4px]">Benefits to apply for</h3>
                    <p className="text-[12.5px] leading-[1.6] text-muted-foreground">
                      {inProgress ? `${inProgress} in progress. ` : ""}A guide walks you through each one.
                    </p>
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-gov-ink">
                  Open benefits <ArrowRight aria-hidden className="size-3.5" />
                </span>
              </Link>
              <Link
                href="/local"
                className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface px-[18px] pb-4 pt-[18px] transition-[border-color,transform] hover:-translate-y-px hover:border-brand-line"
              >
                <span className="inline-flex items-center gap-[7px] self-start rounded-full bg-loc py-[5px] pl-2 pr-[11px] text-[11px] font-extrabold text-loc-ink">
                  <HandHeart aria-hidden className="size-3.5" />
                  Local help
                </span>
                <div className="flex items-start gap-3.5">
                  <span className="font-display text-[34px] font-extrabold leading-none tracking-[-1.5px] tabular-nums">{locLive}</span>
                  <span>
                    <h3 className="text-base font-extrabold tracking-[-0.4px]">Places near you</h3>
                    <p className="text-[12.5px] leading-[1.6] text-muted-foreground">Pantries, meals, shelter and rides. Usually just a call or a visit.</p>
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-brand-text">
                  Open local help <ArrowRight aria-hidden className="size-3.5" />
                </span>
              </Link>
            </div>
          </section>
          <section aria-label="At a glance" className="mt-[30px] grid gap-3 min-[861px]:grid-cols-3">
            {q0 ? (
              <Glance
                icon={CircleHelp}
                tint="bg-amber text-amber-ink"
                small="One quick question"
                title={snapshot.field_labels[q0.question.target_field] ?? q0.question.prompt}
                note={`Could firm up ${plural(q0.affects.length, "match", "matches")}`}
                onClick={() => openQuestion(q0.question)}
              />
            ) : (
              <Glance icon={Check} tint="bg-brand-soft text-brand-text" small="Questions" title="All caught up" note="Nothing else would change your results" />
            )}
            {nextEvent ? (
              <Glance
                icon={CalendarDays}
                tint="bg-sky text-sky-ink"
                small="Next open time"
                title={nextEvent.entry.label}
                note={`${dayName(nextEvent.day)} · ${nextEvent.entry.time}`}
                onClick={() => openProgram(nextEvent.card.program.id)}
              />
            ) : (
              <Glance icon={CalendarDays} tint="bg-sky text-sky-ink" small="This week" title="No drop-in hours posted" note="Call or apply any day" href="/local" />
            )}
            {wallet.length ? (
              <Glance
                icon={Wallet}
                tint="bg-leaf text-leaf-ink"
                small="Documents"
                title={`${walletGot} of ${wallet.length} ready`}
                note={firstMissing ? `Next: ${docLabel(firstMissing.kind, walletTexts(firstMissing))}` : "You have everything"}
                href="/documents"
              />
            ) : (
              <Glance
                icon={UserRound}
                tint="bg-leaf text-leaf-ink"
                small="Your answers"
                title={household ? `${household} at home` : "Your answers"}
                note={`${zip ? `ZIP ${zip.display_value} · ` : ""}Edit anytime`}
                href="/about"
              />
            )}
          </section>
        </div>

        {snapshot.pending_question?.origin === "conflict" ? <ConfirmCard /> : <SharpenCard />}
      </div>

      <Disclaimer className="mt-4" />
    </>
  );
}
