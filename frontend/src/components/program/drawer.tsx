"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { useApp } from "@/components/session/session-provider";
import type { AnsweredItem, Question } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ProgramDetail } from "./program-detail";
import { QuestionForm } from "./question-form";

type Open = { kind: "program"; id: string } | { kind: "question"; question: Question; tailoring?: boolean; current?: AnsweredItem } | null;

type DrawerController = {
  openProgram: (id: string) => void;
  openQuestion: (question: Question, options?: { tailoring?: boolean; current?: AnsweredItem }) => void;
  close: () => void;
};

const Ctx = createContext<DrawerController | null>(null);

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** One side drawer for program details and single questions. Focus stays inside while open. */
export function DrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const path = usePathname();
  const { snapshot } = useApp();

  const remember = () => {
    lastFocus.current = document.activeElement as HTMLElement | null;
  };

  const close = useCallback(() => {
    setOpen(null);
    window.setTimeout(() => lastFocus.current?.focus?.(), 0);
  }, []);

  const value = useMemo<DrawerController>(
    () => ({
      openProgram: (id) => {
        remember();
        setOpen({ kind: "program", id });
      },
      openQuestion: (question, options) => {
        remember();
        setOpen({ kind: "question", question, tailoring: options?.tailoring, current: options?.current });
      },
      close,
    }),
    [close],
  );

  // Navigating away closes it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route change is an external event
    setOpen(null);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close]);

  const card = open?.kind === "program" ? snapshot?.programs.find((c) => c.program.id === open.id) : undefined;
  const title = open?.kind === "program" ? (card?.program.name ?? "Program") : open?.kind === "question" ? open.question.prompt : "";
  const eyebrow =
    open?.kind === "program"
      ? (card?.program.categories.map((c) => c[0].toUpperCase() + c.slice(1)).join(" · ") ?? "")
      : open?.kind === "question" && open.current ? "Change your answer" : "One quick question";
  const sub = open?.kind === "program" ? card?.program.provider : open?.kind === "question" ? open.question.reason : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-hidden
        onClick={close}
        className={cn(
          "fixed inset-0 z-20 bg-[var(--backdrop)] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-[21] w-[min(560px,100%)] overflow-y-auto bg-surface shadow-[-20px_0_60px_rgb(0_0_0/0.12)] transition-transform duration-250 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {open ? (
          <>
            <header className="sticky top-0 z-[1] flex items-start gap-3 border-b border-line bg-surface px-[22px] pb-4 pt-5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-extrabold uppercase tracking-[2px] text-faint">{eyebrow}</p>
                <h2 id="drawer-title" className="mt-1.5 text-[21px] font-extrabold leading-tight tracking-[-0.6px]">
                  {title}
                </h2>
                {sub ? <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{sub}</p> : null}
              </div>
              <button
                ref={closeBtn}
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface-2 text-muted-foreground hover:text-ink"
              >
                <X aria-hidden className="size-[18px]" />
              </button>
            </header>
            <div className="px-[22px] pb-10 pt-4">
              {open.kind === "program" ? (
                card ? (
                  <ProgramDetail card={card} />
                ) : (
                  <p className="text-muted-foreground">This program is no longer in your results.</p>
                )
              ) : (
                <QuestionForm key={open.question.id} question={open.question} tailoring={open.tailoring} current={open.current} showSkip={!open.current} onDone={close} />
              )}
            </div>
          </>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}

export function useDrawer(): DrawerController {
  const value = useContext(Ctx);
  if (!value) throw new Error("useDrawer must be used inside DrawerProvider");
  return value;
}
