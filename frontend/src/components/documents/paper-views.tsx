"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Check, FileText, Image as ImageIcon, Plus, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Paper } from "./paper-store";

export type Status = "uploaded" | "paper" | "needed";

/** One kind of paper as the page shows it. */
export type Row = {
  kind: string;
  label: string;
  condition: string | null;
  status: Status;
  paper: Paper | null;
  uses: { id: string; name: string; texts: string[] }[];
};

export const STATUS_LABEL: Record<Status, string> = {
  uploaded: "Added",
  paper: "Paper copy at home",
  needed: "Still needed",
};

/** An object URL for a blob, revoked when it changes or unmounts. */
export function useObjectUrl(blob: Blob | null | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

const isImage = (p: Paper | null) => !!p && p.type.startsWith("image/");

function Thumb({ row, big }: { row: Row; big?: boolean }) {
  const url = useObjectUrl(isImage(row.paper) ? row.paper!.blob : null);
  const size = big ? "h-[120px]" : "h-[92px]";
  if (row.status === "uploaded" && url) {
    // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not a remote image
    return <img src={url} alt="" className={cn(size, "w-full rounded-[12px] border border-line bg-surface object-cover")} />;
  }
  if (row.status === "uploaded") {
    return (
      <div className={cn(size, "relative grid w-full place-items-center rounded-[12px] border border-line bg-surface")}>
        <FileText aria-hidden className="size-9 text-brand-text" />
        <span className="absolute bottom-2 right-2 rounded-[6px] bg-brand px-1.5 py-0.5 text-[10px] font-extrabold text-on-brand">
          {row.paper?.type === "application/pdf" ? "PDF" : "FILE"}
        </span>
      </div>
    );
  }
  if (row.status === "paper") {
    return (
      <div className={cn(size, "grid w-full place-items-center rounded-[12px] border border-brand-line bg-brand-soft")}>
        <Check aria-hidden className="size-8 text-brand-text" />
      </div>
    );
  }
  return (
    <div className={cn(size, "grid w-full place-items-center rounded-[12px] border-[1.5px] border-dashed border-line bg-surface-2 text-faint transition-colors group-hover:border-brand-line group-hover:text-brand-text")}>
      <span className="flex flex-col items-center gap-1 text-[11.5px] font-bold">
        <Plus aria-hidden className="size-5" />
        Drop a file or tap
      </span>
    </div>
  );
}

function useDropTarget(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        const file = e.dataTransfer.files?.[0];
        setOver(false);
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        onFile(file);
      },
    },
  };
}

/** Finder's icon view: one tile per kind of paper. */
export function PaperGrid({
  rows,
  selected,
  onOpen,
  onDropFile,
}: {
  rows: Row[];
  selected: string | null;
  onOpen: (kind: string) => void;
  onDropFile: (kind: string, file: File) => void;
}) {
  return (
    <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(156px,1fr))]">
      {rows.map((row) => (
        <GridTile key={row.kind} row={row} selected={selected === row.kind} onOpen={onOpen} onDropFile={onDropFile} />
      ))}
    </ul>
  );
}

function GridTile({ row, selected, onOpen, onDropFile }: { row: Row; selected: boolean; onOpen: (k: string) => void; onDropFile: (k: string, f: File) => void }) {
  const drop = useDropTarget((file) => onDropFile(row.kind, file));
  return (
    <li {...drop.props}>
      <button
        type="button"
        onClick={() => onOpen(row.kind)}
        aria-label={`${row.label}: ${STATUS_LABEL[row.status]}. Used by ${row.uses.length}. Open`}
        className={cn(
          "group flex w-full flex-col gap-2 rounded-[16px] border p-2.5 text-left transition-all hover:-translate-y-px hover:shadow-card",
          selected ? "border-brand bg-brand-soft shadow-[inset_0_0_0_1px_var(--brand)]" : "border-transparent hover:border-line hover:bg-surface",
          drop.over && "border-brand bg-brand-soft",
        )}
      >
        <Thumb row={row} />
        <span className="px-0.5">
          <span className="line-clamp-2 text-[13px] font-extrabold leading-snug">{row.label}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
            {row.paper ? row.paper.name : row.uses.length > 1 ? `Used by ${row.uses.length} applications` : row.uses[0]?.name}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Finder's list view: one row per kind of paper, with columns. */
export function PaperList({
  rows,
  selected,
  onOpen,
  onDropFile,
}: {
  rows: Row[];
  selected: string | null;
  onOpen: (kind: string) => void;
  onDropFile: (kind: string, file: File) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
      <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_110px] gap-3 border-b border-line bg-surface-2 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[1px] text-faint min-[760px]:grid">
        <span>Name</span>
        <span>Status</span>
        <span>Used by</span>
        <span>Added</span>
      </div>
      <ul>
        {rows.map((row) => (
          <ListRow key={row.kind} row={row} selected={selected === row.kind} onOpen={onOpen} onDropFile={onDropFile} />
        ))}
      </ul>
    </div>
  );
}

function ListRow({ row, selected, onOpen, onDropFile }: { row: Row; selected: boolean; onOpen: (k: string) => void; onDropFile: (k: string, f: File) => void }) {
  const drop = useDropTarget((file) => onDropFile(row.kind, file));
  const Icon = row.paper && isImage(row.paper) ? ImageIcon : row.status === "needed" ? Upload : row.status === "paper" ? Check : FileText;
  return (
    <li {...drop.props} className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => onOpen(row.kind)}
        className={cn(
          "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-colors min-[760px]:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_110px]",
          selected ? "bg-brand-soft" : "hover:bg-surface-2",
          drop.over && "bg-brand-soft",
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-[9px]",
              row.status === "needed" ? "border border-dashed border-line text-faint" : "bg-brand-soft text-brand-text",
            )}
          >
            <Icon aria-hidden className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold">{row.label}</span>
            {row.paper ? <span className="block truncate text-[11.5px] text-muted-foreground">{row.paper.name}</span> : null}
          </span>
        </span>
        <span className={cn("text-[12px] font-bold", row.status === "needed" ? "text-amber-ink" : "text-brand-text")}>{STATUS_LABEL[row.status]}</span>
        <span className="hidden truncate text-[12px] text-muted-foreground min-[760px]:block">{row.uses.map((u) => u.name).join(", ")}</span>
        <span className="hidden text-[12px] tabular-nums text-muted-foreground min-[760px]:block">
          {row.paper ? new Date(row.paper.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
        </span>
      </button>
    </li>
  );
}
