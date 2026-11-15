"use client";

// Archived: not used by the live app (not routed). The live UI is components/hub/; see app/(opendoor)/_archive/legacy-dashboard/README.md.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  Footprints,
  Globe,
  Landmark,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { docLabel } from "@/components/od/doc-kinds";
import { btn, CallChip, Callout, CopyButton, Disclaimer, ExtLink, ProgressBar, ReasonsList, StatusPill } from "@/components/od/ui";
import { useDrawer } from "@/components/program/drawer";
import { QuestionForm } from "@/components/program/question-form";
import { SourceRules } from "@/components/program/source-rules";
import { useAnswer } from "@/components/session/answer-provider";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import {
  answerFor,
  answerIncludes,
  asksFor,
  checksOf,
  docsFor,
  guideNotes,
  openIds,
  readiness,
  stageOf,
  statusLabel,
  tailoring,
  toneOf,
} from "@/lib/derive";
import { readName, STAGE_LABEL, type AppStage } from "@/lib/device-state";
import { formatDate } from "@/lib/format";
import type { GuideWay, ProgramCard } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ApplyAssistant } from "./apply-assistant";
import { ProgramNode } from "./benefits-view";

const WAY_ICON: Record<GuideWay["kind"], LucideIcon> = {
  online: Globe,
  phone: Phone,
  in_person: MapPin,
  mail: Mail,
  walk_in: Footprints,
  email: AtSign,
};

const STAGES: [AppStage, string, string][] = [
  ["gather", "Getting ready", "Gathering papers"],
  ["applied", "Applied", "Waiting to hear back"],
  ["approved", "Approved", "You got it"],
  ["denied", "Turned down", "See other options"],
];

type StepId = "check" | "docs" | "apply" | "track";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A collapsible disclosure for the fine print, so the main path stays short. */
function More({ title, icon: Icon, children, className }: { title: string; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <details className={cn("group mt-3 rounded-2xl bg-surface-2 [&_summary::-webkit-details-marker]:hidden", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-2xl px-4 py-3 text-[13px] font-extrabold hover:text-brand-text">
        {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span className="flex-1">{title}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

/** One step on the timeline. Only the step you are on is open; tap any other to peek. */
function Step({
  id,
  n,
  title,
  summary,
  done,
  current,
  open,
  last,
  onToggle,
  children,
}: {
  id: StepId;
  n: number;
  title: string;
  summary: string;
  done: boolean;
  current: boolean;
  open: boolean;
  last?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <li id={`step-${id}`} className="relative grid scroll-mt-6 grid-cols-[40px_minmax(0,1fr)] gap-x-3.5 min-[751px]:grid-cols-[44px_minmax(0,1fr)] min-[751px]:gap-x-5">
      {!last ? (
        <span aria-hidden className={cn("absolute bottom-0 left-[19px] top-11 w-0.5 rounded-full min-[751px]:left-[21px] min-[751px]:top-12", done ? "bg-brand" : "bg-line")} />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "relative z-[1] mt-2 grid size-10 place-items-center rounded-full text-[15px] font-extrabold transition-colors min-[751px]:size-11",
          done && "bg-brand text-on-brand",
          !done && current && "bg-gov-ink text-surface shadow-[0_0_0_5px_var(--gov)]",
          !done && !current && "border-2 border-line bg-surface text-muted-foreground",
        )}
      >
        {done ? <Check className="size-5" strokeWidth={3} /> : n}
      </span>
      <div className={cn("min-w-0", last ? "pb-1" : "pb-6")}>
        <div
          className={cn(
            "overflow-hidden rounded-[22px] border transition-[border-color,box-shadow,background-color] duration-300",
            open ? "border-line bg-surface shadow-card" : "border-transparent hover:bg-surface",
          )}
        >
          <h2>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`step-${id}-body`}
              onClick={onToggle}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left min-[751px]:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold uppercase tracking-[1.2px] text-faint">Step {n}</span>
                <span className="mt-0.5 block text-[19px] font-extrabold leading-tight tracking-[-0.5px] min-[751px]:text-[21px]">{title}</span>
                <span className={cn("mt-1 block text-[13px] font-bold", done ? "text-brand-text" : current ? "text-ink" : "text-muted-foreground")}>
                  {summary}
                </span>
              </span>
              <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
            </button>
          </h2>
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                id={`step-${id}-body`}
                key="body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.25, 0.8, 0.3, 1] }}
              >
                <div className="px-4 pb-5 min-[751px]:px-5">{children}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </li>
  );
}

/** The step-by-step guide for one benefit. Every line comes from the program record or the assessment. */
export function GuideView({ card }: { card: ProgramCard }) {
  const { snapshot } = useApp();
  const { plan, setStage, toggleDoc } = usePlan();
  const { answer } = useAnswer();
  const { openQuestion } = useDrawer();
  const toast = useToast();
  // undefined: follow the step you're on. null: everything closed. Otherwise the step you tapped.
  const [picked, setPicked] = useState<StepId | null | undefined>(undefined);
  if (!snapshot || !card.program.guide) return null;

  const p = card.program;
  const g = p.guide!;
  const open = openIds(snapshot);
  const tone = toneOf(card);
  const app = plan.apps[p.id];
  const stage = stageOf(plan, p.id);

  const good = checksOf(card, "pass", "have");
  const pending = checksOf(card, "ask", "unsure", "later");
  const bad = checksOf(card, "fail");
  const notes = checksOf(card, "note");
  const asks = asksFor(card, open)
    .map((id) => snapshot.open_questions.find((o) => o.question.id === id))
    .filter((o) => !!o);
  const tailor = tailoring(snapshot, card);
  const matched = guideNotes(snapshot, card);
  const docs = docsFor(p);
  const r = readiness(p, plan);
  const ways = [...g.ways].sort((a, b) => Number(b.best) - Number(a.best));
  const [best, ...others] = ways;

  const left = asks.length + tailor.open.length;
  const done: Record<StepId, boolean> = {
    check: !left && tone !== "out",
    docs: docs.length ? r.got === r.total : true,
    apply: stage === "applied" || stage === "approved" || stage === "denied",
    track: stage === "approved" || stage === "denied",
  };
  const order: StepId[] = ["check", "docs", "apply", "track"];
  const current = order.find((s) => !done[s]) ?? null;
  const shown = picked === undefined ? current : picked;
  const doneCount = order.filter((s) => done[s]).length;

  const go = (id: StepId) => {
    setPicked(id);
    window.requestAnimationFrame(() => document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const toggle = (id: StepId) => setPicked(shown === id ? null : id);

  const name = typeof window === "undefined" ? "" : readName();
  const zip = answerFor(snapshot, "zip")?.display_value;
  const size = answerFor(snapshot, "household_size")?.display_value;
  const shutoff = answerIncludes(answerFor(snapshot, "utility_issues"), ["shutoff"]);
  const script = `Hi, my name is ${name || "[your name]"}. I live in ${zip ? `ZIP ${zip}` : "[your town]"}${
    size ? ` with a household of ${size}` : ""
  }. I'd like to apply for ${g.short_name}${shutoff ? ", and I have a shut-off notice" : ""}. Can you tell me what I should have ready, and what happens after I apply?`;

  const changeStage = (next: AppStage | null) => {
    if (!next) {
      setStage(p.id, null);
      toast(`Removed ${g.short_name} from your plan.`);
      return;
    }
    setStage(p.id, next);
    // Approved for a benefit other programs count: add it to "benefits you get" through the real API.
    const held = p.held_benefit;
    const item = answerFor(snapshot, "benefits_held");
    const q = item?.question ?? snapshot.open_questions.find((o) => o.question.id === "benefits_held")?.question;
    if (next === "approved" && held && q && !answerIncludes(item, [held])) {
      const current = item ? q.options.filter((o) => answerIncludes(item, [o.id]) && o.id !== "none").map((o) => o.id) : [];
      void answer({ question_id: q.id, selected_option_ids: [...current, held] }, { quiet: true }).then((ok) =>
        toast(ok ? `Great news. We added ${g.short_name} to your benefits and updated your matches.` : "Approved. Nice."),
      );
      return;
    }
    toast(
      { gather: `${g.short_name} is on your plan.`, applied: "Marked as applied. Good work.", approved: "Approved. Nice.", denied: "Saved. Other options are below." }[next],
    );
  };

  const statusText = stage ? STAGE_LABEL[stage] : statusLabel(card, open);
  const statusTone = stage === "approved" ? "fit" : stage === "denied" ? "out" : stage ? "open" : tone;

  // One plain sentence: what to do right now.
  const next: { text: string; step: StepId; cta: string } =
    stage === "approved"
      ? { text: "You got it. Keep your approval letter. Other programs may ask for it.", step: "track", cta: "See what it opens up" }
      : stage === "denied"
        ? { text: "Ask them why, and whether you can appeal. Other options are in step 4.", step: "track", cta: "See other options" }
        : stage === "applied"
          ? { text: "You applied. Watch your phone and mail, then mark the answer here.", step: "track", cta: "Mark the answer" }
          : tone === "out" && !left
            ? { text: "This may not fit you right now, but you can still apply. The agency decides.", step: "check", cta: "See why" }
            : !done.check
              ? asks.length
                ? { text: `Answer ${plural(left, "quick question")} to see if you may qualify.`, step: "check", cta: "Answer now" }
                : { text: `Answer ${plural(left, "more question")} so we can trim your paper list.`, step: "check", cta: "Answer now" }
              : !done.docs
                ? { text: `Get your papers ready. ${plural(r.total - r.got, "item")} left to check off.`, step: "docs", cta: "Open checklist" }
                : { text: best ? `You're ready to apply. The easiest way: ${best.title.toLowerCase()}.` : "You're ready to apply.", step: "apply", cta: "Show me how" };

  const checkSummary = done.check
    ? tone === "fit" || tone === "open" || tone === "have"
      ? "Looks like a good fit"
      : "Nothing left to answer"
    : tone === "out" && !left
      ? "May not fit right now"
      : `${plural(left, "question")} left`;

  return (
    <div className="mx-auto w-full max-w-[800px]">
      <Link href="/benefits" className="mb-4 inline-flex items-center gap-1.5 rounded-full py-1 text-[13px] font-extrabold text-muted-foreground hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        All benefits
      </Link>

      {/* Hero */}
      <header className="relative mb-5 overflow-hidden rounded-[28px] bg-gov px-5 pb-5 pt-6 min-[751px]:px-8 min-[751px]:pb-7 min-[751px]:pt-8">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-surface opacity-[0.07]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 right-24 size-48 rounded-full bg-gov-ink opacity-[0.08]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[11.5px] font-extrabold text-gov-ink">
              <Landmark aria-hidden className="size-3.5" />
              Government benefit
            </span>
            <StatusPill tone={statusTone} className="px-3 py-1 text-[11.5px]">
              {statusText}
            </StatusPill>
          </div>
          <h1 className="mb-2 mt-3.5 text-[clamp(28px,4vw,42px)] font-extrabold leading-[1.08] tracking-[-1.5px]">{g.short_name}</h1>
          <p className="max-w-[580px] text-[15.5px] leading-[1.6] text-ink/80">{g.what}</p>
          <dl className="mt-5 grid gap-2 min-[620px]:grid-cols-3">
            {(
              [
                [Landmark, "Who decides", g.decided_by],
                [CalendarDays, "When", g.when],
                [Banknote, "Cost", g.cost],
              ] as const
            ).map(([Icon, k, v]) => (
              <div key={k} className="flex min-w-0 items-start gap-2.5 rounded-2xl bg-surface/70 px-3.5 py-3 backdrop-blur-sm">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-gov-ink" />
                <div className="min-w-0">
                  <dt className="text-[10.5px] font-extrabold uppercase tracking-[1px] text-faint">{k}</dt>
                  <dd className="mt-0.5 line-clamp-3 text-[13px] font-bold leading-snug" title={v}>
                    {v}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex items-center gap-3">
            <ProgressBar value={doneCount} total={order.length} track="bg-surface/60" className="h-2 flex-1" />
            <span className="shrink-0 text-[12px] font-extrabold tabular-nums text-gov-ink">
              {doneCount} of {order.length} steps done
            </span>
          </div>
        </div>
      </header>

      {/* Your next step */}
      <div className="mb-8 flex flex-col gap-3 rounded-[22px] border border-brand-line bg-brand-soft p-4 min-[620px]:flex-row min-[620px]:items-center min-[751px]:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-on-brand">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-brand-text">Your next step</p>
          <p className="mt-0.5 text-[16px] font-extrabold leading-snug tracking-[-0.2px]">{next.text}</p>
        </div>
        <button type="button" className={btn("primary", "md", "shrink-0 self-start min-[620px]:self-auto")} onClick={() => go(next.step)}>
          {next.cta} <ArrowRight aria-hidden />
        </button>
      </div>

      <ol aria-label="Steps to apply">
        {/* 1. Qualify */}
        <Step id="check" n={1} title="See if you qualify" summary={checkSummary} done={done.check} current={current === "check"} open={shown === "check"} onToggle={() => toggle("check")}>
          {asks.length || tailor.open.length ? (
            <p className="mb-3 text-[14px] leading-[1.6] text-muted-foreground">
              {asks.length ? "Just tap an answer. You can skip anything you'd rather not share." : "One more, so we only list the papers you need."}
            </p>
          ) : null}
          {asks.length || tailor.open.length ? (
            <div className="grid gap-3">
              {asks.map((o) => (
                <div key={o.question.id} className="rounded-[18px] border border-line bg-surface-2 p-4">
                  <p className="mb-1 text-[15px] font-extrabold">{o.question.prompt}</p>
                  {o.question.reason ? <p className="mb-3 text-[12.5px] leading-[1.55] text-muted-foreground">{o.question.reason}</p> : null}
                  <QuestionForm question={o.question} surface="tinted" />
                </div>
              ))}
              {tailor.open.map((o) => (
                <div key={o.question.id} className="rounded-[18px] border border-line bg-surface-2 p-4">
                  <p className="mb-1 text-[15px] font-extrabold">{o.question.prompt}</p>
                  {o.question.reason ? <p className="mb-3 text-[12.5px] leading-[1.55] text-muted-foreground">{o.question.reason}</p> : null}
                  <QuestionForm question={o.question} surface="tinted" tailoring />
                </div>
              ))}
            </div>
          ) : null}

          {done.check ? (
            <Callout tone="ok" className="mt-0 text-[13.5px]">
              Based on your answers, you <strong>may</strong> qualify. Only the agency can say for sure.
            </Callout>
          ) : null}

          {bad.length ? (
            <div className="mt-3 rounded-[18px] bg-surface-2 p-4">
              <p className="mb-2 text-[14px] font-extrabold">This part may not fit</p>
              <ReasonsList checks={bad} />
              <p className="mt-3 text-[12.5px] leading-[1.6] text-muted-foreground">You can still apply. The agency decides, and these rules may not cover your whole situation.</p>
            </div>
          ) : null}

          {matched.map((text) => (
            <Callout key={text} tone="ok">
              {text}
            </Callout>
          ))}

          {good.length || pending.length || tailor.answered.length ? (
            <More title="Why we think so" icon={MessageCircle}>
              {good.length ? (
                <>
                  <p className="mb-2 text-[12.5px] font-extrabold text-muted-foreground">What fits</p>
                  <ReasonsList checks={good} />
                </>
              ) : null}
              {pending.length ? (
                <>
                  <p className={cn("mb-2 text-[12.5px] font-extrabold text-muted-foreground", good.length && "mt-4")}>Not known yet</p>
                  <ReasonsList checks={pending} />
                </>
              ) : null}
              {tailor.answered.length ? (
                <div className="mt-3">
                  {tailor.answered.map((a) => (
                    <div key={a.question_id} className="flex items-center justify-between gap-2.5 border-t border-dashed border-line py-2.5 text-[12.5px]">
                      <div>
                        <span className="text-muted-foreground">{snapshot.field_labels[a.question.target_field] ?? a.prompt}</span>
                        <br />
                        <strong>{a.display_value}</strong>
                      </div>
                      <button type="button" className={btn("ghost", "sm")} onClick={() => openQuestion(a.question, { tailoring: true, current: a })}>
                        Change
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </More>
          ) : null}
        </Step>

        {/* 2. Papers */}
        <Step
          id="docs"
          n={2}
          title="Get your papers ready"
          summary={docs.length ? (r.got === r.total ? "You have everything" : `${r.got} of ${r.total} ready`) : "No list. Ask when you apply"}
          done={done.docs}
          current={current === "docs"}
          open={shown === "docs"}
          onToggle={() => toggle("docs")}
        >
          {docs.length ? (
            <>
              <p className="mb-3 text-[14px] leading-[1.6] text-muted-foreground">Tap each one you already have. Bring copies, not originals.</p>
              <div className="mb-3 flex items-center gap-3">
                <ProgressBar value={r.got} total={r.total} className="h-2 flex-1" />
                <span className={cn("text-[12px] font-extrabold tabular-nums", r.got === r.total ? "text-brand-text" : "text-muted-foreground")}>
                  {r.got}/{r.total}
                </span>
              </div>
              <ul className="grid gap-2">
                {docs.map((d) => {
                  const have = plan.docs.includes(d.kind);
                  return (
                    <li key={d.kind}>
                      <button
                        type="button"
                        aria-pressed={have}
                        onClick={() => toggleDoc(d.kind)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-[18px] border p-3.5 text-left transition-colors",
                          have ? "border-brand-line bg-brand-soft" : "border-line bg-surface hover:border-brand-line",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors",
                            have ? "border-brand bg-brand text-on-brand" : "border-line bg-surface",
                          )}
                        >
                          {have ? <Check className="size-3.5" strokeWidth={3.5} /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-[14.5px] font-extrabold", have && "text-brand-text")}>{docLabel(d.kind, d.texts)}</span>
                          {d.texts.map((t) => (
                            <span key={t} className="mt-1 block text-[12.5px] leading-[1.55] text-muted-foreground">
                              {t}
                            </span>
                          ))}
                        </span>
                        <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2.5 text-[11.5px] text-faint">Saved on this device. Papers you check here count for every benefit that needs them.</p>
            </>
          ) : (
            <p className="text-[14px] leading-[1.6] text-muted-foreground">{g.no_documents_note ?? "They don't list papers online. Ask what to bring when you contact them."}</p>
          )}
          {g.safety_note ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-[16px] bg-amber px-4 py-3 text-[13px] leading-relaxed text-amber-ink">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{g.safety_note}</span>
            </div>
          ) : null}
        </Step>

        {/* 3. Apply */}
        <Step
          id="apply"
          n={3}
          title="Apply"
          summary={done.apply ? "Application sent" : best ? `Easiest way: ${best.title}` : "Pick a way that works for you"}
          done={done.apply}
          current={current === "apply"}
          open={shown === "apply"}
          onToggle={() => toggle("apply")}
        >
          {best ? <BestWay way={best} /> : null}

          {others.length ? (
            <>
              <p className="mb-2 mt-4 text-[12.5px] font-extrabold text-muted-foreground">Other ways</p>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))]">
                {others.map((w) => {
                  const Icon = WAY_ICON[w.kind] ?? Globe;
                  return (
                    <div key={w.title} className="flex min-w-0 gap-3 rounded-[18px] border border-line p-3.5">
                      <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-gov-ink" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-extrabold">{w.title}</p>
                        <p className="mt-0.5 text-[12px] leading-[1.55] text-muted-foreground [overflow-wrap:anywhere]">{w.detail}</p>
                        {w.url || w.phone ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {w.url ? (
                              <ExtLink href={w.url} className={btn("ghost", "sm")}>
                                Open
                              </ExtLink>
                            ) : null}
                            {w.phone ? <CallChip phone={w.phone} /> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          <More title="Calling them? Here's what to say" icon={Phone}>
            <div className="rounded-[14px] bg-surface p-3.5 text-[13.5px] leading-[1.7]">
              <div className="mb-1.5 flex items-center justify-between">
                <b className="text-[11px] uppercase tracking-[1.2px] text-muted-foreground">Say this</b>
                <CopyButton text={script} className="bg-surface-2" />
              </div>
              <span className="select-text">{script}</span>
            </div>
            {g.ask_them.length ? (
              <div className="mt-3 rounded-[14px] bg-surface p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <b className="text-[11px] uppercase tracking-[1.2px] text-muted-foreground">Then ask</b>
                  <CopyButton text={g.ask_them.join("\n")} className="bg-surface-2" />
                </div>
                <ol className="grid gap-1.5">
                  {g.ask_them.map((t, i) => (
                    <li key={t} className="flex items-start gap-2.5 text-[13.5px] leading-[1.55]">
                      <span className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-gov text-[11px] font-extrabold text-gov-ink">{i + 1}</span>
                      {t}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {notes.length ? (
              <div className="mt-3">
                <p className="mb-2 text-[12.5px] font-extrabold text-muted-foreground">Also good to check</p>
                <ReasonsList checks={notes} />
              </div>
            ) : null}
          </More>

          <ApplyAssistant program={p} />

          {!app ? (
            <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
              <button type="button" className={btn("primary")} onClick={() => changeStage("gather")}>
                I&apos;m starting this
              </button>
              <span className="text-[12px] font-bold text-faint">Adds it to your plan on Home.</span>
            </div>
          ) : !done.apply ? (
            <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
              <button type="button" className={btn("primary")} onClick={() => changeStage("applied")}>
                <Check aria-hidden /> I sent my application
              </button>
            </div>
          ) : null}
        </Step>

        {/* 4. Hear back */}
        <Step
          id="track"
          n={4}
          title="Hear back"
          summary={stage === "approved" || stage === "denied" ? STAGE_LABEL[stage] : stage === "applied" ? "Waiting for their answer" : "After you apply"}
          done={done.track}
          current={current === "track"}
          open={shown === "track"}
          last
          onToggle={() => toggle("track")}
        >
          <p className="mb-3 text-[14px] leading-[1.6] text-muted-foreground">
            Where are you with this? Tap one. Saved on this device only
            {app ? `, last updated ${new Date(app.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}.
          </p>
          <div role="group" aria-label="Application stage" className="grid grid-cols-2 gap-2 min-[751px]:grid-cols-4">
            {STAGES.map(([k, t, d]) => (
              <button
                key={k}
                type="button"
                aria-pressed={stage === k}
                onClick={() => changeStage(k)}
                className={cn(
                  "flex flex-col gap-1 rounded-[16px] border p-3 text-left text-[13.5px] font-extrabold transition-colors",
                  stage === k ? "border-gov-ink bg-gov shadow-[inset_0_0_0_1px_var(--gov-ink)]" : "border-line bg-surface hover:border-gov-line",
                )}
              >
                {t}
                <small className="text-[11.5px] font-semibold leading-[1.45] text-muted-foreground">{d}</small>
              </button>
            ))}
          </div>
          {stage === "applied" ? (
            <div className="mt-3.5 rounded-[18px] bg-surface-2 p-4">
              <h3 className="mb-1.5 text-[15px] font-extrabold">While you wait</h3>
              <p className="text-[13px] leading-[1.6] text-muted-foreground">
                Keep your phone on and check your mail. If they ask for more papers, your Documents page shows what you already have.
              </p>
              {g.unlocks.length ? (
                <>
                  <p className="mb-2.5 mt-3 text-[13px] text-muted-foreground">Once it&apos;s approved, these may open up:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.unlocks.map((id) => (
                      <ProgramNode key={id} snapshot={snapshot} id={id} small />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          {stage === "approved" ? (
            <div className="mt-3.5 rounded-[18px] bg-brand-soft p-4">
              <h3 className="mb-1.5 text-[15px] font-extrabold">Approved. Here&apos;s what that can open up.</h3>
              {g.unlocks.length ? (
                <>
                  <p className="mb-2.5 text-[13px] leading-[1.6] text-muted-foreground">These programs list {g.short_name} as a way to qualify.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.unlocks.map((id) => (
                      <ProgramNode key={id} snapshot={snapshot} id={id} small />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[13px] leading-[1.6] text-muted-foreground">Keep your approval letter with your documents. Other programs may ask for it.</p>
              )}
            </div>
          ) : null}
          {stage === "denied" ? (
            <div className="mt-3.5 rounded-[18px] bg-surface-2 p-4">
              <h3 className="mb-1.5 text-[15px] font-extrabold">Turned down. Here&apos;s what to try next.</h3>
              <p className="mb-2.5 text-[13px] leading-[1.6] text-muted-foreground">Ask the agency why, and whether you can appeal or apply again if something changes.</p>
              {g.if_denied.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {g.if_denied.map((id) => (
                    <ProgramNode key={id} snapshot={snapshot} id={id} small />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {app ? (
            <button type="button" className={btn("text", "sm", "mt-2.5")} onClick={() => changeStage(null)}>
              Remove from my plan
            </button>
          ) : null}
        </Step>
      </ol>

      {/* Fine print */}
      <More title="The official rules and sources" icon={FileText} className="mt-6 border border-line bg-surface">
        <p className="mb-3 text-[12px] text-faint">
          Checked {formatDate(p.verified_on)}
          {p.program_period ? ` · ${p.program_period}` : ""}
        </p>
        <SourceRules program={p} />
        {p.contact ? <div className="mt-2.5 select-text rounded-xl bg-surface-2 px-3.5 py-3 text-[12.5px] leading-[1.7] [overflow-wrap:anywhere]">{p.contact}</div> : null}
        <div className="mt-4 flex flex-wrap gap-2.5">
          <ExtLink href={p.info_url} className={btn("ghost", "sm")}>
            Provider page
          </ExtLink>
          {g.source_url !== p.info_url ? (
            <ExtLink href={g.source_url} className={btn("ghost", "sm")}>
              Guide source
            </ExtLink>
          ) : null}
        </div>
      </More>
      <Disclaimer className="mt-4 text-center" />
    </div>
  );
}

/** The recommended way to apply, given the most room. */
function BestWay({ way }: { way: GuideWay }) {
  const Icon = WAY_ICON[way.kind] ?? Globe;
  return (
    <div className="rounded-[20px] border border-gov-line bg-gov p-4 min-[751px]:p-5">
      <div className="flex items-start gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface text-gov-ink">
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {way.best ? <span className="text-[10.5px] font-extrabold uppercase tracking-[1.2px] text-gov-ink">Easiest</span> : null}
          <p className="text-[16px] font-extrabold leading-snug">{way.title}</p>
          <p className="mt-1 text-[13px] leading-[1.6] text-muted-foreground [overflow-wrap:anywhere]">{way.detail}</p>
          {way.url || way.phone ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {way.url ? (
                <ExtLink href={way.url} className={btn("gov")}>
                  Open the application
                </ExtLink>
              ) : null}
              {way.phone ? <CallChip phone={way.phone} className="bg-surface py-2 text-[13px]" /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
