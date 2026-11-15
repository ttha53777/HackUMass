"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, EyeOff, Landmark, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { btn } from "@/components/od/ui";
import { useApp } from "@/components/session/session-provider";
import { getPersonas } from "@/lib/api";
import type { PersonaOut } from "@/lib/types";
import { cn } from "@/lib/utils";

import { BankLinkFlow } from "./link-flow";

type Step = "choose" | "consent" | "connecting" | "done";

/** "Simulated: retired, fixed monthly income" -> "Retired, fixed monthly income". */
const plain = (label: string) => {
  const rest = label.replace(/^Simulated:\s*/i, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
};

/**
 * "Connect a bank": OpenDoor's own flow (never an imitation of a bank or an
 * aggregator), over Capital One's Nessie sandbox. Only fictional demo accounts.
 */
export function ConnectBankModal({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected?: () => void }) {
  const { submitEvidence, whenIdle, snapshot } = useApp();
  const [step, setStep] = useState<Step>("choose");
  // The backend finished linking; the agent flow decides when to show "done".
  const [linked, setLinked] = useState(false);
  const [personas, setPersonas] = useState<PersonaOut[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  // The latest onClose, so the reset below runs only when the dialog opens.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset each time the dialog opens
    setStep("choose");
    setError(null);
    let live = true;
    getPersonas()
      .then((list) => live && setPersonas(list))
      .catch(() => live && setFailed(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    setTimeout(() => dialog.current?.focus(), 0);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const connect = async () => {
    setError(null);
    setLinked(false);
    setStep("connecting");
    await whenIdle();
    const problem = await submitEvidence(pick);
    await whenIdle();
    if (problem) {
      setError(problem);
      setStep("consent");
      return;
    }
    setLinked(true);
  };

  const flowComplete = useCallback(() => {
    setStep("done");
    onConnected?.();
  }, [onConnected]);

  const chosen = personas?.find((p) => p.id === pick);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative max-h-[90vh] w-[min(520px,100%)] overflow-y-auto rounded-[24px] border border-line bg-surface p-6 shadow-card outline-none"
          >
            <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-ink">
              <X aria-hidden className="size-4" />
            </button>
            <div className="mb-4 flex items-center gap-2.5">
              <span className="grid size-10 place-items-center rounded-[13px] bg-brand-soft text-brand-text">
                <Landmark aria-hidden className="size-5" />
              </span>
              <div>
                <h2 id={titleId} className="font-display text-[19px] font-extrabold tracking-[-0.03em]">
                  {step === "done" ? "Bank connected" : "Connect a bank account"}
                </h2>
                <p className="text-[12px] font-bold text-lav-ink">Demo accounts only · Capital One Nessie sandbox</p>
              </div>
            </div>

            {step === "choose" ? (
              <>
                <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
                  Pick a fictional demo account. In a real launch this is where you&apos;d sign in to your bank; here nothing real is connected.
                </p>
                {failed ? (
                  <p className="text-sm text-muted-foreground">Demo accounts aren&apos;t available right now.</p>
                ) : !personas ? (
                  <p className="text-sm text-muted-foreground">Loading demo accounts…</p>
                ) : (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="sr-only">Demo account</legend>
                    {personas.map((p) => (
                      <label
                        key={p.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-[14px] border px-3.5 py-3 text-[13px] transition-colors",
                          pick === p.id ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2",
                        )}
                      >
                        <input type="radio" name="persona" value={p.id} checked={pick === p.id} onChange={() => setPick(p.id)} className="mt-[3px] accent-[var(--brand)]" />
                        <span>
                          <strong className="block">{plain(p.label)}</strong>
                          <span className="leading-normal text-muted-foreground">{p.description}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                <div className="mt-5 flex justify-end gap-2.5">
                  <button type="button" className={btn("ghost", "sm")} onClick={onClose}>
                    Not now
                  </button>
                  <button type="button" className={btn("primary", "sm")} disabled={!pick} onClick={() => setStep("consent")}>
                    Continue
                  </button>
                </div>
              </>
            ) : null}

            {step === "connecting" ? (
              <BankLinkFlow finished={linked} trace={snapshot?.trace ?? []} onComplete={flowComplete} />
            ) : null}

            {step === "consent" ? (
              <>
                <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
                  OpenDoor would like to read <strong className="text-ink">{chosen ? plain(chosen.label).toLowerCase() : "this demo account"}</strong> to understand your money:
                </p>
                <ul className="mb-3 flex flex-col gap-2 text-[13px]">
                  {[
                    "Deposits, to estimate what comes in each month",
                    "Bills and their status, like rent and utilities",
                    "Spending, grouped into simple categories",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-text" /> {t}
                    </li>
                  ))}
                </ul>
                <ul className="mb-4 flex flex-col gap-2 rounded-[14px] bg-surface-2 p-3.5 text-[12.5px] text-muted-foreground">
                  {[
                    "Only monthly totals are kept, never single transactions",
                    "Nothing is used until you confirm it",
                    "No logins, no moving money, and you can disconnect any time",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <EyeOff aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {t}
                    </li>
                  ))}
                </ul>
                {error ? (
                  <p role="alert" className="mb-3 rounded-xl bg-amber px-3 py-2 text-[12.5px] text-amber-ink">
                    {error}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2.5">
                  <button type="button" className={btn("ghost", "sm")} onClick={() => setStep("choose")}>
                    Back
                  </button>
                  <button type="button" className={btn("primary", "sm")} onClick={() => void connect()}>
                    <ShieldCheck aria-hidden className="size-4" /> Agree and connect
                  </button>
                </div>
              </>
            ) : null}

            {step === "done" ? (
              <>
                <p className="mb-4 flex items-start gap-2 text-[14px] leading-relaxed">
                  <Check aria-hidden className="mt-1 size-4 shrink-0 text-brand-text" />
                  Connected. I&apos;ve read the demo account&apos;s monthly totals. Look them over on Your money; nothing is used until you confirm it.
                </p>
                <div className="flex justify-end">
                  <button type="button" autoFocus className={btn("primary", "sm")} onClick={onClose}>
                    Done
                  </button>
                </div>
              </>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
