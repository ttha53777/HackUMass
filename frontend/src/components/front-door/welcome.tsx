"use client";

import { useState } from "react";
import { ArrowRight, Flame, HandHeart, Lock, ShieldCheck, Utensils } from "lucide-react";

import { cn } from "@/lib/utils";

import { HouseArt } from "./house-art";

const LANGS: [string, string, boolean][] = [
  ["en", "English", true],
  ["es", "Español", false],
  ["pt", "Português", false],
  ["ht", "Kreyòl ayisyen", false],
  ["zh", "中文", false],
  ["vi", "Tiếng Việt", false],
];

export function Welcome({
  initialName,
  opening,
  busy,
  onStart,
  onSample,
}: {
  initialName: string;
  opening: boolean;
  busy: boolean;
  onStart: (name: string) => void;
  onSample: () => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <section className="mx-auto grid min-h-screen max-w-[1160px] items-center gap-6 px-4 py-6 min-[861px]:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] min-[861px]:gap-12 min-[861px]:py-10">
      <div className="flex max-w-[520px] flex-col gap-[26px]">
        <div className="flex items-center gap-2.5 font-display text-2xl font-extrabold tracking-[-0.055em]">
          <span className="grid size-[34px] place-items-center rounded-xl bg-brand text-on-brand">
            <HandHeart aria-hidden className="size-[18px]" />
          </span>
          <span>
            Open<b className="text-art-h1">Door</b>
          </span>
        </div>
        <h1 className="font-display text-[clamp(34px,4.4vw,54px)] font-extrabold leading-[1.08] tracking-[-0.045em]">
          Find the help that&apos;s <em className="not-italic text-art-h2">already waiting</em> for you.
        </h1>
        <p className="text-base leading-[1.75] text-muted-foreground">
          Three quick questions. We check government benefits and local help near you, then show you
          what to do first.
        </p>

        <div>
          <p className="mb-2.5 text-[13px] font-extrabold" id="lang-label">
            Language
          </p>
          <div role="group" aria-labelledby="lang-label" className="flex flex-wrap gap-2">
            {LANGS.map(([key, label, live]) => (
              <button
                key={key}
                type="button"
                disabled={!live}
                aria-pressed={key === "en"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-[15px] py-[9px] text-[13px] font-bold",
                  key === "en"
                    ? "border-brand bg-brand-soft text-brand-text shadow-[inset_0_0_0_1px_var(--brand)]"
                    : "border-line bg-surface",
                  !live && "bg-surface-2 text-faint",
                )}
              >
                {label}
                {live ? null : <span className="text-[9.5px] font-extrabold uppercase tracking-wider">Soon</span>}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="name" className="mb-2.5 block text-[13px] font-extrabold">
            What should we call you? <small className="ml-1.5 font-semibold text-faint">Optional</small>
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && onStart(name)}
            autoComplete="given-name"
            maxLength={40}
            className="w-full rounded-[14px] border border-line bg-surface px-[18px] py-4 text-[19px] outline-none focus:border-brand"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onStart(name)}
            className="inline-flex items-center justify-center gap-2 rounded-[11px] bg-brand px-5 py-[13px] font-bold text-on-brand hover:bg-brand-hover disabled:opacity-40"
          >
            Get started <ArrowRight aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSample}
            className="px-1.5 py-2.5 font-semibold text-muted-foreground hover:text-ink disabled:opacity-40"
          >
            Try a sample
          </button>
        </div>

        <p className="flex items-start gap-2 text-xs leading-[1.7] text-muted-foreground">
          <ShieldCheck aria-hidden className="mt-0.5 size-[15px] shrink-0 text-brand-text" />
          <span>
            No account. We never ask for a Social Security number. Your name stays on this device.
          </span>
        </p>
      </div>

      <div className="relative order-first min-[861px]:order-none">
        <HouseArt
          open={opening}
          label="A house with its door opening among green hills"
          className="h-[220px] min-[861px]:h-[min(560px,72vh)]"
        />
        <span className="absolute left-[22px] top-[26px] flex items-center gap-2 rounded-[13px] bg-surface px-3 py-[9px] text-[11px] font-extrabold shadow-card">
          <Utensils aria-hidden className="size-[15px] text-brand-text" /> Groceries
        </span>
        <span className="absolute bottom-7 right-[22px] flex items-center gap-2 rounded-[13px] bg-surface px-3 py-[9px] text-[11px] font-extrabold shadow-card">
          <Flame aria-hidden className="size-[15px] text-brand-text" /> Heat &amp; bills
        </span>
        <span className="absolute left-[22px] top-[46%] hidden items-center gap-2 rounded-[13px] bg-surface px-3 py-[9px] text-[11px] font-extrabold shadow-card min-[861px]:flex">
          <Lock aria-hidden className="size-[15px] text-brand-text" /> Private
        </span>
      </div>
    </section>
  );
}
