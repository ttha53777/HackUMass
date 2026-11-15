"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useDetails, type Detail } from "@/components/documents/details-store";
import { READABLE_KINDS } from "@/components/documents/info-panel";
import { DEMO_BASE, demoName, isReadable, loadDemoManifest, MAX_BYTES, usePapers, type DemoPaper, type Paper } from "@/components/documents/paper-store";
import { docLabel, sourceNoun } from "@/components/od/doc-kinds";
import { usePlan } from "@/components/session/plan-state";
import { useApp } from "@/components/session/session-provider";

const HELPER_KEY = "od.helper";
const LOG_KEY = "od.helperlog";

/** One run of the form helper, for "What the helper did". Counts and names only, never values. */
export type HelperLogEntry = {
  programId: string;
  title: string;
  at: string;
  /** Steps the assistant took on the form. */
  actions: number;
  /** Confirmed details sent for that run. */
  details: number;
  outcome: "submitted" | "not_submitted" | "unclear" | "stopped";
};

function readLog(sessionId: string): HelperLogEntry[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(LOG_KEY) ?? "null") as { sessionId?: string; entries?: HelperLogEntry[] } | null;
    return raw?.sessionId === sessionId && Array.isArray(raw.entries) ? raw.entries.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function readHelper(): boolean {
  try {
    return window.localStorage.getItem(HELPER_KEY) === "1";
  } catch {
    return false;
  }
}

export type ReadOutcome = {
  /** A message for the person when something went wrong, else null. */
  error: string | null;
  /** The pending review the read produced (its document id), if any. */
  reviewId: string | null;
  /** Identity details kept on this device from this paper. */
  identity: number;
  /** The paper names someone else in the household; nothing personal was kept. */
  otherPerson: string | null;
};

type PapersController = {
  papers: Paper[];
  loaded: boolean;
  details: Detail[];
  /** The saved file that counts as this kind, if any. */
  paperFor: (kind: string) => Paper | undefined;
  /** Keep a file as this kind (replacing an earlier one), and count the kind as ready. */
  keep: (file: Blob, kind: string, options?: { demo?: boolean; name?: string; kinds?: string[] }) => Promise<Paper | null>;
  /** Send one saved paper to the Document Agent as `kind`. Facts come back as a review card. */
  read: (paper: Paper, kind: string) => Promise<ReadOutcome>;
  /** Forget this kind's file and stop counting the kind as ready. */
  removeKind: (kind: string) => Promise<void>;
  canRead: (paper: Paper, kind: string) => boolean;
  /** The fictional demo papers that count as this kind (or all, with null). */
  demos: (kind: string | null) => Promise<DemoPaper[]>;
  /** Fetch a demo paper's PDF. */
  demoBlob: (d: DemoPaper) => Promise<Blob | null>;
  /** The form helper may use saved papers and details to fill forms (device setting). */
  helper: boolean;
  setHelper: (on: boolean) => void;
  setHelperRead: (paper: Paper, on: boolean) => Promise<void>;
  confirmDetail: (detail: Detail, value?: string) => Promise<void>;
  log: HelperLogEntry[];
  addLog: (entry: HelperLogEntry) => void;
  /** Remove every paper and detail of the current session (the demo cleans up with this). */
  clearAll: () => Promise<void>;
  removeDetail: (detail: Detail) => Promise<void>;
};

const Ctx = createContext<PapersController | null>(null);

/**
 * The person's papers on this device (IndexedDB, per session) and the identity details read
 * from them. A paper is sent to the server only when it is read, and the server deletes it after.
 * Keeps the plan's "have it" list in step: a saved file means that kind is ready.
 */
export function PapersProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const sessionId = app.snapshot?.session_id ?? null;
  const { plan, toggleDoc } = usePlan();
  const store = usePapers(sessionId);
  const details = useDetails(sessionId);
  const [helper, setHelperState] = useState(false);
  const [log, setLog] = useState<HelperLogEntry[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    setHelperState(readHelper());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    if (sessionId) setLog(readLog(sessionId));
  }, [sessionId]);

  const addLog = useCallback(
    (entry: HelperLogEntry) => {
      if (!sessionId) return;
      setLog((cur) => {
        const next = [entry, ...cur].slice(0, 20);
        if (app.demo) return next; // a demo run is never kept on the device
        try {
          window.localStorage.setItem(LOG_KEY, JSON.stringify({ sessionId, entries: next }));
        } catch {
          // ignore: the log still shows for this visit
        }
        return next;
      });
    },
    [sessionId, app.demo],
  );

  // Latest snapshot, readable after awaiting a read.
  const latest = useRef(app);
  useEffect(() => {
    latest.current = app;
  });

  // A saved file counts its kinds as ready.
  useEffect(() => {
    for (const p of store.papers) for (const k of p.kinds) if (!plan.docs.includes(k)) toggleDoc(k);
  }, [store.papers, plan.docs, toggleDoc]);

  const paperFor = useCallback((kind: string) => store.papers.find((p) => p.kinds.includes(kind)), [store.papers]);

  const keep = useCallback<PapersController["keep"]>(
    async (file, kind, options = {}) => {
      if (file.size > MAX_BYTES) return null;
      const existing = store.papers.find((p) => p.kinds.includes(kind));
      if (existing) {
        const rest = existing.kinds.filter((k) => k !== kind);
        if (rest.length) await store.update(existing, { kinds: rest });
        else await store.remove(existing.id);
      }
      const name = options.name ?? (file as File).name ?? `${docLabel(kind, [])}.pdf`;
      return store.add(file, options.kinds ?? [kind], !!options.demo, name);
    },
    [store],
  );

  const read = useCallback<PapersController["read"]>(
    async (paper, kind) => {
      const { readPaper, whenIdle } = latest.current;
      const before = new Set((latest.current.snapshot?.pending_reviews ?? []).map((r) => r.document_id));
      const name = /\.(pdf|txt)$/i.test(paper.name) ? paper.name : `${paper.name}.pdf`;
      await whenIdle();
      const { error, identity, title } = await readPaper(new File([paper.blob], name, { type: paper.type }), kind);
      await whenIdle();
      if (error) return { error, reviewId: null, identity: 0, otherPerson: null };
      // Let React commit the new snapshot before looking for the new review card.
      await new Promise((r) => setTimeout(r, 60));
      const review = (latest.current.snapshot?.pending_reviews ?? []).find((r) => !before.has(r.document_id) && !r.simulated);
      let otherPerson: string | null = null;
      if (identity.length) {
        const saved = await details.saveReadings(identity, title ?? sourceNoun(kind));
        otherPerson = saved.otherPerson;
      }
      return { error: null, reviewId: review?.document_id ?? null, identity: otherPerson ? 0 : identity.length, otherPerson };
    },
    [details],
  );

  const removeKind = useCallback(
    async (kind: string) => {
      const existing = store.papers.find((p) => p.kinds.includes(kind));
      if (existing) {
        const rest = existing.kinds.filter((k) => k !== kind);
        if (rest.length) await store.update(existing, { kinds: rest });
        else await store.remove(existing.id);
      }
      if (plan.docs.includes(kind)) toggleDoc(kind);
    },
    [store, plan.docs, toggleDoc],
  );

  const canRead = useCallback((paper: Paper, kind: string) => isReadable(paper) && READABLE_KINDS.has(kind), []);

  const demos = useCallback(async (kind: string | null) => {
    const all = await loadDemoManifest();
    return kind ? all.filter((d) => d.kinds.includes(kind)) : all;
  }, []);

  const demoBlob = useCallback(async (d: DemoPaper) => {
    try {
      const res = await fetch(`${DEMO_BASE}/${d.pdf}`);
      if (!res.ok) return null;
      const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
      return new File([blob], demoName(d), { type: "application/pdf" });
    } catch {
      return null;
    }
  }, []);

  const setHelper = useCallback((on: boolean) => {
    setHelperState(on);
    try {
      if (on) window.localStorage.setItem(HELPER_KEY, "1");
      else window.localStorage.removeItem(HELPER_KEY);
    } catch {
      // ignore: the switch still works for this visit
    }
  }, []);

  const clearAll = useCallback(async () => {
    for (const p of store.papers) await store.remove(p.id);
    for (const d of details.details) await details.remove(d);
  }, [store, details]);

  const setHelperRead = useCallback((paper: Paper, on: boolean) => store.update(paper, { helperOff: !on }), [store]);

  const value = useMemo<PapersController>(
    () => ({
      papers: store.papers,
      loaded: store.loaded,
      details: details.details,
      paperFor,
      keep,
      read,
      removeKind,
      canRead,
      demos,
      demoBlob,
      helper,
      setHelper,
      setHelperRead,
      confirmDetail: details.confirm,
      removeDetail: details.remove,
      log,
      addLog,
      clearAll,
    }),
    [store.papers, store.loaded, details, paperFor, keep, read, removeKind, canRead, demos, demoBlob, helper, setHelper, setHelperRead, log, addLog, clearAll],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePapersHub(): PapersController {
  const value = useContext(Ctx);
  if (!value) throw new Error("usePapersHub must be used inside PapersProvider");
  return value;
}
