"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useApp } from "@/components/session/session-provider";
import type { Kind } from "@/lib/hub-derive";

export type Sheet =
  | { type: "needs" }
  | { type: "answers"; edit: string | null }
  /** Add a paper. `kind` is the kind asked for; null lets the person pick. */
  | { type: "upload"; kind: string | null }
  /** One kind of paper in the wallet. */
  | { type: "paper"; kind: string }
  /** Full-screen "show this at the counter" for these kinds. */
  | { type: "counter"; kinds: string[] }
  /** Check what was read from papers or the bank. */
  | { type: "review" }
  | { type: "bank" };

type HubController = {
  sheet: Sheet | null;
  openSheet: (sheet: Sheet) => void;
  closeSheet: () => void;
  /** The program spotlight (a program id), over everything else. */
  spot: string | null;
  openSpot: (id: string) => void;
  closeSpot: () => void;
  /** Government / Local filter; null shows both. */
  kind: Kind | null;
  setKind: (kind: Kind | null) => void;
  /** "Show what helps with" filter: a need id, or null. */
  need: string | null;
  setNeed: (need: string | null) => void;
};

const Ctx = createContext<HubController | null>(null);

/**
 * What the Plan Hub has open: one drawer at a time, the program spotlight, the plan's filters.
 * Old dashboard URLs arrive as query params (next.config.ts redirects): ?sheet=answers|needs|bank
 * opens a drawer, ?show=gov|local presets the filter, ?guide=<slug> or ?spot=<program id> opens a
 * program. They are read once the snapshot is in, then dropped from the URL.
 */
export function HubProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [spot, setSpot] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [need, setNeed] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { snapshot } = useApp();
  const ready = !!snapshot;

  useEffect(() => {
    const wanted = params.get("sheet");
    const show = params.get("show");
    const guide = params.get("guide");
    const program = params.get("spot");
    if (!wanted && !show && !guide && !program) return;
    if (!ready || !snapshot) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of a deep link */
    if (wanted === "answers") setSheet({ type: "answers", edit: null });
    if (wanted === "needs") setSheet({ type: "needs" });
    if (wanted === "bank") setSheet({ type: "bank" });
    if (show === "gov" || show === "local") setKind(show);
    const id = program ?? snapshot.programs.find((c) => c.program.guide?.slug === guide)?.program.id ?? null;
    if (id && snapshot.programs.some((c) => c.program.id === id)) setSpot(id);
    /* eslint-enable react-hooks/set-state-in-effect */
    router.replace(path, { scroll: false });
  }, [params, router, path, ready, snapshot]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const openSheet = useCallback((next: Sheet) => {
    setSpot(null);
    setSheet(next);
  }, []);
  const openSpot = useCallback((id: string) => {
    setSheet(null);
    setSpot(id);
  }, []);
  const closeSpot = useCallback(() => setSpot(null), []);

  const value = useMemo<HubController>(
    () => ({ sheet, openSheet, closeSheet, spot, openSpot, closeSpot, kind, setKind, need, setNeed }),
    [sheet, openSheet, closeSheet, spot, openSpot, closeSpot, kind, need],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHub(): HubController {
  const value = useContext(Ctx);
  if (!value) throw new Error("useHub must be used inside HubProvider");
  return value;
}
