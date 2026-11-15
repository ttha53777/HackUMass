"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The hub's side drawer: a scrim, a panel sliding in from the right, Escape and the scrim
 * close it, focus moves in on open and back to where it was on close.
 */
export function Drawer({
  open,
  label,
  onClose,
  full,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  /** Full screen, white: "show this at the counter". */
  full?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("input, textarea, button")?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      back.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        className={`drawer${open ? " on" : ""}${full ? " full" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        inert={!open}
      >
        {open ? children : null}
      </div>
    </>
  );
}

export function DrawerHead({ eyebrow, title, onClose }: { eyebrow: ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="dh">
      <div>
        {typeof eyebrow === "string" ? <p className="mono">{eyebrow}</p> : eyebrow}
        <h3>{title}</h3>
      </div>
      <button className="xbtn" type="button" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

/** "1 Pick — 2 Check — 3 Done": where a drawer's flow is. */
export function Stepper({ at, labels }: { at: number; labels: string[] }) {
  return (
    <div className="steps3" aria-label={`Step ${at} of ${labels.length}: ${labels[at - 1]}`}>
      {labels.map((l, i) => (
        <span key={l} style={{ display: "contents" }}>
          {i ? <i className={i < at ? "on" : ""} /> : null}
          <span className={i < at ? "on" : ""}>
            {i + 1} {l}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The sheet-of-paper doodle with a scanning band, while something is being read. */
export function ReadingPaper() {
  return (
    <div className="sheetpaper">
      <i className="scan" />
      <div className="lines">
        <i style={{ width: "55%" }} />
        <i />
        <i className="hl" style={{ width: "70%" }} />
        <i style={{ width: "85%" }} />
        <i className="hl" style={{ width: "40%" }} />
        <i style={{ width: "62%" }} />
      </div>
    </div>
  );
}
