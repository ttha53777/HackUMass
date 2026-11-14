"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DoorOpen } from "lucide-react";

import { useApp } from "@/components/session/session-provider";
import { usePlan } from "@/components/session/plan-state";
import { benefits, liveCount, localHelp, walletKinds } from "@/lib/derive";
import { NAME_EVENT, readName } from "@/lib/device-state";
import { cn } from "@/lib/utils";

import { NAV } from "./nav";

function Logo() {
  return (
    <Link href="/home" className="flex items-center gap-2.5 font-display text-2xl font-extrabold tracking-[-0.055em]">
      <span className="grid size-[34px] place-items-center rounded-xl bg-brand text-on-brand">
        <DoorOpen aria-hidden className="size-[18px]" />
      </span>
      <span>
        Open<b className="text-brand">Door</b>
      </span>
    </Link>
  );
}

function useCounts() {
  const { snapshot } = useApp();
  const { plan } = usePlan();
  if (!snapshot) return {} as Record<string, number>;
  return {
    "/documents": walletKinds(snapshot, plan).filter((d) => !plan.docs.includes(d.kind)).length,
    "/benefits": liveCount(benefits(snapshot)),
    "/local": liveCount(localHelp(snapshot)),
    "/home": snapshot.open_questions.length,
  } as Record<string, number>;
}

const active = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const counts = useCounts();
  const { snapshot } = useApp();
  const zip = snapshot?.profile_summary.find((p) => p.field === "zip")?.display_value;
  const [name, setName] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    setName(readName());
    const onName = () => setName(readName());
    window.addEventListener(NAME_EVENT, onName);
    return () => window.removeEventListener(NAME_EVENT, onName);
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface px-4 pb-[22px] pt-7 min-[751px]:flex min-[1101px]:w-[248px]">
        <div className="mb-[34px] px-3">
          <Logo />
        </div>
        <p className="mx-3.5 mb-3 text-[10px] font-extrabold uppercase tracking-[2px] text-faint">Your plan</p>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ href, label, sub, icon: Icon }) => {
            const on = active(path, href);
            const n = counts[href];
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-3 text-left font-bold transition-colors",
                  on ? "bg-brand-soft text-brand-text" : "text-muted-foreground hover:bg-surface-2",
                )}
              >
                <Icon aria-hidden className="size-[19px] shrink-0" />
                <span className="flex flex-col leading-tight">
                  <span>{label}</span>
                  <span className={cn("mt-px text-[11px] font-semibold", on ? "opacity-75" : "text-faint")}>{sub}</span>
                </span>
                {n ? (
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                      href === "/home" ? "bg-amber text-amber-ink" : "bg-surface-2",
                    )}
                    aria-label={href === "/home" ? `${n} open questions` : href === "/documents" ? `${n} documents to find` : `${n} options`}
                  >
                    {n}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <div className="rounded-2xl bg-brand-soft p-3.5 text-xs leading-relaxed text-muted-foreground">
            <strong className="mb-0.5 block text-[13px] text-ink">Need a person?</strong>
            Dial 211 any time for free help finding services near you.
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
            <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-peach font-display text-[15px] font-extrabold text-peach-ink">
              {name ? name[0].toUpperCase() : "·"}
            </span>
            <div className="min-w-0 text-[11px] text-muted-foreground">
              <strong className="block truncate text-[13px] text-ink">{name || "Your plan"}</strong>
              English{zip ? ` · ZIP ${zip}` : ""}
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2.5 border-b border-line bg-surface px-4 py-3 min-[751px]:hidden">
          <Logo />
          {zip ? <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted-foreground">ZIP {zip}</span> : null}
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-24 pt-7 min-[751px]:px-[max(16px,min(40px,4vw))] min-[751px]:pb-5">
          {children}
          <footer className="pt-6 text-center text-[11px] leading-relaxed text-faint">
            Matches are potential, never official: only each provider decides. Facts come from the
            providers&apos; own pages.
          </footer>
        </main>
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-6 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] min-[751px]:hidden"
        >
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = active(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold",
                  on ? "text-brand-text" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" />
                <span className="max-w-full truncate">{label.replace("Government benefits", "Benefits").replace("Your money", "Money")}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
