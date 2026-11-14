"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Baby, Bus, Flame, House, Info, Minus, Sparkles, Stethoscope, Utensils, UserRound, type LucideIcon } from "lucide-react";

import type { SessionSnapshot } from "@/lib/types";
import { isLive } from "@/lib/derive";

import { OptionButton } from "./option-button";

export const NEED_ICON: Record<string, LucideIcon> = {
  food: Utensils,
  utilities: Flame,
  housing: House,
  healthcare: Stethoscope,
  transportation: Bus,
};

// Option ids mirror the backend's household_who question (a contract, see types.ts).
const WHO: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "60", label: "Someone 60 or older", icon: UserRound },
  { id: "55", label: "Someone 55 to 59", icon: UserRound },
  { id: "child", label: "A child under 5, or someone pregnant", icon: Baby },
  { id: "none", label: "None of these", icon: Minus },
];

const NEEDS = [
  ["food", "Food & groceries"],
  ["utilities", "Heat & utility bills"],
  ["housing", "Rent or a place to stay"],
  ["healthcare", "Medical care"],
  ["transportation", "Getting around"],
] as const;

const STEP_TITLES = ["Your needs", "Your area", "Your household"];

const WHY = [
  "This decides which programs show up first. You can add more later.",
  "Many programs only serve certain towns or counties. Your ZIP settles that for most of them.",
  "Income limits depend on household size, and some programs are for older adults or young children.",
];

export function Intake({
  step,
  name,
  snapshot,
  working,
  notice,
  onBack,
  onNeeds,
  onZip,
  onHousehold,
}: {
  step: 0 | 1 | 2;
  name: string;
  snapshot: SessionSnapshot | null;
  working: boolean;
  notice: string | null;
  onBack: () => void;
  onNeeds: (ids: string[]) => void;
  onZip: (zip: string) => void;
  onHousehold: (n: number, who: string[]) => void;
}) {
  const answered = (id: string) => snapshot?.profile_summary.find((p) => p.field === id)?.display_value;
  const [needs, setNeeds] = useState<string[]>([]);
  const [zip, setZip] = useState("");
  const [n, setN] = useState(1);
  const [who, setWho] = useState<string[]>([]);

  // Each step replaces the question in place. Move focus so it is announced: to the
  // ZIP field on the ZIP step (labelled by the question), otherwise to the question.
  const heading = useRef<HTMLHeadingElement>(null);
  const zipField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (step === 1 ? zipField.current : heading.current)?.focus();
  }, [step]);

  const title =
    step === 0
      ? name
        ? `Nice to meet you, ${name}. What could use some support right now?`
        : "What could use some support right now?"
      : step === 1
        ? "What ZIP code do you live in?"
        : "Who lives with you?";
  const desc =
    step === 0
      ? "Pick everything that applies. You don't need to know which programs exist."
      : step === 1
        ? "Most programs here serve Amherst and nearby towns in Hampshire and Franklin Counties."
        : "Count everyone you share food or bills with, including you.";

  const inView = snapshot ? snapshot.programs.filter((c) => !c.assessment || isLive(c) || c.assessment.status === "already_receiving").length : 0;
  const total = snapshot?.programs.length ?? 0;

  const rows: [string, string | undefined][] = [
    ["Language", "English"],
    ...(name ? ([["Name", name]] as [string, string][]) : []),
    ...(step > 0 ? ([["Needs", answered("needs")]] as [string, string | undefined][]) : []),
    ...(step > 1 ? ([["ZIP code", answered("zip")]] as [string, string | undefined][]) : []),
  ];

  const toggle = (list: string[], set: (v: string[]) => void, id: string, exclusive?: string) => {
    if (exclusive && id === exclusive) return set(list.includes(id) ? [] : [id]);
    const base = exclusive ? list.filter((x) => x !== exclusive) : list;
    set(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  return (
    <section className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface px-4 py-[18px]">
        <div className="mx-auto flex w-[min(1080px,100%)] items-center justify-between gap-3">
          <span className="font-display text-xl font-extrabold tracking-[-0.05em]">
            Open<b className="text-brand">Door</b>
          </span>
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <span>Question {step + 1} of 3</span>
            {[0, 1, 2].map((i) => (
              <i key={i} aria-hidden className={`inline-block h-[5px] w-[18px] rounded-full min-[751px]:w-7 ${i <= step ? "bg-brand" : "bg-line"}`} />
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-[min(1080px,100%)] flex-1 items-start gap-[18px] px-4 pb-[70px] pt-6 min-[861px]:grid-cols-[minmax(0,1fr)_290px] min-[861px]:gap-12 min-[861px]:pt-11">
        <div className="rounded-[22px] border border-line bg-surface p-[22px] shadow-card min-[751px]:px-[30px] min-[751px]:pb-[26px] min-[751px]:pt-[30px]">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid size-[30px] place-items-center rounded-[10px] bg-brand text-on-brand">
              <Sparkles aria-hidden className="size-4" />
            </span>
            <strong className="text-[13px]">Your navigator</strong>
            <small className="ml-auto text-[11px] font-bold uppercase tracking-[1.4px] text-faint">{STEP_TITLES[step]}</small>
          </div>
          <h1 id="intake-question" ref={heading} tabIndex={-1} className="mb-2.5 font-display outline-none text-[clamp(26px,3.2vw,38px)] font-extrabold leading-[1.18] tracking-[-0.045em]">{title}</h1>
          <p className="mb-5 max-w-[560px] text-[15px] leading-[1.75] text-muted-foreground">{desc}</p>
          <div className="mb-5 flex items-start gap-2 rounded-xl bg-surface-2 px-3.5 py-[11px] text-xs leading-relaxed text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-[15px] shrink-0 text-brand-text" />
            <span>{WHY[step]}</span>
          </div>

          {notice ? (
            <p role="alert" className="mb-4 rounded-xl bg-amber px-3.5 py-3 text-[13px] leading-relaxed text-amber-ink">
              {notice}
            </p>
          ) : null}

          {step === 0 ? (
            <>
              <div role="group" aria-label="Your needs" className="grid gap-2.5 min-[751px]:grid-cols-2">
                {NEEDS.map(([id, label]) => (
                  <OptionButton key={id} icon={NEED_ICON[id]} label={label} pressed={needs.includes(id)} onClick={() => toggle(needs, setNeeds, id)} />
                ))}
              </div>
              <Actions disabled={working || needs.length === 0} onBack={onBack} onNext={() => onNeeds(needs)} label="Continue" />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <input
                id="zip"
                ref={zipField}
                aria-labelledby="intake-question"
                aria-describedby="zip-hint"
                value={zip}
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                placeholder="01002"
                onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && /^\d{5}$/.test(zip) && !working && onZip(zip)}
                className="w-full rounded-[14px] border border-line bg-surface px-[18px] py-4 text-[19px] outline-none focus:border-brand"
              />
              <Actions disabled={working || !/^\d{5}$/.test(zip)} onBack={onBack} onNext={() => onZip(zip)} label="Continue" />
              <p id="zip-hint" className="mt-3 text-xs text-faint">Five digits. Try 01002 for Amherst.</p>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="mb-2.5 text-[13px] font-extrabold">How many people, including you?</p>
              <div className="mb-[22px] flex items-center gap-3.5">
                <button type="button" aria-label="One fewer" onClick={() => setN(Math.max(1, n - 1))} className="size-[46px] rounded-[14px] border border-line bg-surface text-[22px] font-bold text-brand-text hover:border-brand-line">
                  −
                </button>
                <output aria-live="polite" className="min-w-16 text-center font-display text-[40px] font-extrabold tabular-nums tracking-[-0.04em]">
                  {n}
                  {n >= 8 ? "+" : ""}
                </output>
                <span className="font-semibold text-muted-foreground">{n === 1 ? "person" : "people"}</span>
                <button type="button" aria-label="One more" onClick={() => setN(Math.min(8, n + 1))} className="size-[46px] rounded-[14px] border border-line bg-surface text-[22px] font-bold text-brand-text hover:border-brand-line">
                  +
                </button>
              </div>
              <p className="mb-2.5 text-[13px] font-extrabold">Is anyone at home…</p>
              <div role="group" aria-label="Who is at home" className="grid gap-2.5 min-[751px]:grid-cols-2">
                {WHO.map(({ id, label, icon }) => (
                  <OptionButton key={id} icon={icon} label={label} pressed={who.includes(id)} onClick={() => toggle(who, setWho, id, "none")} />
                ))}
              </div>
              <Actions disabled={working || who.length === 0} onBack={onBack} onNext={() => onHousehold(n, who)} label="Show my results" />
            </>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4 min-[861px]:sticky min-[861px]:top-6 max-[860px]:order-first">
          <div className="flex items-center gap-3.5 rounded-[18px] border border-line bg-surface px-4 py-3 min-[861px]:block min-[861px]:px-5 min-[861px]:py-[18px]">
            <div className="font-display text-[34px] font-extrabold tabular-nums tracking-[-0.045em]">
              {total || "—"}
              <small className="ml-1 text-sm font-bold tracking-normal text-faint">programs</small>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground min-[861px]:my-1 min-[861px]:mb-2.5">
              {total ? `${inView} still in view for you.` : "We'll check them once we know where you live."}
            </p>
            <div className="hidden h-1.5 overflow-hidden rounded-full bg-line min-[861px]:block">
              <div className="h-full bg-brand transition-[width] duration-500" style={{ width: total ? `${(inView / total) * 100}%` : "0%" }} />
            </div>
          </div>
          <div className="hidden rounded-[22px] bg-brand-soft p-5 min-[861px]:block">
            <h2 className="mb-3 mt-1 font-display text-[17px] font-extrabold tracking-[-0.03em]">{name ? `${name}'s profile` : "Your profile"}</h2>
            <ul className="flex flex-col gap-2">
              {rows.map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2.5 border-b border-brand-line pb-2 text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <strong className="text-right">{v}</strong>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Actions({ disabled, onBack, onNext, label }: { disabled: boolean; onBack: () => void; onNext: () => void; label: string }) {
  return (
    <div className="mt-[22px] flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        disabled={disabled}
        onClick={onNext}
        className="inline-flex items-center justify-center gap-2 rounded-[11px] bg-brand px-5 py-[13px] font-bold text-on-brand hover:bg-brand-hover disabled:opacity-40"
      >
        {label} <ArrowRight aria-hidden className="size-4" />
      </button>
      <button type="button" onClick={onBack} className="px-1.5 py-2.5 font-semibold text-muted-foreground hover:text-ink">
        Back
      </button>
    </div>
  );
}
