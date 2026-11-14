"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check, FileText } from "lucide-react";

import { docLabel } from "@/components/od/doc-kinds";
import { btn, CallChip, Disclaimer, ExtLink, KindTag, ReasonsList, StatusPill } from "@/components/od/ui";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { asksFor, checksOf, docsFor, openIds, phoneOf, readiness, statusLabel, stepOf, toneOf } from "@/lib/derive";
import { formatDate } from "@/lib/format";
import type { ProgramCard } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ApplyAssistant } from "@/components/benefits/apply-assistant";

import { HowWeChecked } from "./how-we-checked";
import { QuestionForm } from "./question-form";
import { SourceRules } from "./source-rules";

function Sec({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-line py-[18px] last:border-b-0 [&_p]:text-[13px] [&_p]:leading-[1.75] [&_p]:text-muted-foreground">
      {title ? (
        <h3 className="mb-[9px] font-display text-sm font-extrabold tracking-[-0.2px]">
          {title}
          {aside ? <span className="ml-1.5 font-sans text-xs font-semibold text-muted-foreground">{aside}</span> : null}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

/** Everything about one program: status, reasons, next step, contact, documents and sourced rules. */
export function ProgramDetail({ card }: { card: ProgramCard }) {
  const { snapshot } = useApp();
  const { plan } = usePlan();
  if (!snapshot) return null;
  const { program: p } = card;
  const open = openIds(snapshot);
  const tone = toneOf(card);
  const good = checksOf(card, "pass", "have");
  const pending = checksOf(card, "ask", "unsure", "later");
  const bad = checksOf(card, "fail");
  const notes = checksOf(card, "note");
  const firstAsk = asksFor(card, open)[0];
  const question = snapshot.open_questions.find((o) => o.question.id === firstAsk)?.question;
  const step = stepOf(p);
  const docs = docsFor(p);
  const ready = readiness(p, plan);

  return (
    <div>
      <Sec>
        <div className="flex flex-wrap items-center gap-2">
          <KindTag track={p.track} long />
          <StatusPill tone={tone}>{statusLabel(card, open)}</StatusPill>
        </div>
        <p className="mt-2.5">{p.description}</p>
      </Sec>

      {p.guide ? (
        <Sec>
          <Link href={`/benefits/${p.guide.slug}`} className={btn("gov", "md", "w-full")}>
            Open the step-by-step application guide <ArrowRight aria-hidden />
          </Link>
        </Sec>
      ) : null}

      {good.length ? (
        <Sec title="Why it may fit">
          <ReasonsList checks={good} />
        </Sec>
      ) : null}

      {pending.length ? (
        <Sec title="Still to figure out">
          <ReasonsList checks={pending} />
          {question ? (
            <div className="mt-3 rounded-[14px] bg-amber p-3.5">
              <p className="mb-2.5 !text-[13px] font-extrabold !text-ink">{question.prompt}</p>
              <QuestionForm question={question} surface="tinted" />
            </div>
          ) : null}
        </Sec>
      ) : null}

      {bad.length ? (
        <Sec title="Why it may not fit">
          <ReasonsList checks={bad} />
          <p className="mt-2 !text-xs">You can still contact them. The provider decides, and these rules may not cover your whole situation.</p>
        </Sec>
      ) : null}

      <Sec title="Next step">
        <p>
          <strong className="text-ink">{step.title}.</strong> {step.detail}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <CallChip phone={phoneOf(p.contact)} />
          {p.apply_url ? (
            <ExtLink href={p.apply_url} className={btn("primary", "sm")}>
              Apply
            </ExtLink>
          ) : null}
          <ExtLink href={p.info_url} className={btn("ghost", "sm")}>
            Provider page
          </ExtLink>
        </div>
        {/* Benefits with a guide show the assistant on the guide page instead. */}
        {!p.guide ? <ApplyAssistant program={p} /> : null}
      </Sec>

      {p.hours?.length ? (
        <Sec title="Open hours">
          <ul className="grid gap-1.5 text-[13px]">
            {p.hours.map((h, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span>{h.label}</span>
                <span className="font-bold tabular-nums">{h.time}</span>
              </li>
            ))}
          </ul>
        </Sec>
      ) : null}

      {p.contact ? (
        <Sec title="Contact">
          <div className="select-text rounded-xl bg-surface-2 px-3.5 py-3 text-[12.5px] leading-[1.7] [overflow-wrap:anywhere]">{p.contact}</div>
        </Sec>
      ) : null}

      {docs.length ? (
        <Sec title="Documents to bring" aside={`· ${ready.got} of ${ready.total} ready`}>
          <ul className="grid gap-[7px]">
            {docs.map((d) => {
              const have = plan.docs.includes(d.kind);
              const Icon = have ? Check : FileText;
              return (
                <li key={d.kind} className="flex gap-[9px] text-[13px] leading-[1.55]">
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", have ? "text-brand-text" : "text-sky-ink")} />
                  <span>
                    {docLabel(d.kind, d.texts)}
                    {have ? <span className="sr-only"> (you have this)</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Sec>
      ) : p.documents_needed === null ? (
        <Sec title="Documents to bring">
          <p>The provider doesn&apos;t list documents. Ask when you contact them.</p>
        </Sec>
      ) : null}

      {notes.length || p.unknowns.length ? (
        <Sec title="Confirm with the provider">
          <ReasonsList checks={[...notes, ...p.unknowns.slice(0, 3).map((text) => ({ kind: "note" as const, text }))]} />
        </Sec>
      ) : null}

      <Sec>
        <HowWeChecked snapshot={snapshot} card={card} />
      </Sec>

      <Sec title="The rules, from the source">
        <SourceRules program={p} />
      </Sec>

      <p className="pt-3 text-[11px] leading-[1.7] text-faint">
        Verified {formatDate(p.verified_on)}
        {p.program_period ? ` · ${p.program_period}` : ""}.
      </p>
      <Disclaimer />
    </div>
  );
}
