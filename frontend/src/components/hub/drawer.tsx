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
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
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
        className={`drawer${open ? " on" : ""}`}
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

export function DrawerHead({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return (
    <div className="dh">
      <div>
        <p className="mono">{eyebrow}</p>
        <h3>{title}</h3>
      </div>
      <button className="xbtn" type="button" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
