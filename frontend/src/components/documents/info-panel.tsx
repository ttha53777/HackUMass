"use client";

import { motion } from "motion/react";
import { Check, Download, FileSearch, Lock, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ConfirmCard } from "@/components/evidence/evidence-cards";
import { btn } from "@/components/od/ui";
import { useApp } from "@/components/session/session-provider";
import { cn } from "@/lib/utils";

import { ACCEPT, isReadable, sizeLabel } from "./paper-store";
import { STATUS_LABEL, useObjectUrl, type Row } from "./paper-views";

/** Kinds the Document Agent reads (backend services/document_patterns.KIND_FIELDS). */
export const READABLE_KINDS = new Set(["income", "member_income", "dob", "lease", "heat", "shutoff", "address", "id"]);

/** What each kind gives us, in the person's words. */
const READS: Record<string, string> = {
  income: "monthly income and whether you're working",
  member_income: "a household member's monthly income, added to yours",
  dob: "how many people live with you and their age groups",
  lease: "that you rent and whether heat is included, plus your name and address",
  heat: "whether a bill is past due, plus your name, address, phone and email",
  shutoff: "that you have a shut-off notice",
  address: "your name and address",
  id: "your name, date of birth and address",
};

/**
 * Finder's "Get Info" / Quick Look for one kind of paper: a preview, what each
 * provider asks for (their words, never ours), and every action in one place.
 */
export function InfoPanel({
  row,
  onClose,
  onFile,
  onRemove,
  onTogglePaperCopy,
  onRead,
}: {
  row: Row;
  onClose: () => void;
  onFile: (file: File) => void;
  onRemove: () => void;
  onTogglePaperCopy: () => void;
  /** Send this paper to the Document Agent (consent given). */
  onRead: () => Promise<void>;
}) {
  const { working, snapshot } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [askRead, setAskRead] = useState(false);
  const [reading, setReading] = useState(false);
  const paper = row.paper;
  const url = useObjectUrl(paper?.blob);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row.kind, onClose]);

  const read = async () => {
    setReading(true);
    try {
      await onRead();
    } finally {
      setReading(false);
      setAskRead(false);
    }
  };

  const conflict = snapshot?.pending_question?.origin === "conflict";

  return (
    <motion.aside
      ref={panel}
      tabIndex={-1}
      aria-label={`${row.label} details`}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="fixed inset-y-0 right-0 z-40 flex w-[min(420px,100%)] flex-col overflow-y-auto border-l border-line bg-surface shadow-card outline-none"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-extrabold">{row.label}</h2>
          <p className={cn("text-[12px] font-bold", row.status === "needed" ? "text-amber-ink" : "text-brand-text")}>{STATUS_LABEL[row.status]}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-ink">
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        {/* Preview or drop area */}
        {paper && url ? (
          <div className="overflow-hidden rounded-[14px] border border-line bg-surface-2">
            {paper.type.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob preview
              <img src={url} alt={`Preview of ${paper.name}`} className="max-h-[260px] w-full object-contain" />
            ) : paper.type === "application/pdf" ? (
              <iframe src={url} title={`Preview of ${paper.name}`} className="h-[300px] w-full bg-white" />
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No preview for this file type.</p>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2 text-[12px]">
              <span className="min-w-0 truncate font-bold">{paper.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {sizeLabel(paper.size)}
                {paper.demo ? " · Demo paper" : ""}
              </span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className="flex flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-brand-line bg-surface-2 px-4 py-8 text-center hover:bg-brand-soft"
          >
            <Upload aria-hidden className="size-6 text-brand-text" />
            <span className="text-[14px] font-extrabold">Add a photo or file</span>
            <span className="text-[12px] text-muted-foreground">Drop it here or tap to choose. PDF or photo, up to 10 MB. It stays on this device.</span>
          </button>
        )}

        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }} />

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {paper ? (
            <>
              <button type="button" className={btn("ghost", "sm")} onClick={() => input.current?.click()}>
                <RefreshCw aria-hidden className="size-4" /> Replace
              </button>
              {url ? (
                <a href={url} download={paper.name} className={btn("ghost", "sm")}>
                  <Download aria-hidden className="size-4" /> Download
                </a>
              ) : null}
              <button type="button" className={btn("ghost", "sm", "text-amber-ink")} onClick={() => setConfirmRemove(true)}>
                <Trash2 aria-hidden className="size-4" /> Remove
              </button>
            </>
          ) : (
            <button type="button" aria-pressed={row.status === "paper"} className={btn(row.status === "paper" ? "primary" : "ghost", "sm")} onClick={onTogglePaperCopy}>
              <Check aria-hidden className="size-4" /> {row.status === "paper" ? "Paper copy at home" : "I have a paper copy"}
            </button>
          )}
        </div>
        {confirmRemove ? (
          <div role="alertdialog" aria-label="Remove this file" className="flex flex-wrap items-center gap-2 rounded-[12px] bg-amber px-3.5 py-3 text-[13px] text-amber-ink">
            <span className="flex-1">Remove {paper?.name} from this device?</span>
            <button type="button" className={btn("ghost", "sm")} onClick={() => setConfirmRemove(false)}>
              Keep it
            </button>
            <button
              type="button"
              className={btn("primary", "sm")}
              onClick={() => {
                setConfirmRemove(false);
                onRemove();
              }}
            >
              Remove
            </button>
          </div>
        ) : null}

        {/* The Document Agent reads this kind's fields */}
        {paper && isReadable(paper) && READABLE_KINDS.has(row.kind) ? (
          <div className="rounded-[14px] border border-line p-3.5">
            <p className="flex items-center gap-2 text-[13.5px] font-extrabold">
              <FileSearch aria-hidden className="size-4 text-brand-text" /> Read this for me
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              We can read {READS[row.kind] ?? "the details we use"} from this file. It&apos;s sent once, read, and deleted. Nothing is used
              until you confirm it, and your name and address stay on this device.
            </p>
            {askRead ? (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" className={btn("primary", "sm")} disabled={reading || working} onClick={() => void read()}>
                  {reading ? "Reading…" : "Yes, read it"}
                </button>
                <button type="button" className={btn("ghost", "sm")} onClick={() => setAskRead(false)}>
                  Not now
                </button>
              </div>
            ) : (
              <button type="button" className={btn("ghost", "sm", "mt-2.5")} onClick={() => setAskRead(true)}>
                Read it for me
              </button>
            )}
          </div>
        ) : null}
        {conflict ? <ConfirmCard /> : null}

        {/* Who asks for it */}
        <div>
          <h3 className="mb-2 text-[13px] font-extrabold">
            Counts for {row.uses.length} application{row.uses.length === 1 ? "" : "s"}
          </h3>
          <ul className="flex flex-col gap-2.5">
            {row.uses.map((u) => (
              <li key={u.id} className="rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed">
                <strong className="block text-[13px]">{u.name}</strong>
                {u.texts.map((t) => (
                  <span key={t} className="block text-muted-foreground">
                    {t}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          {row.condition ? <p className="mt-2 text-[12px] font-bold text-amber-ink">Only if it applies: {row.condition.toLowerCase()}</p> : null}
        </div>

        <p className="flex items-start gap-2 rounded-[12px] bg-amber px-3.5 py-3 text-[12px] leading-relaxed text-amber-ink">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Files stay on this device. Never email confidential papers; upload them only inside an official application, or bring them in person.
        </p>
      </div>
    </motion.aside>
  );
}
