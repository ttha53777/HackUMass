"use client";

// Archived: not used by the live app (not routed). The live UI is components/hub/; see app/(opendoor)/_archive/legacy-dashboard/README.md.
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUpDown, ClipboardCopy, FileSearch, FolderOpen, LayoutGrid, List, Plus, Search, Sparkles, Upload, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { LoopTrace } from "@/components/loop/loop-trace";
import { docLabel, sourceNoun } from "@/components/od/doc-kinds";
import { btn, Panel, ProgressBar } from "@/components/od/ui";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import { cardById, docsFor, readiness, shortName, toneOf, walletKinds, walletPrograms, walletTexts } from "@/lib/derive";
import { cn } from "@/lib/utils";

import { useDetails } from "./details-store";
import { InfoPanel, READABLE_KINDS } from "./info-panel";
import { MyDetails } from "./my-details";
import { ACCEPT, DEMO_BASE, MAX_BYTES, demoName, guessKind, isReadable, loadDemoManifest, usePapers, type Paper } from "./paper-store";
import { PaperReviews } from "./paper-review";
import { PaperGrid, PaperList, type Row } from "./paper-views";

type Filter = "all" | "needed" | "ready" | string; // or a program id
type Sort = "needed" | "used" | "name";

const VIEW_KEY = "od.docs.view";

/** "Renters: copy of lease" -> "Renters": a condition the provider wrote at the start of its line. */
function conditionOf(texts: string[]): string | null {
  for (const t of texts) {
    const m = t.match(/^([A-Z][A-Za-z ]{2,24}):\s/);
    if (m) return m[1];
  }
  return null;
}

/**
 * The document wallet, built like a simple Finder window: a sidebar (all, still
 * needed, ready, and each application), a toolbar (search, grid or list, sort,
 * add), and a Get Info panel. Files stay on this device.
 */
export function WalletView() {
  const { snapshot, readPaper, whenIdle, working } = useApp();
  const { plan, toggleDoc } = usePlan();
  const toast = useToast();
  const { papers, add, update, remove } = usePapers(snapshot?.session_id ?? null);
  const details = useDetails(snapshot?.session_id ?? null);
  const [readingAll, setReadingAll] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<Sort>("needed");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // Files picked or dropped, waiting to be told what they are (first one is asked now).
  const [queued, setQueued] = useState<File[]>([]);
  const pending = queued[0] ?? null;
  const enqueue = (files: FileList | null | undefined) => {
    const list = Array.from(files ?? []).slice(0, 8);
    if (list.length) setQueued((q) => [...q, ...list]);
  };
  const [pageDrag, setPageDrag] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a remembered preference, read after mount
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      // ignore
    }
  }, []);
  const chooseView = (v: "grid" | "list") => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  };

  const progs = useMemo(() => (snapshot ? walletPrograms(snapshot, plan) : []), [snapshot, plan]);
  const kinds = useMemo(() => (snapshot ? walletKinds(snapshot, plan) : []), [snapshot, plan]);

  const rows: Row[] = useMemo(() => {
    if (!snapshot) return [];
    return kinds.map((doc) => {
      const texts = walletTexts(doc);
      const paper = papers.find((p) => p.kinds.includes(doc.kind)) ?? null;
      return {
        kind: doc.kind,
        label: docLabel(doc.kind, texts),
        condition: conditionOf(texts),
        status: paper ? "uploaded" : plan.docs.includes(doc.kind) ? "paper" : "needed",
        paper,
        uses: doc.uses.map((u) => {
          const c = cardById(snapshot, u.id);
          return { id: u.id, name: c ? shortName(c.program) : u.id, texts: u.texts };
        }),
      };
    });
  }, [kinds, papers, plan.docs, snapshot]);

  // Keep the checklist in step with files: a file means "have it".
  useEffect(() => {
    for (const row of rows) if (row.paper && !plan.docs.includes(row.kind)) toggleDoc(row.kind);
  }, [rows, plan.docs, toggleDoc]);

  const ready = rows.filter((r) => r.status !== "needed");
  const shown = useMemo(() => {
    const programKinds = progs.some((c) => c.program.id === filter)
      ? new Set(docsFor(cardById(snapshot!, filter)!.program).map((d) => d.kind))
      : null;
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === "needed" && r.status !== "needed") return false;
      if (filter === "ready" && r.status === "needed") return false;
      if (programKinds && !programKinds.has(r.kind)) return false;
      if (!q) return true;
      return [r.label, r.paper?.name ?? "", ...r.uses.flatMap((u) => [u.name, ...u.texts])].some((t) => t.toLowerCase().includes(q));
    });
    const rank = { needed: 0, paper: 1, uploaded: 2 };
    return [...list].sort((a, b) =>
      sort === "name"
        ? a.label.localeCompare(b.label)
        : sort === "used"
          ? b.uses.length - a.uses.length
          : rank[a.status] - rank[b.status] || b.uses.length - a.uses.length,
    );
  }, [rows, filter, query, sort, progs, snapshot]);

  const attach = useCallback(
    async (kind: string, file: File) => {
      if (file.size > MAX_BYTES) return toast("That file is bigger than 10 MB. Try a smaller photo or PDF.");
      const existing = papers.find((p) => p.kinds.includes(kind));
      if (existing) {
        const rest = existing.kinds.filter((k) => k !== kind);
        if (rest.length) await update(existing, { kinds: rest });
        else await remove(existing.id);
      }
      await add(file, [kind]);
      toast(`Added to ${docLabel(kind, [])}. It stays on this device.`);
    },
    [add, papers, remove, toast, update],
  );

  /**
   * Send one paper to the Document Agent as `kind` (the person said yes). Facts
   * come back as a review card; name and address go to this device only.
   * Returns a message for the person, or null when there was nothing to say.
   */
  const readOne = useCallback(
    async (paper: Paper, kind: string): Promise<string | null> => {
      const name = /\.(pdf|txt)$/i.test(paper.name) ? paper.name : `${paper.name}.pdf`;
      await whenIdle();
      const { error, identity, title } = await readPaper(new File([paper.blob], name, { type: paper.type }), kind);
      await whenIdle();
      if (error) return error;
      if (!identity.length) return null;
      const saved = await details.saveReadings(identity, title ?? sourceNoun(kind));
      if (saved.otherPerson) return `This paper is for ${saved.otherPerson}, not you, so we didn't keep its name or address.`;
      return null;
    },
    [details, readPaper, whenIdle],
  );


  /** "Build my profile from my papers": read every readable paper in turn, then show the review cards. */
  const readAll = async () => {
    // Every readable file once, as its own first readable kind (a lease that also
    // counts as proof of address is read as a lease). Papers no application lists,
    // like a household member's benefit letter, are read too.
    const queue = papers
      .filter(isReadable)
      .map((paper) => ({ paper, kind: paper.kinds.find((k) => READABLE_KINDS.has(k)) }))
      .filter((q): q is { paper: Paper; kind: string } => !!q.kind)
      .slice(0, 8);
    if (!queue.length) return toast("Add a PDF of a pay stub, lease, bill or ID first.");
    let problem: string | null = null;
    setReadingAll({ done: 0, total: queue.length });
    try {
      for (const [i, { paper, kind }] of queue.entries()) {
        problem = (await readOne(paper, kind)) ?? problem;
        setReadingAll({ done: i + 1, total: queue.length });
      }
    } finally {
      setReadingAll(null);
    }
    toast(problem ?? "Read and deleted from our server. Check what we found before we use it.");
  };

  const removeFor = async (row: Row) => {
    if (!row.paper) return;
    const rest = row.paper.kinds.filter((k) => k !== row.kind);
    if (rest.length) await update(row.paper, { kinds: rest });
    else await remove(row.paper.id);
    if (plan.docs.includes(row.kind)) toggleDoc(row.kind);
    toast("Removed from this device.");
  };

  const loadDemo = async () => {
    setLoadingDemo(true);
    try {
      for (const d of await loadDemoManifest()) {
        const name = demoName(d);
        if (papers.some((p) => p.demo && p.name === name)) continue;
        const res = await fetch(`${DEMO_BASE}/${d.pdf}`);
        if (!res.ok) continue;
        const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
        await add(blob, d.kinds, true, name);
      }
      toast("Demo papers added. They're fictional, and you can remove them any time.");
    } finally {
      setLoadingDemo(false);
    }
  };

  /** The fictional demo person's answers and form details, ready to paste. */
  const copySheet = async () => {
    try {
      const text = await fetch(`${DEMO_BASE}/profile-sheet.txt`).then((r) => r.text());
      await navigator.clipboard.writeText(text);
      toast("Demo profile copied. Paste it into the chat or a form.");
    } catch {
      window.open(`${DEMO_BASE}/profile-sheet.txt`, "_blank", "noopener");
    }
  };

  const onPageDrop = (e: DragEvent) => {
    setPageDrag(false);
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    enqueue(e.dataTransfer.files);
  };

  if (!snapshot) return null;
  const selectedRow = rows.find((r) => r.kind === selected) ?? null;
  const hasDemo = papers.some((p) => p.demo);
  const next = rows.find((r) => r.status === "needed");
  const unlisted = snapshot.programs.filter(
    (c) => c.program.guide?.no_documents_note && !docsFor(c.program).length && ["fit", "maybe", "later"].includes(toneOf(c)),
  );

  const sidebar: { id: Filter; label: string; count: string }[] = [
    { id: "all", label: "All papers", count: `${ready.length}/${rows.length}` },
    { id: "needed", label: "Still needed", count: String(rows.length - ready.length) },
    { id: "ready", label: "Ready", count: String(ready.length) },
  ];

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setPageDrag(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setPageDrag(false);
      }}
      onDrop={onPageDrop}
      className="relative"
    >
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-[7px] rounded-full bg-brand-soft py-[5px] pl-2 pr-[11px] text-[11px] font-extrabold text-brand-text">
            <Wallet aria-hidden className="size-3.5" /> Your papers
          </span>
          <h1 className="my-2 font-display text-[clamp(26px,3vw,34px)] font-extrabold leading-[1.12] tracking-[-0.04em]">Add each paper once. Use it everywhere.</h1>
          <p className="max-w-[620px] text-[14px] leading-[1.7] text-muted-foreground">
            Everything your applications ask for, in one place. Add a photo or file, or mark a paper copy you have at home. Files stay on this
            device.
          </p>
        </div>
        <button type="button" className={btn("primary")} onClick={() => picker.current?.click()}>
          <Plus aria-hidden className="size-4" /> Add a paper
        </button>
        <input
          ref={picker}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            enqueue(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <PaperReviews className="mb-5" />
      <MyDetails details={details.details} onConfirm={(d, v) => void details.confirm(d, v)} onRemove={(d) => void details.remove(d)} className="mb-5" />

      {!rows.length ? (
        <Panel className="text-[13px] leading-[1.7] text-muted-foreground">
          None of your current programs list documents. Programs that are open to everyone usually need nothing at all.
        </Panel>
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-card min-[900px]:grid min-[900px]:grid-cols-[230px_minmax(0,1fr)]">
          {/* Sidebar (Finder's locations) */}
          <nav aria-label="Show papers" className="border-b border-line bg-surface-2/70 p-3 min-[900px]:border-b-0 min-[900px]:border-r">
            <div className="min-[900px]:hidden">
              <label className="sr-only" htmlFor="doc-filter">
                Show papers
              </label>
              <select
                id="doc-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full rounded-[11px] border border-line bg-surface px-3 py-2.5 text-[14px] font-bold"
              >
                {sidebar.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.count})
                  </option>
                ))}
                {progs.map((c) => {
                  const r = readiness(c.program, plan);
                  return (
                    <option key={c.program.id} value={c.program.id}>
                      {shortName(c.program)} ({r.got}/{r.total})
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="hidden flex-col gap-0.5 min-[900px]:flex">
              {sidebar.map((s) => (
                <SideItem key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)} label={s.label} count={s.count} />
              ))}
              <p className="mb-1 mt-4 px-2.5 text-[10.5px] font-extrabold uppercase tracking-[1.4px] text-faint">Applications</p>
              {progs.map((c) => {
                const r = readiness(c.program, plan);
                return (
                  <button
                    key={c.program.id}
                    type="button"
                    aria-pressed={filter === c.program.id}
                    onClick={() => setFilter(c.program.id)}
                    className={cn(
                      "rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors",
                      filter === c.program.id ? "bg-brand-soft font-extrabold text-brand-text" : "hover:bg-surface",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-bold">{shortName(c.program)}</span>
                      <span className={cn("shrink-0 text-[11.5px] font-extrabold tabular-nums", r.got === r.total ? "text-brand-text" : "text-faint")}>
                        {r.got}/{r.total}
                      </span>
                    </span>
                    <ProgressBar value={r.got} total={r.total} className="mt-1.5 h-[4px]" />
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Main pane */}
          <section aria-label="Papers" className="min-w-0 p-4">
            {/* Toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="relative min-w-[180px] flex-1">
                <span className="sr-only">Search papers</span>
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search papers"
                  className="w-full rounded-[11px] border border-line bg-surface-2 py-2 pl-9 pr-3 text-[13.5px] outline-none focus:border-brand"
                />
              </label>
              <div role="group" aria-label="View" className="flex rounded-[11px] border border-line bg-surface-2 p-0.5">
                {(["grid", "list"] as const).map((v) => {
                  const Icon = v === "grid" ? LayoutGrid : List;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      aria-label={v === "grid" ? "Show as icons" : "Show as a list"}
                      onClick={() => chooseView(v)}
                      className={cn("grid size-8 place-items-center rounded-[9px]", view === v ? "bg-surface text-ink shadow-card" : "text-faint hover:text-ink")}
                    >
                      <Icon aria-hidden className="size-4" />
                    </button>
                  );
                })}
              </div>
              <label className="relative">
                <span className="sr-only">Sort</span>
                <ArrowUpDown aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="appearance-none rounded-[11px] border border-line bg-surface-2 py-2 pl-8 pr-3 text-[13px] font-bold"
                >
                  <option value="needed">Still needed first</option>
                  <option value="used">Used by most</option>
                  <option value="name">Name</option>
                </select>
              </label>
              {papers.some((p) => isReadable(p) && p.kinds.some((k) => READABLE_KINDS.has(k))) ? (
                <button type="button" className={btn("ghost", "sm")} disabled={!!readingAll || working} onClick={() => void readAll()}>
                  <FileSearch aria-hidden className="size-4" />{" "}
                  {readingAll ? `Reading ${readingAll.done + 1 > readingAll.total ? readingAll.total : readingAll.done + 1} of ${readingAll.total}…` : "Build my profile from my papers"}
                </button>
              ) : null}
              {!hasDemo ? (
                <button type="button" className={btn("ghost", "sm")} disabled={loadingDemo} onClick={() => void loadDemo()}>
                  <Sparkles aria-hidden className="size-4" /> {loadingDemo ? "Adding…" : "Use demo papers"}
                </button>
              ) : (
                <button type="button" className={btn("ghost", "sm")} onClick={() => void copySheet()}>
                  <ClipboardCopy aria-hidden className="size-4" /> Copy demo profile
                </button>
              )}
            </div>

            {/* Progress */}
            <div className="mb-4 flex items-center gap-3 rounded-[14px] bg-surface-2 px-3.5 py-2.5">
              <ProgressBar value={ready.length} total={rows.length} className="h-[6px] max-w-[160px] flex-1" />
              <p className="text-[12.5px]">
                <strong>
                  {ready.length} of {rows.length} ready
                </strong>
                <span className="text-muted-foreground">{next ? ` · Next: ${next.label}` : " · You have everything your applications list."}</span>
              </p>
            </div>

            {shown.length ? (
              view === "grid" ? (
                <PaperGrid rows={shown} selected={selected} onOpen={setSelected} onDropFile={(k, f) => void attach(k, f)} />
              ) : (
                <PaperList rows={shown} selected={selected} onOpen={setSelected} onDropFile={(k, f) => void attach(k, f)} />
              )
            ) : (
              <div className="grid place-items-center gap-2 py-12 text-center text-[13px] text-muted-foreground">
                <FolderOpen aria-hidden className="size-8 text-faint" />
                {query ? "No papers match that search." : filter === "needed" ? "Nothing left to find here." : "Nothing here yet."}
              </div>
            )}

            <p className="mt-4 flex items-center gap-2 text-[12px] text-faint">
              <Upload aria-hidden className="size-3.5" /> Tip: drag a file onto any paper, or anywhere on this page.
            </p>
          </section>
        </div>
      )}

      {unlisted.length ? (
        <Panel className="mt-5">
          <div className="mb-1 flex items-baseline justify-between gap-2.5">
            <h2 className="text-[15px] font-extrabold">Ask about documents on your call</h2>
            <span className="text-xs text-faint">Not listed by the provider</span>
          </div>
          {unlisted.map((c) => (
            <div key={c.program.id} className="flex items-center justify-between gap-2.5 border-t border-line py-2.5 text-[12.5px] first-of-type:border-t-0">
              <div className="min-w-0">
                <strong>{shortName(c.program)}</strong>
                <small className="block text-[11.5px] leading-normal text-muted-foreground">{c.program.guide?.no_documents_note}</small>
              </div>
              <Link href={`/benefits/${c.program.guide!.slug}`} className={btn("link")}>
                Guide <ArrowRight aria-hidden />
              </Link>
            </div>
          ))}
        </Panel>
      ) : null}

      <LoopTrace trace={snapshot.trace} className="mt-5" />

      {/* Drop anywhere */}
      <AnimatePresence>
        {pageDrag ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-brand/10 backdrop-blur-[1px]"
          >
            <div className="rounded-[20px] border-2 border-dashed border-brand bg-surface px-8 py-6 text-center shadow-card">
              <Upload aria-hidden className="mx-auto mb-2 size-7 text-brand-text" />
              <p className="text-[15px] font-extrabold">Drop to add a paper</p>
              <p className="text-[12.5px] text-muted-foreground">You&apos;ll pick what each one is next.</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedRow ? (
          <InfoPanel
            key={selectedRow.kind}
            row={selectedRow}
            onClose={() => setSelected(null)}
            onFile={(f) => void attach(selectedRow.kind, f)}
            onRemove={() => void removeFor(selectedRow)}
            onTogglePaperCopy={() => toggleDoc(selectedRow.kind)}
            onRead={async () => {
              if (!selectedRow.paper) return;
              toast((await readOne(selectedRow.paper, selectedRow.kind)) ?? "Read and deleted from our server. Check what we found at the top of this page.");
            }}
          />
        ) : null}
      </AnimatePresence>

      {/* A closing dialog stays answered (see WhatIsThis), so the next one can open on top at once. */}
      <AnimatePresence>
        {pending ? (
          <WhatIsThis
            key={`${pending.name}-${queued.length}`}
            file={pending}
            position={queued.length > 1 ? `1 of ${queued.length}` : null}
            options={[
              ...rows.map((r) => ({ kind: r.kind, label: r.label, status: r.status })),
              // Not on any application's list, but it counts toward household income.
              ...(rows.some((r) => r.kind === "member_income")
                ? []
                : [{ kind: "member_income", label: "Income of someone else at home (like a benefit letter)", status: "needed" as const }]),
            ]}
            onCancel={() => setQueued((q) => q.slice(1))}
            onPick={(kind) => {
              const f = pending;
              const last = queued.length === 1;
              setQueued((q) => q.slice(1));
              void attach(kind, f);
              if (last && rows.some((r) => r.kind === kind)) setSelected(kind);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SideItem({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors",
        active ? "bg-brand-soft font-extrabold text-brand-text" : "font-bold hover:bg-surface",
      )}
    >
      <span>{label}</span>
      <span className="text-[11.5px] font-extrabold tabular-nums text-faint">{count}</span>
    </button>
  );
}

/** After a file is picked or dropped on the page: which paper is it? A guess from its name comes first. */
function WhatIsThis({
  file,
  position,
  options,
  onCancel,
  onPick,
}: {
  file: File;
  /** "1 of 3" when several files were added at once. */
  position: string | null;
  options: { kind: string; label: string; status: Row["status"] }[];
  onCancel: () => void;
  onPick: (kind: string) => void;
}) {
  const guess = guessKind(file.name, options.map((o) => o.kind));
  // Answer once: a double click (or a click while closing) must not add the file twice.
  const answered = useRef(false);
  const once = <T,>(fn: (arg: T) => void) => (arg: T) => {
    if (answered.current) return;
    answered.current = true;
    fn(arg);
  };
  const cancel = once<void>(() => onCancel());
  const choose = once<string>((kind) => onPick(kind));
  const [pick, setPick] = useState(guess ?? options.find((o) => o.status === "needed")?.kind ?? options[0]?.kind ?? "");
  const ordered = [...options].sort((a, b) => Number(b.kind === guess) - Number(a.kind === guess) || Number(a.status !== "needed") - Number(b.status !== "needed"));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel]);
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && cancel()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="What is this paper?"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        className="relative max-h-[86vh] w-[min(460px,100%)] overflow-y-auto rounded-[22px] border border-line bg-surface p-5 shadow-card"
      >
        <button type="button" onClick={() => cancel()} aria-label="Cancel" className="absolute right-3.5 top-3.5 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-2">
          <X aria-hidden className="size-4" />
        </button>
        <h2 className="text-[17px] font-extrabold">
          What is this paper?{position ? <span className="ml-2 text-[12px] font-bold text-faint">{position}</span> : null}
        </h2>
        <p className="mb-3 mt-1 truncate text-[12.5px] text-muted-foreground">{file.name}</p>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="sr-only">Kind of paper</legend>
          {ordered.map((o) => (
            <label
              key={o.kind}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[12px] border px-3 py-2.5 text-[13.5px]",
                pick === o.kind ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2",
              )}
            >
              <input type="radio" name="kind" checked={pick === o.kind} onChange={() => setPick(o.kind)} className="accent-[var(--brand)]" />
              <span className="flex-1 font-bold">{o.label}</span>
              {o.kind === guess ? <span className="rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-extrabold text-on-brand">Looks like this</span> : null}
              {o.status !== "needed" ? <span className="text-[11px] font-bold text-faint">Replaces current</span> : null}
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={btn("ghost", "sm")} onClick={() => cancel()}>
            {position ? "Skip this one" : "Cancel"}
          </button>
          <button type="button" className={btn("primary", "sm")} disabled={!pick} onClick={() => choose(pick)}>
            Add it
          </button>
        </div>
        <p className="mt-3 text-[11.5px] text-faint">It stays on this device. Nothing is uploaded.</p>
      </motion.div>
    </motion.div>
  );
}
