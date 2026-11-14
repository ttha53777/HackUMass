"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const Ctx = createContext<(message: string) => void>(() => {});

/** A short message at the bottom of the screen. Announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [shown, setShown] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((next: string) => {
    window.clearTimeout(timer.current);
    setMessage(next);
    setShown(true);
    timer.current = window.setTimeout(() => setShown(false), 3600);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-[calc(22px+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-[min(520px,calc(100%-32px))] -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-[12.5px] font-bold leading-snug text-paper transition-all duration-200 ${
          shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
        }`}
      >
        {message}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
