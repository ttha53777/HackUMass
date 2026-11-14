"use client";

// Papers the person adds, kept in this browser only (IndexedDB), per session.
// Never sent anywhere, except one file when the person taps "Read this for me".
// Every access is wrapped: storage can be blocked (private windows), and the page
// then keeps papers in memory for this visit.
import { useCallback, useEffect, useState } from "react";

export type Paper = {
  id: string;
  sessionId: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
  /** Kinds of paper this file counts as (keys of DOC_LABEL, or program-specific kinds). */
  kinds: string[];
  /** One of the fictional demo papers. */
  demo: boolean;
  blob: Blob;
};

export const MAX_BYTES = 10 * 1024 * 1024;
export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.svg,application/pdf,image/*";

const DB = "opendoor-papers";
const STORE = "papers";
const memory = new Map<string, Paper>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("session", "sessionId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function listPapers(sessionId: string): Promise<Paper[]> {
  const stored = await run<Paper[]>("readonly", (s) => s.index("session").getAll(sessionId));
  const fromMemory = [...memory.values()].filter((p) => p.sessionId === sessionId);
  const all = [...(stored ?? []), ...fromMemory.filter((m) => !(stored ?? []).some((p) => p.id === m.id))];
  return all.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

async function putPaper(paper: Paper): Promise<void> {
  const ok = await run("readwrite", (s) => s.put(paper));
  if (ok === null) memory.set(paper.id, paper);
}

async function deletePaper(id: string): Promise<void> {
  memory.delete(id);
  await run("readwrite", (s) => s.delete(id));
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The person's papers for this session, with add, update and remove. */
export function usePapers(sessionId: string | null) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setPapers(await listPapers(sessionId));
    setLoaded(true);
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after mount
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (file: Blob & { name?: string }, kinds: string[], demo = false, name?: string) => {
      if (!sessionId) return null;
      const paper: Paper = {
        id: newId(),
        sessionId,
        name: name ?? file.name ?? "Untitled",
        type: file.type || "application/octet-stream",
        size: file.size,
        addedAt: new Date().toISOString(),
        kinds,
        demo,
        blob: file,
      };
      await putPaper(paper);
      await refresh();
      return paper;
    },
    [sessionId, refresh],
  );

  const update = useCallback(
    async (paper: Paper, change: Partial<Pick<Paper, "kinds" | "name">>) => {
      await putPaper({ ...paper, ...change });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deletePaper(id);
      await refresh();
    },
    [refresh],
  );

  return { papers, loaded, add, update, remove };
}

/** Guess what kind of paper a file is from its name. A suggestion only; the person picks. */
const NAME_HINTS: [RegExp, string][] = [
  [/pay ?stub|paystub|pay[-_ ]?slip|w-?2|1099|earning|income|salary|wage|benefit letter|award letter/i, "income"],
  [/lease|rental agreement|tenancy/i, "lease"],
  [/electric|gas bill|utility|heat|eversource|oil|energy|water bill/i, "heat"],
  [/shut ?off|disconnect(ion)? notice/i, "shutoff"],
  [/licen[cs]e|passport|photo ?id|id ?card|state ?id|\bid\b/i, "id"],
  [/birth|dob|household members/i, "dob"],
  [/address|residen(ce|cy)|mail/i, "address"],
  [/green ?card|visa|citizen|naturali[sz]|immigration|i-?94|i-?551/i, "status"],
  [/mortgage|property tax|homeowner/i, "owner"],
  [/financial aid|award|fafsa/i, "aid"],
  [/umass|ucard|student id/i, "umass"],
  [/court|eviction|notice to quit/i, "notices"],
];

export function guessKind(fileName: string, available: string[]): string | null {
  for (const [pattern, kind] of NAME_HINTS) if (pattern.test(fileName) && available.includes(kind)) return kind;
  return null;
}

/** The fictional demo papers in public/demo-papers/ and what each counts as. */
export const DEMO_PAPERS: { file: string; name: string; type: string; kinds: string[]; readable?: boolean }[] = [
  { file: "pay-stub.pdf", name: "Pay stub (sample).pdf", type: "application/pdf", kinds: ["income"], readable: true },
  { file: "lease.pdf", name: "Lease (sample).pdf", type: "application/pdf", kinds: ["lease", "address"] },
  { file: "utility-bill.pdf", name: "Electric bill (sample).pdf", type: "application/pdf", kinds: ["heat", "address"] },
  { file: "photo-id.svg", name: "Photo ID (sample).svg", type: "image/svg+xml", kinds: ["id"] },
  { file: "proof-of-address.pdf", name: "Address letter (sample).pdf", type: "application/pdf", kinds: ["address"] },
  { file: "household-birth-dates.pdf", name: "Household birth dates (sample).pdf", type: "application/pdf", kinds: ["dob"] },
];

export const isReadable = (p: Pick<Paper, "type" | "name">) =>
  p.type === "application/pdf" || p.type === "text/plain" || /\.(pdf|txt)$/i.test(p.name);

export function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
