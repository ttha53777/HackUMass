"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  AtSign,
  Banknote,
  CalendarDays,
  Check,
  FileText,
  Footprints,
  Globe,
  Landmark,
  Lock,
  Mail,
  MapPin,
  Phone,
  type LucideIcon,
} from "lucide-react";

import { docLabel } from "@/components/od/doc-kinds";
import { btn, CallChip, Callout, CopyButton, Disclaimer, ExtLink, ProgressBar, ReasonsList, Ring, StatusPill } from "@/components/od/ui";
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

import { ProgramNode } from "./benefits-view";

const WAY_ICON: Record<GuideWay["kind"], LucideIcon> = {
  online: Globe,
  phone: Phone,
  in_person: MapPin,
  mail: Mail,
  walk_in: Footprints,
  email: AtSign,
};

function Section({ id, n, title, intro, children }: { id?: string; n: ReactNode; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className="mb-4 scroll-mt-5 rounded-[20px] border border-line bg-surface p-4 min-[751px]:p-[22px]">
      <header className="mb-3.5 flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[11px] bg-gov font-extrabold text-gov-ink">{n}</span>
        <div className="min-w-0">
          <h2 id={id ? `${id}-h` : undefined} className="mb-[3px] mt-0.5 text-lg font-extrabold tracking-[-0.5px]">
            {title}
          </h2>
          <p className="text-[12.5px] leading-[1.6] text-muted-foreground">{intro}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

const H4 = ({ children, first }: { children: ReactNode; first?: boolean }) => (
  <h3 className={cn("mb-2 text-[13px] font-extrabold", !first && "mt-3.5")}>{children}</h3>
);

const STAGES: [AppStage, string, string][] = [
  ["gather", "Getting ready", "Gathering papers"],
  ["applied", "Applied", "Waiting to hear back"],
  ["approved", "Approved", "You got it"],
  ["denied", "Turned down", "See other options"],
];

/** The step-by-step guide for one benefit. Every line comes from the program record or the assessment. */
export function GuideView({ card }: { card: ProgramCard }) {
  const { snapshot } = useApp();
  const { plan, setStage, toggleDoc } = usePlan();
  const { answer } = useAnswer();
  const { openQuestion } = useDrawer();
  const toast = useToast();
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

  const s1 = !asks.length && !tailor.open.length && tone !== "out";
  const s2 = docs.length ? r.got === r.total : true;
  const s3 = stage === "applied" || stage === "approved" || stage === "denied";
  const s5 = stage === "approved" || stage === "denied";
  const steps: [string, string, boolean, number][] = [
    ["g-check", "Check if you may qualify", s1, asks.length + tailor.open.length],
    ["g-docs", "Gather your documents", s2, docs.length - r.got],
    ["g-apply", "Apply", s3, 0],
    ["g-ask", "Questions to ask them", s3, 0],
    ["g-track", "Track the decision", s5, 0],
  ];

  const name = typeof window === "undefined" ? "" : readName();
  const zip = answerFor(snapshot, "zip")?.display_value;
  const size = answerFor(snapshot, "household_size")?.display_value;
  const shutoff = answerIncludes(answerFor(snapshot, "utility_issues"), ["shutoff"]);
  const script = `Hi, my name is ${name || "[your name]"}. I live in ${zip ? `ZIP ${zip}` : "[your town]"}${
    size ? ` with a household of ${size}` : ""
  }. I'd like to apply for ${g.short_name}${shutoff ? ", and I have a shut-off notice" : ""}. Can you tell me what I should have ready, and what happens after I apply?`;
  const ways = [...g.ways].sort((a, b) => Number(b.best) - Number(a.best));

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

  return (
    <div className="grid items-start gap-7 min-[1101px]:grid-cols-[230px_minmax(0,1fr)]">
      <nav aria-label="Guide steps" className="flex flex-col gap-1 min-[1101px]:sticky min-[1101px]:top-5">
        <Link href="/benefits" className="mb-3 inline-flex items-center gap-1.5 py-1 text-xs font-extrabold text-muted-foreground hover:text-ink">
          <ArrowLeft aria-hidden className="size-3.5" />
          All government benefits
        </Link>
        <div className="hidden flex-col gap-1 min-[1101px]:flex">
          {steps.map(([id, t, ok, n], i) => (
            <a key={id} href={`#${id}`} className="flex items-center gap-2.5 rounded-xl p-2.5 text-[13px] font-bold text-muted-foreground hover:bg-surface-2 hover:text-ink">
              <span
                className={cn(
                  "grid size-[26px] shrink-0 place-items-center rounded-[9px] text-xs font-extrabold",
                  ok ? "bg-brand text-on-brand" : n ? "bg-amber text-amber-ink" : "bg-surface-2 text-muted-foreground",
                )}
              >
                {ok ? <Check aria-label="done" className="size-3.5" /> : i + 1}
              </span>
              {t}
            </a>
          ))}
        </div>
      </nav>

      <div className="min-w-0">
        <header className="mb-[22px] grid items-center gap-[18px] rounded-3xl bg-gov p-[18px] min-[751px]:grid-cols-[minmax(0,1fr)_auto] min-[751px]:p-6">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-[7px] rounded-full bg-surface py-[5px] pl-2 pr-[11px] text-[11px] font-extrabold text-gov-ink">
              <Landmark aria-hidden className="size-3.5" />
              Government benefit · step-by-step guide
            </span>
            <h1 className="mb-1.5 mt-2 text-[clamp(24px,2.8vw,34px)] font-extrabold leading-[1.15] tracking-[-1.2px]">{g.short_name}</h1>
            <p className="max-w-[600px] text-[13.5px] leading-[1.65] text-muted-foreground">{g.what}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                [Landmark, g.decided_by],
                [CalendarDays, g.when],
                [Banknote, g.cost],
              ].map(([Icon, text]) => {
                const I = Icon as LucideIcon;
                return (
                  <span key={text as string} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-[5px] text-[11.5px] font-bold">
                    <I aria-hidden className="size-[13px] shrink-0 text-gov-ink" />
                    {text as string}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 min-[751px]:flex-col min-[751px]:gap-1.5">
            <Ring value={steps.filter((s) => s[2]).length} total={steps.length} />
            <StatusPill tone={statusTone}>{statusText}</StatusPill>
          </div>
        </header>

        <Section id="g-check" n={1} title="Check if you may qualify" intro="We compare your answers with the published rules. This is a possible match, never an official decision.">
          {good.length ? (
            <>
              <H4 first>What fits so far</H4>
              <ReasonsList checks={good} />
            </>
          ) : null}
          {bad.length ? (
            <>
              <H4 first={!good.length}>What may not fit</H4>
              <ReasonsList checks={bad} />
              <Callout tone="info">You can still apply. The agency makes the decision, and the rules here may not cover your whole situation.</Callout>
            </>
          ) : null}
          {pending.length ? (
            <>
              <H4 first={!good.length && !bad.length}>Still to figure out</H4>
              <ReasonsList checks={pending} />
            </>
          ) : null}
          {matched.map((text) => (
            <Callout key={text} tone="ok">
              {text}
            </Callout>
          ))}
          {asks.map((o) => (
            <div key={o.question.id} className="mt-3 rounded-2xl bg-amber p-4">
              <p className="mb-1 text-sm font-extrabold">{o.question.prompt}</p>
              {o.question.reason ? <p className="mb-3 text-xs leading-[1.55] text-muted-foreground">{o.question.reason}</p> : null}
              <QuestionForm question={o.question} surface="tinted" />
            </div>
          ))}
          {tailor.open.length ? (
            <>
              <H4>To tailor your document list</H4>
              {tailor.open.map((o) => (
                <div key={o.question.id} className="mt-3 rounded-2xl bg-surface-2 p-4">
                  <p className="mb-1 text-sm font-extrabold">{o.question.prompt}</p>
                  {o.question.reason ? <p className="mb-3 text-xs leading-[1.55] text-muted-foreground">{o.question.reason}</p> : null}
                  <QuestionForm question={o.question} surface="tinted" tailoring />
                </div>
              ))}
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
                  <button type="button" className={btn("ghost", "sm")} onClick={() => openQuestion(a.question, { tailoring: true })}>
                    Change
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {s1 ? <Callout tone="ok">Nothing else to ask. Move on to your documents.</Callout> : null}
        </Section>

        <Section
          id="g-docs"
          n={2}
          title="Gather your documents"
          intro={
            docs.length
              ? "Built from the provider's list. Tap each one you have. It's saved on this device and counts for every application that needs it."
              : "What the provider says about documents."
          }
        >
          {docs.length ? (
            <>
              <div className="mb-3 grid grid-cols-[minmax(0,1fr)_70px_auto] items-center gap-3 text-[12.5px] min-[751px]:grid-cols-[minmax(0,1fr)_110px_auto]">
                <div>
                  <b className="block text-[13px]">
                    {r.got} of {r.total} ready
                  </b>
                  <small className="text-[11.5px] text-muted-foreground">
                    {r.got === r.total ? "You have everything on the list." : "Bring copies, not originals, unless they ask."}
                  </small>
                </div>
                <ProgressBar value={r.got} total={r.total} className="h-[7px]" />
                <span className={cn("min-w-[34px] text-right text-xs font-extrabold tabular-nums", r.got === r.total ? "text-brand-text" : "text-muted-foreground")}>
                  {r.got}/{r.total}
                </span>
              </div>
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
                {docs.map((d) => {
                  const have = plan.docs.includes(d.kind);
                  return (
                    <li key={d.kind} className={cn("flex flex-col gap-2.5 rounded-[18px] border p-4", have ? "border-brand-line bg-brand-soft" : "border-line bg-surface")}>
                      <div className="flex items-start gap-3">
                        <span className={cn("grid size-[38px] shrink-0 place-items-center rounded-xl", have ? "bg-brand text-on-brand" : "bg-surface-2 text-brand-text")}>
                          {have ? <Check aria-hidden className="size-[18px]" /> : <FileText aria-hidden className="size-[18px]" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[14.5px] font-extrabold tracking-[-0.2px]">{docLabel(d.kind, d.texts)}</h3>
                          {d.texts.map((t) => (
                            <p key={t} className="mt-1 text-xs leading-[1.6] text-muted-foreground">
                              {t}
                            </p>
                          ))}
                        </div>
                      </div>
                      <button type="button" aria-pressed={have} onClick={() => toggleDoc(d.kind)} className={btn(have ? "text" : "ghost", "sm", "self-start")}>
                        {have ? "I have this · undo" : "I have this"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <Callout tone="info" className="mt-0">
              {g.no_documents_note ?? "The provider doesn't list documents. Ask when you contact them."}
            </Callout>
          )}
          {g.safety_note ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-[14px] bg-amber px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-ink">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{g.safety_note}</span>
            </div>
          ) : null}
        </Section>

        <Section id="g-apply" n={3} title="Apply" intro="Pick whichever way is easiest for you. The first one is usually fastest.">
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))]">
            {ways.map((w) => {
              const Icon = WAY_ICON[w.kind] ?? Globe;
              return (
                <div key={w.title} className={cn("flex min-w-0 flex-col gap-2 rounded-2xl border p-[15px]", w.best ? "border-gov-line bg-gov" : "border-line")}>
                  <span className={cn("grid size-[34px] place-items-center rounded-[11px] text-gov-ink", w.best ? "bg-surface" : "bg-surface-2")}>
                    <Icon aria-hidden className="size-[18px]" />
                  </span>
                  {w.best ? <span className="text-[10px] font-extrabold uppercase tracking-[1px] text-gov-ink">Easiest</span> : null}
                  <strong className="text-[13.5px]">{w.title}</strong>
                  <p className="text-xs leading-[1.6] text-muted-foreground [overflow-wrap:anywhere]">{w.detail}</p>
                  {w.url ? (
                    <ExtLink href={w.url} className={btn("gov", "sm", "self-start")}>
                      Open
                    </ExtLink>
                  ) : null}
                  {w.phone ? <CallChip phone={w.phone} className={cn("self-start", w.best && "bg-surface")} /> : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3.5 rounded-[14px] bg-surface-2 px-4 py-3.5 text-[13px] leading-[1.75]">
            <div className="mb-1.5 flex items-center justify-between">
              <b className="text-[11px] uppercase tracking-[1.2px] text-muted-foreground">What to say when you call</b>
              <CopyButton text={script} />
            </div>
            <span className="select-text">{script}</span>
          </div>
          {!app ? (
            <div className="mt-[22px] flex flex-wrap items-center gap-2.5">
              <button type="button" className={btn("gov")} onClick={() => changeStage("gather")}>
                I&apos;m starting this application
              </button>
              <span className="text-[11px] font-bold text-faint">Adds it to your plan on Home.</span>
            </div>
          ) : null}
        </Section>

        <Section id="g-ask" n={4} title="Questions to ask them" intro="The provider's pages don't answer these. Asking up front saves a second call.">
          <ol className="grid gap-2">
            {g.ask_them.map((t, i) => (
              <li key={t} className="flex items-start gap-2.5 text-[13px] leading-[1.55]">
                <span className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-gov text-[11px] font-extrabold text-gov-ink">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          {g.ask_them.length ? (
            <div className="mt-3.5 flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-4 py-3">
              <b className="text-[11px] uppercase tracking-[1.2px] text-muted-foreground">Copy all questions</b>
              <CopyButton text={g.ask_them.join("\n")} />
            </div>
          ) : null}
          {notes.length ? (
            <>
              <H4>Also good to confirm</H4>
              <ReasonsList checks={notes} />
            </>
          ) : null}
        </Section>

        <Section
          id="g-track"
          n={5}
          title="Track the decision"
          intro={`Mark where you are. Saved on this device only.${app ? ` Last updated ${new Date(app.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : ""}`}
        >
          <div role="group" aria-label="Application stage" className="grid grid-cols-2 gap-2 min-[751px]:grid-cols-4">
            {STAGES.map(([k, t, d]) => (
              <button
                key={k}
                type="button"
                aria-pressed={stage === k}
                onClick={() => changeStage(k)}
                className={cn(
                  "flex flex-col gap-1 rounded-[14px] border p-3 text-left text-[13px] font-extrabold",
                  stage === k ? "border-gov-ink bg-gov shadow-[inset_0_0_0_1px_var(--gov-ink)]" : "border-line bg-surface",
                )}
              >
                {t}
                <small className="text-[11.5px] font-semibold leading-[1.45] text-muted-foreground">{d}</small>
              </button>
            ))}
          </div>
          {stage === "applied" ? (
            <div className="mt-3.5 rounded-2xl bg-surface-2 p-4">
              <h3 className="mb-1.5 text-[14.5px] font-extrabold">While you wait</h3>
              <p className="mb-2.5 text-[12.5px] leading-[1.6] text-muted-foreground">
                Keep your phone on and check your mail. If they ask for more papers, your Documents page shows what you already have.
              </p>
              {g.unlocks.length ? (
                <>
                  <p className="mb-2.5 text-[12.5px] text-muted-foreground">Once it&apos;s approved, these may open up:</p>
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
            <div className="mt-3.5 rounded-2xl bg-brand-soft p-4">
              <h3 className="mb-1.5 text-[14.5px] font-extrabold">Approved. Here&apos;s what that can open up.</h3>
              {g.unlocks.length ? (
                <>
                  <p className="mb-2.5 text-[12.5px] leading-[1.6] text-muted-foreground">These programs list {g.short_name} as a way to qualify.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.unlocks.map((id) => (
                      <ProgramNode key={id} snapshot={snapshot} id={id} small />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[12.5px] leading-[1.6] text-muted-foreground">Keep your approval letter with your documents. Other programs may ask for it.</p>
              )}
            </div>
          ) : null}
          {stage === "denied" ? (
            <div className="mt-3.5 rounded-2xl bg-surface-2 p-4">
              <h3 className="mb-1.5 text-[14.5px] font-extrabold">Turned down. Here&apos;s what to try next.</h3>
              <p className="mb-2.5 text-[12.5px] leading-[1.6] text-muted-foreground">
                Ask the agency why, and whether you can appeal or apply again if something changes.
              </p>
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
        </Section>

        <Section n={<FileText aria-hidden className="size-4" />} title="The rules, from the source" intro={`Verified ${formatDate(p.verified_on)}${p.program_period ? ` · ${p.program_period}` : ""}.`}>
          <SourceRules program={p} />
          {p.contact ? <div className="mt-2.5 select-text rounded-xl bg-surface-2 px-3.5 py-3 text-[12.5px] leading-[1.7] [overflow-wrap:anywhere]">{p.contact}</div> : null}
          <div className="mt-[22px] flex flex-wrap gap-2.5">
            <ExtLink href={p.info_url} className={btn("ghost", "sm")}>
              Provider page
            </ExtLink>
            {g.source_url !== p.info_url ? (
              <ExtLink href={g.source_url} className={btn("ghost", "sm")}>
                Guide source
              </ExtLink>
            ) : null}
          </div>
        </Section>
        <Disclaimer />
      </div>
    </div>
  );
}
