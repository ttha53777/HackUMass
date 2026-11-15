"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { Paper } from "@/components/documents/paper-store";
import { usePapersHub } from "@/components/hub/papers-context";
import { useApp } from "@/components/session/session-provider";
import {
  FILLER_TYPES,
  addFillerPaper,
  confirmDetails,
  forgetDetail,
  getFillerState,
  grantPaper,
  kindHint,
  removeFillerPaper,
  revokePaper,
  setAutoRead,
  type FillerPaper,
  type FillerScope,
  type FillerState,
} from "@/lib/filler";

const POLL_MS = 800;
const linkKey = (sessionId: string) => `od-filler-links:${sessionId}`;

function readLinks(sessionId: string): Record<string, string> {
  try {
    return JSON.parse(window.sessionStorage.getItem(linkKey(sessionId)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeLinks(sessionId: string, links: Record<string, string>) {
  try {
    window.sessionStorage.setItem(linkKey(sessionId), JSON.stringify(links));
  } catch {
    // ignore: the links still hold for this page
  }
}

type FillerController = {
  /** null while checking; false when this backend has no Filler (then the v1 helper shows). */
  enabled: boolean | null;
  state: FillerState | null;
  error: string | null;
  /** The Filler's copy of a saved paper, once it has been sent. */
  paperFor: (paper: Paper) => FillerPaper | undefined;
  setAutoRead: (on: boolean, scopes: FillerScope[]) => Promise<void>;
  setPaperRead: (paper: Paper, on: boolean, scopes?: FillerScope[]) => Promise<void>;
  confirmAll: () => Promise<void>;
  editDetail: (key: string, value: string) => Promise<string | null>;
  forget: (key: string) => Promise<void>;
};

const Ctx = createContext<FillerController | null>(null);

/**
 * Keeps the Filler in step with the papers saved on this device: each PDF or photo is sent
 * once (it is read only if auto-read is on or its own switch is), a removed paper is removed
 * there too, and the state is polled while papers are being read.
 */
export function FillerProvider({ children }: { children: ReactNode }) {
  const sessionId = useApp().snapshot?.session_id ?? null;
  const papers = usePapersHub();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [state, setState] = useState<FillerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const sending = useRef(new Set<string>());

  const apply = useCallback((next: FillerState) => {
    setState(next);
    setError(null);
  }, []);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
  }, []);

  // Is the Filler here? Load this session's state and links.
  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tab storage is only readable after mount
    setLinks(readLinks(sessionId));
    getFillerState(sessionId)
      .then((s) => {
        if (!live) return;
        setEnabled(s !== null);
        if (s) setState(s);
      })
      .catch(() => live && setEnabled(false));
    return () => {
      live = false;
    };
  }, [sessionId]);

  const link = useCallback(
    (localId: string, fillerId: string | null) => {
      if (!sessionId) return;
      setLinks((cur) => {
        const next = { ...cur };
        if (fillerId) next[localId] = fillerId;
        else delete next[localId];
        writeLinks(sessionId, next);
        return next;
      });
    },
    [sessionId],
  );

  // Links the server still knows; a stale one (its state expired) just counts as unlinked.
  const live = useMemo(() => {
    const known = new Set((state?.papers ?? []).map((p) => p.paper_id));
    return Object.fromEntries(Object.entries(links).filter(([, id]) => known.has(id)));
  }, [links, state]);

  // Send new papers, and remove the Filler's copy of papers deleted on this device.
  useEffect(() => {
    if (!enabled || !sessionId || !state || !papers.loaded) return;
    for (const [localId, fillerId] of Object.entries(live)) {
      if (papers.papers.some((p) => p.id === localId) || sending.current.has(localId)) continue;
      sending.current.add(localId);
      removeFillerPaper(sessionId, fillerId)
        .then((next) => {
          link(localId, null);
          apply(next);
        })
        .catch(fail)
        .finally(() => sending.current.delete(localId));
    }
    for (const paper of papers.papers) {
      if (live[paper.id] || !FILLER_TYPES.has(paper.type) || sending.current.has(paper.id)) continue;
      sending.current.add(paper.id);
      addFillerPaper(sessionId, paper.blob, paper.name, kindHint(paper.kinds))
        .then((next) => {
          if (next.paper_id) link(paper.id, next.paper_id);
          apply(next);
        })
        .catch(fail)
        .finally(() => sending.current.delete(paper.id));
    }
  }, [enabled, sessionId, state, papers.loaded, papers.papers, live, link, apply, fail]);

  // Poll while anything is being read.
  const busy = !!state?.papers.some((p) => p.status === "queued" || p.status === "reading");
  useEffect(() => {
    if (!busy || !sessionId) return;
    const timer = window.setInterval(() => {
      getFillerState(sessionId).then((s) => s && apply(s)).catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [busy, sessionId, apply]);

  const paperFor = useCallback(
    (paper: Paper) => {
      const id = live[paper.id];
      return id ? state?.papers.find((p) => p.paper_id === id) : undefined;
    },
    [live, state],
  );

  const value = useMemo<FillerController>(() => {
    const run = async (call: () => Promise<FillerState>) => {
      try {
        apply(await call());
      } catch (e) {
        fail(e);
      }
    };
    return {
      enabled,
      state,
      error,
      paperFor,
      setAutoRead: (on, scopes) => (sessionId ? run(() => setAutoRead(sessionId, on, scopes)) : Promise.resolve()),
      setPaperRead: async (paper, on, scopes) => {
        const id = live[paper.id];
        if (!sessionId || !id) return;
        await run(() => (on ? grantPaper(sessionId, id, scopes ?? null) : revokePaper(sessionId, id)));
      },
      confirmAll: () => (sessionId ? run(() => confirmDetails(sessionId)) : Promise.resolve()),
      editDetail: async (key, raw) => {
        if (!sessionId) return null;
        try {
          apply(await confirmDetails(sessionId, [], { [key]: raw }));
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : "That doesn't look right.";
        }
      },
      forget: (key) => (sessionId ? run(() => forgetDetail(sessionId, key)) : Promise.resolve()),
    };
  }, [enabled, state, error, paperFor, sessionId, live, apply, fail]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFiller(): FillerController {
  const value = useContext(Ctx);
  if (!value) throw new Error("useFiller must be used inside FillerProvider");
  return value;
}
