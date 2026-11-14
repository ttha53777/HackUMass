"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, FileText, Lock, Wallet } from "lucide-react";

import { docLabel } from "@/components/od/doc-kinds";
import { btn, Callout, Panel, ProgressBar, Ring } from "@/components/od/ui";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import {
  cardById,
  docsFor,
  openIds,
  readiness,
  shortName,
  statusLabel,
  toneOf,
  walletKinds,
  walletPrograms,
  walletTexts,
  type WalletDoc,
} from "@/lib/derive";
import { cn } from "@/lib/utils";

/**
 * "Renters: copy of lease" -> "Renters". A condition the provider wrote at the start of
 * its own line; shown so people know a paper may not apply to them.
 */
function conditionOf(texts: string[]): string | null {
  for (const t of texts) {
    const m = t.match(/^([A-Z][A-Za-z ]{2,24}):\s/);
    if (m) return m[1];
  }
  return null;
}

function DocCard({ doc }: { doc: WalletDoc }) {
  const { snapshot } = useApp();
  const { plan, toggleDoc } = usePlan();
  if (!snapshot) return null;
  const have = plan.docs.includes(doc.kind);
  const texts = walletTexts(doc);
  const label = docLabel(doc.kind, texts);
  const cond = conditionOf(texts);
  const names = doc.uses.map((u) => {
    const c = cardById(snapshot, u.id);
    return { id: u.id, name: c ? shortName(c.program) : u.id, texts: u.texts };
  });
  const many = names.length > 1;

  return (
    <li className={cn("flex flex-col gap-2.5 rounded-[18px] border p-4 transition-colors", have ? "border-brand-line bg-brand-soft" : "border-line bg-surface")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-[38px] shrink-0 place-items-center rounded-xl", have ? "bg-brand text-on-brand" : "bg-surface-2 text-brand-text")}>
          {have ? <Check aria-hidden className="size-[18px]" /> : <FileText aria-hidden className="size-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-extrabold tracking-[-0.2px]">{label}</h3>
          {cond ? <div className="mt-0.5 text-[11px] font-extrabold text-amber-ink">Only if it applies: {cond.toLowerCase()}</div> : null}
        </div>
        <button
          type="button"
          aria-pressed={have}
          aria-label={`I have: ${label}`}
          onClick={() => toggleDoc(doc.kind)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-xs font-extrabold",
            have ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-brand-text hover:border-brand-line",
          )}
        >
          <span aria-hidden className={cn("grid size-4 place-items-center rounded-[5px] border", have ? "border-on-brand" : "border-line")}>
            {have ? <Check className="size-3" /> : null}
          </span>
          {have ? "Have it" : "I have it"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n) => (
          <span key={n.id} className="rounded-full bg-surface-2 px-2 py-[3px] text-[11px] font-bold text-muted-foreground">
            {n.name}
          </span>
        ))}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-xs font-extrabold text-brand-text">What the provider{many ? "s ask" : " asks"} for</summary>
        {names.map((n) => (
          <div key={n.id} className="mt-2 border-l-[3px] border-line py-0.5 pl-2.5 leading-[1.6] text-muted-foreground">
            <b className="block text-[11.5px] text-ink">{n.name}</b>
            {n.texts.map((t) => (
              <span key={t} className="block">
                {t}
              </span>
            ))}
          </div>
        ))}
      </details>
    </li>
  );
}

export function WalletView() {
  const { snapshot } = useApp();
  const { plan } = usePlan();
  const [pick, setPick] = useState("all");
  if (!snapshot) return null;

  const progs = walletPrograms(snapshot, plan);
  const all = walletKinds(snapshot, plan);
  const got = all.filter((d) => plan.docs.includes(d.kind)).length;
  const filter = progs.some((c) => c.program.id === pick) ? pick : "all";
  const shownCard = filter === "all" ? null : cardById(snapshot, filter);
  const shown: WalletDoc[] = shownCard ? docsFor(shownCard.program).map((d) => ({ kind: d.kind, uses: [{ id: filter, texts: d.texts }] })) : all;
  const todo = shown.filter((d) => !plan.docs.includes(d.kind));
  const ready = shown.filter((d) => plan.docs.includes(d.kind));
  const reuse = all.filter((d) => d.uses.length > 1).length;
  const open = openIds(snapshot);
  // Benefits whose provider doesn't list documents: say so, and point to the guide.
  const unlisted = snapshot.programs.filter(
    (c) => c.program.guide?.no_documents_note && !docsFor(c.program).length && ["fit", "maybe", "later"].includes(toneOf(c)),
  );

  return (
    <>
      <div className="mb-[22px]">
        <span className="inline-flex items-center gap-[7px] rounded-full bg-brand-soft py-[5px] pl-2 pr-[11px] text-[11px] font-extrabold text-brand-text">
          <Wallet aria-hidden className="size-3.5" />
          Your document wallet
        </span>
        <h1 className="my-2 text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.12] tracking-[-1.4px]">Gather each paper once. Use it everywhere.</h1>
        <p className="max-w-[640px] text-[14.5px] leading-[1.7] text-muted-foreground">
          Every document your programs ask for, merged into one list.{" "}
          {reuse ? (
            <>
              <strong className="text-ink">{reuse}</strong> of them {reuse === 1 ? "counts" : "count"} for more than one application.{" "}
            </>
          ) : null}
          Tap the ones you have. Nothing is uploaded: this only tracks what&apos;s in your folder at home, saved on this device.
        </p>
      </div>

      {progs.length ? (
        <>
          <div className="mb-[22px] grid items-start gap-4 min-[861px]:grid-cols-2">
            <Panel>
              <div className="flex items-center gap-3.5">
                <Ring value={got} total={all.length} />
                <div>
                  <b className="text-[15px]">
                    {got} of {all.length} documents ready
                  </b>
                  <p className="mt-[3px] text-xs leading-[1.55] text-muted-foreground">
                    {got === all.length
                      ? "You have everything your programs list."
                      : todo.length && filter === "all"
                        ? `Next to find: ${docLabel(todo[0].kind, walletTexts(todo[0]))}.`
                        : "Pick an application to see just its list."}
                  </p>
                </div>
              </div>
              <div className="mt-3.5 flex items-start gap-2.5 rounded-[14px] bg-amber px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-ink">
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>Never email confidential papers. Upload them only inside an official application, or bring them in person.</span>
              </div>
            </Panel>
            <Panel>
              <div className="mb-2.5 flex items-baseline justify-between gap-2.5">
                <h2 className="text-[15px] font-extrabold">Ready to apply?</h2>
                <span className="text-xs text-faint">By application</span>
              </div>
              <ul className="flex flex-col gap-3">
                {progs.map((c) => {
                  const r = readiness(c.program, plan);
                  return (
                    <li key={c.program.id} className="grid grid-cols-[minmax(0,1fr)_70px_auto] items-center gap-3 text-[12.5px] min-[751px]:grid-cols-[minmax(0,1fr)_110px_auto]">
                      <div className="min-w-0">
                        <b className="block truncate text-[13px]">{shortName(c.program)}</b>
                        <small className="text-[11.5px] text-muted-foreground">
                          {c.program.track === "benefit" ? "Government" : "Local"} · {statusLabel(c, open)}
                        </small>
                      </div>
                      <ProgressBar value={r.got} total={r.total} className="h-[7px]" />
                      <span className={cn("min-w-[34px] text-right text-xs font-extrabold tabular-nums", r.got === r.total ? "text-brand-text" : "text-muted-foreground")}>
                        {r.got}/{r.total}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          <div role="group" aria-label="Show documents for" className="mb-4 flex flex-wrap gap-2">
            {[{ id: "all", name: "All documents" }, ...progs.map((c) => ({ id: c.program.id, name: shortName(c.program) }))].map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setPick(f.id)}
                className={cn(
                  "rounded-full border px-[13px] py-2 text-xs font-extrabold",
                  filter === f.id ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-muted-foreground hover:text-ink",
                )}
              >
                {f.name}
              </button>
            ))}
          </div>

          {todo.length ? (
            <section className="mb-6">
              <h2 className="mb-3 text-lg font-extrabold tracking-[-0.6px]">
                Still to find <span className="text-xs font-medium text-faint">· {todo.length}</span>
              </h2>
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))]">
                {todo.map((d) => (
                  <DocCard key={d.kind} doc={d} />
                ))}
              </ul>
            </section>
          ) : null}
          {ready.length ? (
            <section className="mb-6">
              <h2 className="mb-3 text-lg font-extrabold tracking-[-0.6px]">
                Ready <span className="text-xs font-medium text-faint">· {ready.length}</span>
              </h2>
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))]">
                {ready.map((d) => (
                  <DocCard key={d.kind} doc={d} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <Panel className="mb-[22px] text-[13px] leading-[1.7] text-muted-foreground">
          None of your current programs list documents. Programs that are open to everyone usually need nothing at all.
        </Panel>
      )}

      {unlisted.length ? (
        <Panel>
          <div className="mb-1 flex items-baseline justify-between gap-2.5">
            <h2 className="text-[15px] font-extrabold">Ask about documents on your call</h2>
            <span className="text-xs text-faint">Not listed by the provider</span>
          </div>
          {unlisted.map((c) => (
            <div key={c.program.id} className="flex items-center justify-between gap-2.5 border-t border-line py-2.5 text-[12.5px] first-of-type:border-t-0">
              <div className="min-w-0">
                <strong>{shortName(c.program)}</strong>
                <small className="block text-[11.5px] leading-normal text-muted-foreground">{c.program.guide?.no_documents_note}</small>
              </div>
              <Link href={`/benefits/${c.program.guide!.slug}`} className={btn("link")}>
                Guide <ArrowRight aria-hidden />
              </Link>
            </div>
          ))}
        </Panel>
      ) : null}
      <Callout tone="info">Your checklist is saved on this device only, for this session. Starting over clears it.</Callout>
    </>
  );
}
