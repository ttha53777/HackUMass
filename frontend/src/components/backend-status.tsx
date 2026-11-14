"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { HealthOut } from "@/lib/types";

type State =
  | { kind: "checking" }
  | { kind: "ok"; health: HealthOut }
  | { kind: "down" };

/** Scaffold-only check that the /api proxy reaches FastAPI. */
export function BackendStatus() {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((res) => (res.ok ? (res.json() as Promise<HealthOut>) : Promise.reject()))
      .then((health) => !cancelled && setState({ kind: "ok", health }))
      .catch(() => !cancelled && setState({ kind: "down" }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "checking") {
    return <Badge variant="outline">Checking backend…</Badge>;
  }
  if (state.kind === "down") {
    return (
      <Badge variant="destructive" role="status">
        Backend not reachable — start it on port 8000
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" role="status">
      Backend connected · model mode: {state.health.llm_mode}
    </Badge>
  );
}
