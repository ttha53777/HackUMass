"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { Kind } from "@/lib/hub-derive";

export type Sheet = { type: "needs" } | { type: "answers"; edit: string | null };

type HubController = {
  sheet: Sheet | null;
  openSheet: (sheet: Sheet) => void;
  closeSheet: () => void;
  /** Government / Local filter; null shows both. */
  kind: Kind | null;
  setKind: (kind: Kind | null) => void;
  /** "Show what helps with" filter: a need id, or null. */
  need: string | null;
  setNeed: (need: string | null) => void;
  /** A slim row opened into a full card. */
  expanded: string | null;
  setExpanded: (id: string | null) => void;
};

const Ctx = createContext<HubController | null>(null);

/**
 * What the Plan Hub has open: one drawer at a time, the plan's filters, an expanded row.
 * Old dashboard URLs arrive as query params (next.config.ts redirects): ?sheet=answers
 * opens My answers, ?show=gov|local presets the filter. They are read once, then dropped.
 */
export function HubProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [need, setNeed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    const wanted = params.get("sheet");
    const show = params.get("show");
    if (!wanted && !show && !params.has("guide")) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of a deep link */
    if (wanted === "answers") setSheet({ type: "answers", edit: null });
    if (wanted === "needs") setSheet({ type: "needs" });
    if (show === "gov" || show === "local") setKind(show);
    /* eslint-enable react-hooks/set-state-in-effect */
    router.replace(path, { scroll: false });
  }, [params, router, path]);

  const closeSheet = useCallback(() => setSheet(null), []);

  const value = useMemo<HubController>(
    () => ({ sheet, openSheet: setSheet, closeSheet, kind, setKind, need, setNeed, expanded, setExpanded }),
    [sheet, closeSheet, kind, need, expanded],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHub(): HubController {
  const value = useContext(Ctx);
  if (!value) throw new Error("useHub must be used inside HubProvider");
  return value;
}
