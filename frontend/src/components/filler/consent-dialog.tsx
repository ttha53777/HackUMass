"use client";

import { useEffect, useRef, useState } from "react";

import { FILLER_SCOPES, type FillerScope } from "@/lib/filler";

/**
 * The one-screen notice shown before anything is read: what kinds of details, that they stay
 * for this visit only, and how to stop. Nothing is read until the person presses the button.
 */
export function ConsentDialog({
  open,
  title,
  lead,
  confirmLabel,
  initial,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  lead: string;
  confirmLabel: string;
  initial?: FillerScope[];
  onConfirm: (scopes: FillerScope[]) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [scopes, setScopes] = useState<FillerScope[]>(initial ?? FILLER_SCOPES.map((s) => s.id));

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setScopes(initial ?? FILLER_SCOPES.map((s) => s.id));
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open, initial]);

  const toggle = (id: FillerScope) =>
    setScopes((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));

  return (
    <dialog ref={ref} className="fl-dialog" onCancel={(e) => (e.preventDefault(), onCancel())} aria-labelledby="fl-dialog-title">
      <h3 id="fl-dialog-title">{title}</h3>
      <p>{lead}</p>
      <fieldset>
        <legend>What it may read</legend>
        {FILLER_SCOPES.map((s) => (
          <label key={s.id}>
            <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggle(s.id)} />
            {s.label}
          </label>
        ))}
      </fieldset>
      <ul className="fl-facts">
        <li>Never reads a Social Security, card, account or ID number.</li>
        <li>What it finds stays for this visit only. Nothing is saved after you leave.</li>
        <li>Nothing is typed into a form until you confirm it.</li>
        <li>You can turn this off at any time, and what was read goes with it.</li>
      </ul>
      <div className="fl-actions">
        <button className="btn quiet sm" type="button" onClick={onCancel}>
          Not now
        </button>
        <button className="btn sm" type="button" disabled={!scopes.length} onClick={() => onConfirm(scopes)}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
