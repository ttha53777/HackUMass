"use client";

import { Check, IdCard, Lock, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { btn, Panel } from "@/components/od/ui";
import { cn } from "@/lib/utils";

import { DETAIL_LABEL, DETAIL_ORDER, type Detail } from "./details-store";

/**
 * "My details": name, birth date, address and contact details read from the
 * person's papers. They live on this device only and fill application forms
 * only once confirmed here. Renders nothing until a paper gives us one.
 */
export function MyDetails({
  details,
  onConfirm,
  onRemove,
  className,
}: {
  details: Detail[];
  onConfirm: (detail: Detail, value?: string) => void;
  onRemove: (detail: Detail) => void;
  className?: string;
}) {
  const shown = DETAIL_ORDER.map((key) => details.find((d) => d.key === key)).filter((d): d is Detail => !!d);
  if (!shown.length) return null;
  const waiting = shown.filter((d) => !d.confirmed || d.other).length;

  return (
    <Panel className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky text-sky-ink">
          <IdCard aria-hidden className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-extrabold">My details</h2>
          <p className="text-[12px] text-muted-foreground">
            {waiting ? `${waiting} to check. ` : "All checked. "}
            We use these to fill in forms with you, only once you confirm them.
          </p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((d) => (
          <DetailRow key={d.id} detail={d} onConfirm={onConfirm} onRemove={onRemove} />
        ))}
      </ul>
      <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-faint">
        <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" /> Kept on this device only. Our server never stores them.
      </p>
    </Panel>
  );
}

function DetailRow({
  detail,
  onConfirm,
  onRemove,
}: {
  detail: Detail;
  onConfirm: (detail: Detail, value?: string) => void;
  onRemove: (detail: Detail) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(detail.value);
  const label = DETAIL_LABEL[detail.key];

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-[13px]">
      <div className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-bold text-muted-foreground">
          {label}
          {detail.sourceTitle && !detail.confirmed ? ` · from ${detail.sourceTitle}` : ""}
        </span>
        {editing ? (
          <input
            autoFocus
            aria-label={label}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onConfirm(detail, draft.trim());
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="mt-1 w-full max-w-[320px] rounded-[9px] border border-brand bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none"
          />
        ) : (
          <strong className="block break-words">{detail.value}</strong>
        )}
        {detail.other ? (
          <span className="mt-1 block text-[11.5px] font-bold text-amber-ink">
            {detail.other.sourceTitle ? `${detail.other.sourceTitle[0].toUpperCase()}${detail.other.sourceTitle.slice(1)}` : "Another paper"} shows{" "}
            {detail.other.value}.{" "}
            <button type="button" className="underline" onClick={() => onConfirm(detail, detail.other!.value)}>
              Use that
            </button>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <button
            type="button"
            className={btn("primary", "sm")}
            disabled={!draft.trim()}
            onClick={() => {
              onConfirm(detail, draft.trim());
              setEditing(false);
            }}
          >
            Save
          </button>
        ) : detail.confirmed && !detail.other ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-text">
            <Check aria-hidden className="size-3.5" /> Checked
          </span>
        ) : (
          <button type="button" className={btn("primary", "sm")} onClick={() => onConfirm(detail)}>
            <Check aria-hidden className="size-3.5" /> Right
          </button>
        )}
        {!editing ? (
          <button type="button" aria-label={`Change ${label}`} className={btn("ghost", "sm")} onClick={() => { setDraft(detail.value); setEditing(true); }}>
            <Pencil aria-hidden className="size-3.5" />
          </button>
        ) : null}
        <button type="button" aria-label={`Remove ${label}`} className={btn("ghost", "sm", "text-amber-ink")} onClick={() => onRemove(detail)}>
          <Trash2 aria-hidden className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
