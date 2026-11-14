"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarClock, Check, FileText, Landmark, Link2Off, PiggyBank, Receipt, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import { chosenNeedIds } from "@/components/chat/script";
import { btn, CatIcon, Panel, SectionHead } from "@/components/od/ui";
import { PageHead } from "@/components/shell/page-head";
import { useToast } from "@/components/shell/toast";
import { useApp } from "@/components/session/session-provider";
import { isLive } from "@/lib/derive";
import type { BankSuggestion, BillLine, ProgramCard } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ConnectBankModal } from "./connect-modal";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const BILL_CAT: Record<BillLine["category"], string> = {
  rent: "housing",
  utilities: "utilities",
  phone_internet: "phone_internet",
  other: "other",
};

const SPEND_LABEL = { groceries: "Groceries", transport: "Getting around", household: "Household", other: "Everything else" };

/** Help that can lower a monthly cost, by the categories it shares with a bill or spending line. */
const COST_CATEGORIES = ["food", "utilities", "housing", "phone_internet", "transportation"];

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function programHref(card: ProgramCard) {
  return card.program.track === "benefit" && card.program.guide ? `/benefits/${card.program.guide.slug}` : "/local";
}

/**
 * "Your money": what a connected sandbox bank shows, and what it can help with.
 * Every figure is a simulated monthly average; nothing here is used until confirmed.
 */
export function MoneyView() {
  const { snapshot, submit, whenIdle, working, disconnectBank } = useApp();
  const toast = useToast();
  const [connectOpen, setConnectOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (!snapshot) return null;
  const summary = snapshot.financial_summary;

  const confirm = async (s: BankSuggestion) => {
    setBusyId(s.question_id);
    await whenIdle();
    const ok = await submit(s.answer);
    await whenIdle();
    setBusyId(null);
    toast(ok ? `Saved: ${s.shown}. Your results are updated.` : "That didn't go through. Try again?");
  };

  const disconnect = async () => {
    await whenIdle();
    const problem = await disconnectBank();
    await whenIdle();
    toast(problem ?? "Disconnected. What the bank showed has been removed.");
  };

  const addTaxHelp = async () => {
    await whenIdle();
    const ok = await submit({ question_id: "needs", selected_option_ids: [...chosenNeedIds(snapshot), "taxes"] });
    await whenIdle();
    toast(ok ? "Free tax help added to your plan." : "That didn't go through. Try again?");
  };

  if (!summary) {
    return (
      <>
        <PageHead title="Your money">Connect a bank to see it in one place.</PageHead>
        <Panel className="flex flex-col items-start gap-4 p-6">
          <span className="grid size-12 place-items-center rounded-[15px] bg-brand-soft text-brand-text">
            <PiggyBank aria-hidden className="size-6" />
          </span>
          <div>
            <h2 className="font-display text-[22px] font-extrabold tracking-[-0.03em]">See your money, and what could help</h2>
            <p className="mt-1.5 max-w-[560px] text-[14px] leading-relaxed text-muted-foreground">
              Connect a bank account and OpenDoor reads your monthly totals to suggest answers, fill in income on forms with
              you, get you ready for free tax help, and show a simple budget. This demo uses fictional sandbox accounts only.
            </p>
          </div>
          <div className="grid w-full gap-2.5 min-[620px]:grid-cols-2">
            {[
              [Sparkles, "Programs you may qualify for", "Answers your bank points to, for you to confirm"],
              [FileText, "Forms, filled in with you", "Your confirmed income goes onto applications"],
              [Receipt, "Tax time, ready", "What to bring, and where to file for free"],
              [CalendarClock, "A simple budget", "Money in, bills, and what lowers your costs"],
            ].map(([Icon, title, sub]) => {
              const I = Icon as typeof Sparkles;
              return (
                <div key={title as string} className="flex items-start gap-3 rounded-[14px] bg-surface-2 p-3.5">
                  <I aria-hidden className="mt-0.5 size-[18px] shrink-0 text-brand-text" />
                  <span className="text-[13px]">
                    <strong className="block">{title as string}</strong>
                    <span className="text-muted-foreground">{sub as string}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <button type="button" className={btn("primary")} onClick={() => setConnectOpen(true)}>
            <Landmark aria-hidden className="size-4" /> Connect a bank account
          </button>
        </Panel>
        <ConnectBankModal open={connectOpen} onClose={() => setConnectOpen(false)} />
      </>
    );
  }

  const inflow = summary.avg_monthly_deposits;
  const outflow = summary.avg_monthly_outflow ?? 0;
  const gap = inflow - outflow;
  const live = snapshot.programs.filter(isLive);
  const costHelp = live.filter((c) => c.program.categories.some((cat) => COST_CATEGORIES.includes(cat)) && c.program.categories[0] !== "healthcare").slice(0, 6);
  const taxHelp = live.filter((c) => c.program.categories.includes("taxes"));
  const kinds = new Set(summary.income_sources.map((s) => s.kind));
  const maxSpend = Math.max(1, ...summary.spending.map((s) => s.avg_monthly));

  return (
    <>
      <PageHead title="Your money">Monthly averages from your connected demo bank.</PageHead>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 rounded-full bg-lav px-3 py-1.5 text-[12px] font-bold text-lav-ink">
          Simulated · Capital One Nessie sandbox · {summary.period_start} to {summary.period_end}
        </p>
        <button type="button" className={btn("ghost", "sm")} disabled={working} onClick={() => void disconnect()}>
          <Link2Off aria-hidden className="size-4" /> Disconnect
        </button>
      </div>

      {/* At a glance */}
      <section aria-label="At a glance" className="mb-[30px] grid gap-3 min-[700px]:grid-cols-3">
        <Glance icon={TrendingUp} label="Comes in" value={money(inflow)} sub="a month, on average" />
        <Glance icon={TrendingDown} label="Goes out" value={money(outflow)} sub="bills and spending" />
        <Glance
          icon={PiggyBank}
          label={gap >= 0 ? "Left over" : "Short by"}
          value={money(Math.abs(gap))}
          sub={gap >= 0 ? "a month" : "a month, so help with costs matters"}
          tone={gap >= 0 ? "ok" : "warn"}
        />
      </section>

      {/* Suggestions */}
      {snapshot.bank_suggestions.length ? (
        <section className="mb-[30px]">
          <SectionHead title="Your bank points to these answers" sub="Confirm to use them" />
          <div className="flex flex-col gap-2.5">
            {snapshot.bank_suggestions.map((s) => {
              const q = snapshot.open_questions.find((o) => o.question.id === s.question_id)?.question;
              return (
                <Panel key={s.question_id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-faint">{q?.prompt ?? "Question"}</p>
                    <p className="text-[15px] font-extrabold">{s.shown}</p>
                    <p className="text-[12.5px] text-muted-foreground">{s.reason}</p>
                  </div>
                  <button type="button" className={btn("primary", "sm")} disabled={working || busyId !== null} onClick={() => void confirm(s)}>
                    <Check aria-hidden className="size-4" /> {busyId === s.question_id ? "Saving…" : "That's right"}
                  </button>
                </Panel>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-[30px] min-[900px]:grid-cols-2">
        {/* Bills */}
        <section>
          <SectionHead title="Bills" sub="Each month" />
          <Panel className="p-0">
            <ul>
              {summary.bills.map((b) => (
                <li key={b.payee} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <CatIcon category={BILL_CAT[b.category]} className="size-9 rounded-[11px] [&_svg]:size-[18px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold">{b.payee}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {money(b.avg_monthly)} a month{b.day_of_month ? ` · around the ${ordinal(b.day_of_month)}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-extrabold",
                      b.status === "overdue" ? "bg-amber text-amber-ink" : b.status === "pending" ? "bg-sky text-sky-ink" : "bg-leaf text-leaf-ink",
                    )}
                  >
                    {b.status === "overdue" ? "Unpaid" : b.status === "pending" ? "Coming up" : "Paid"}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        {/* Income and spending */}
        <section>
          <SectionHead title="Coming in and going out" sub="Monthly averages" />
          <Panel className="flex flex-col gap-4">
            <div>
              {summary.income_sources.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-2 py-1 text-[14px]">
                  <span className="font-bold">{s.label}</span>
                  <span className="tabular-nums">{money(s.avg_monthly)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-line pt-3">
              {summary.spending.map((s) => (
                <div key={s.category} className="py-1.5">
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span>{SPEND_LABEL[s.category]}</span>
                    <span className="tabular-nums text-muted-foreground">{money(s.avg_monthly)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(s.avg_monthly / maxSpend) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      </div>

      {/* Help that lowers costs */}
      {costHelp.length ? (
        <section className="mt-[30px]">
          <SectionHead title="Help that lowers your costs" sub="From your plan" />
          <div className="grid gap-2.5 min-[620px]:grid-cols-2">
            {costHelp.map((c) => (
              <Link key={c.program.id} href={programHref(c)} className="group flex items-center gap-3 rounded-[16px] border border-line bg-surface p-3.5 hover:border-brand-line">
                <CatIcon category={c.program.categories[0]} className="size-9 rounded-[11px] [&_svg]:size-[18px]" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[13.5px]">{c.program.guide?.short_name ?? c.program.name}</strong>
                  <span className="block truncate text-[12px] text-muted-foreground">{c.program.provider}</span>
                </span>
                <ArrowRight aria-hidden className="size-4 text-brand-text transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Tax time */}
      <section className="mt-[30px]">
        <SectionHead title="Tax time" sub="Get ready for free help" />
        <Panel className="grid gap-5 min-[760px]:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] font-extrabold">What to bring, based on your money coming in</p>
            <ul className="flex flex-col gap-1.5 text-[13.5px]">
              {kinds.has("wages") ? <Li>Pay records from each job you had this year</Li> : null}
              {kinds.has("benefit") ? <Li>The yearly statement for each benefit you got</Li> : null}
              <Li>A photo ID, and the Social Security card or tax ID number for each person on the return</Li>
              <Li>Last year&apos;s return, if you have it</Li>
            </ul>
            <p className="mt-3 text-[11.5px] text-faint">Free tax sites post their own full list; check it before you go.</p>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-extrabold">Free tax help near you</p>
            {taxHelp.length ? (
              <ul className="flex flex-col gap-2">
                {taxHelp.map((c) => (
                  <li key={c.program.id}>
                    <Link href={programHref(c)} className="text-[13.5px] font-bold text-brand-text hover:underline">
                      {c.program.name}
                    </Link>
                    <span className="block text-[12px] text-muted-foreground">{c.program.first_step?.detail ?? c.program.provider}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-muted-foreground">Free tax help isn&apos;t on your plan yet.</p>
                <button type="button" className={btn("ghost", "sm")} disabled={working} onClick={() => void addTaxHelp()}>
                  <Receipt aria-hidden className="size-4" /> Add free tax help
                </button>
              </>
            )}
          </div>
        </Panel>
      </section>

      <ul className="mt-6 flex flex-col gap-1 text-[11.5px] text-faint">
        {summary.caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
        <li>Budget figures describe the demo account. They are not financial advice.</li>
      </ul>
    </>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check aria-hidden className="mt-1 size-3.5 shrink-0 text-brand-text" />
      <span>{children}</span>
    </li>
  );
}

function Glance({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className={cn("rounded-[18px] border border-line bg-surface p-4", tone === "warn" && "border-amber-ink/25 bg-amber", tone === "ok" && "bg-leaf")}>
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
        <Icon aria-hidden className="size-3.5" /> {label}
      </p>
      <p className="mt-1 font-display text-[28px] font-extrabold tabular-nums tracking-[-0.04em]">{value}</p>
      <p className="text-[12px] text-muted-foreground">{sub}</p>
    </div>
  );
}
