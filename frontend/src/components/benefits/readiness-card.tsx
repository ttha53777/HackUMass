"use client";

// Archived: not used by the live app (not routed). The live UI is components/hub/; see app/(opendoor)/_archive/legacy-dashboard/README.md.
import { AlertTriangle, Check, IdCard, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { DETAIL_LABEL, useDetails } from "@/components/documents/details-store";
import { QuestionForm } from "@/components/program/question-form";
import { useApp } from "@/components/session/session-provider";
import { getReadiness, isApiError } from "@/lib/api";
import type { ReadinessOut } from "@/lib/types";

/** Fill-sheet key -> label (backend execution/fields.CATALOGUE). */
const KEY_LABEL: Record<string, string> = {
  ...DETAIL_LABEL,
  household_size: "Household size",
  monthly_income: "Monthly income",
};
const label = (key: string) => KEY_LABEL[key] ?? key.replace(/_/g, " ");
const names = (keys: string[]) => keys.map(label).join(", ");

export type ReadyState = {
  /** Confirmed device details this form asks for, to send with the start. */
  details: Record<string, string>;
  /** A detail this form needs is disputed: the start would be refused. */
  blocked: boolean;
};

/**
 * "Before we start": what this program's form needs and where each answer will
 * come from, so the fill-in runs with everything known up front. Readiness is
 * keys only; values for "My details" are read from this device here and sent
 * with the start for that run only.
 */
export function ReadinessCard({ programId, onChange }: { programId: string; onChange: (state: ReadyState) => void }) {
  const { snapshot } = useApp();
  const sessionId = snapshot?.session_id ?? null;
  const { details } = useDetails(sessionId);
  const [ready, setReady] = useState<ReadinessOut | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  // Re-check whenever the session changes (a settled conflict, a confirmed paper).
  const version = snapshot?.trace.at(-1)?.seq ?? 0;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    getReadiness(sessionId, programId)
      .then((r) => {
        if (cancelled) return;
        setReady(r);
        setUnavailable(false);
      })
      .catch((e) => {
        if (!cancelled) setUnavailable(!isApiError(e, "session_not_found"));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, programId, version]);

  const device = useMemo(() => {
    const confirmed = new Map(details.filter((d) => d.confirmed).map((d) => [d.key as string, d.value]));
    const have = (ready?.from_device_needed ?? []).filter((k) => confirmed.has(k));
    const missing = (ready?.from_device_needed ?? []).filter((k) => !confirmed.has(k));
    return { have, missing, values: Object.fromEntries(have.map((k) => [k, confirmed.get(k)!])) };
  }, [details, ready]);

  const blocked = (ready?.blocked_by.length ?? 0) > 0;
  const detailKey = JSON.stringify(device.values);
  useEffect(() => {
    onChange({ details: device.values, blocked });
    // detailKey stands for device.values' contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailKey, blocked, onChange]);

  if (unavailable) return null;
  if (!ready) return <p className="mb-3 text-[12.5px] text-muted-foreground">Checking what this form needs…</p>;
  const nothingKnown = ![...ready.from_profile, ...ready.from_device_needed, ...ready.will_ask, ...ready.unconfirmed].length;
  if (nothingKnown) return null; // this form's fields aren't recorded yet

  const ask = [...device.missing, ...ready.will_ask, ...ready.unconfirmed];
  // The question that settles it: usually the pending one; else an open follow-up.
  const settles = (id: string) => ready.blocked_by.some((f) => id === `confirm_${f}`);
  const pendingQ = snapshot?.pending_question;
  const settle =
    (pendingQ && settles(pendingQ.id) ? pendingQ : null) ?? snapshot?.open_questions.find((o) => settles(o.question.id))?.question;

  return (
    <section aria-label="Before we start" className="mb-3 rounded-[14px] border border-gov-line bg-surface p-3.5">
      <h4 className="mb-2 text-[13.5px] font-extrabold">Before we start</h4>
      <ul className="grid gap-1.5 text-[12.5px] leading-[1.5]">
        {ready.from_profile.length ? (
          <Row icon={<Check aria-hidden className="size-4 text-brand-text" />} title="From your answers">
            {names(ready.from_profile)}
          </Row>
        ) : null}
        {device.have.length ? (
          <Row icon={<IdCard aria-hidden className="size-4 text-brand-text" />} title="From My details, on this device">
            {names(device.have)}
          </Row>
        ) : null}
        {ask.length ? (
          <Row icon={<MessageCircleQuestion aria-hidden className="size-4 text-gov-ink" />} title="We'll ask you as we go">
            {names(ask)}
            {device.missing.some((k) => k in DETAIL_LABEL) ? (
              <>
                {" "}
                <Link href="/documents" className="font-bold text-brand-text underline">
                  Add papers to fill these in
                </Link>
              </>
            ) : null}
          </Row>
        ) : null}
      </ul>
      {blocked ? (
        <div role="alert" className="mt-3 rounded-[12px] bg-amber p-3 text-amber-ink">
          <p className="flex items-start gap-2 text-[12.5px] font-bold">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {names(ready.blocked_by)} doesn&apos;t match yet. Settle it first so the form gets the right answer.
          </p>
          {settle ? (
            <div className="mt-2.5">
              <p className="mb-1.5 text-[12.5px]">{settle.prompt}</p>
              <QuestionForm key={settle.id + settle.prompt} question={settle} surface="tinted" />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Row({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <strong className="block">{title}</strong>
        <span className="text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}
