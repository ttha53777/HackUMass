"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { HouseArt } from "@/components/front-door/house-art";
import { useApp } from "@/components/session/session-provider";
import { coreDone } from "@/lib/derive";

import { Checklist } from "./checklist";
import { resultsLine } from "./script";

/**
 * "Building your plan": the door opens while each agent is checked off from its
 * real status. Results and "See my plan" appear only once the backend is done
 * and the checklist has had its moment, so it never runs ahead of the work.
 */
export function Building({ name }: { name: string }) {
  const app = useApp();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [minTimeDone, setMinTimeDone] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setOpen(true), reduced ? 0 : 250);
    return () => window.clearTimeout(t);
  }, [reduced]);

  const ready = minTimeDone && !app.working && coreDone(app.snapshot);
  const result = ready && app.snapshot ? resultsLine(app.snapshot) : null;

  return (
    <MotionConfig reducedMotion="user">
      <section className="grid min-h-screen place-items-center px-4 py-10">
        <div className="grid w-[min(980px,100%)] items-center gap-8 min-[861px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] min-[861px]:gap-12">
          <HouseArt open={open} label="A house with its door opening" className="h-[200px] min-[861px]:h-[min(520px,70vh)]" />

          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[2px] text-muted-foreground">
              {ready ? "Your plan is ready" : "One moment"}
            </p>
            <h1 aria-live="polite" className="mb-2 mt-2 font-display text-[clamp(26px,3.4vw,36px)] font-extrabold leading-[1.15] tracking-[-0.04em]">
              {ready ? (name ? `Here you go, ${name}.` : "Here you go.") : name ? `Building your plan, ${name}` : "Building your plan"}
            </h1>
            <p className="mb-5 leading-[1.7] text-muted-foreground">Matching what you shared with what each program asks for.</p>

            <Checklist snapshot={app.snapshot} reduced={reduced} onMinimumTime={() => setMinTimeDone(true)} />

            <AnimatePresence>
              {result ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                  className="mt-6"
                >
                  <p className="font-display text-[21px] font-extrabold tracking-[-0.03em]">{result.headline}</p>
                  <p className="mt-1 text-muted-foreground">{result.detail}</p>
                  <motion.button
                    type="button"
                    autoFocus
                    onClick={() => router.replace("/home")}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.97 }}
                    className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-brand px-6 py-3.5 font-bold text-on-brand hover:bg-brand-hover"
                  >
                    See my plan <ArrowRight aria-hidden className="size-4" />
                  </motion.button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
