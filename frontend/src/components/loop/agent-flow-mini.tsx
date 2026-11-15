"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CircleCheck,
  CornerDownLeft,
  Diamond,
  Pin,
  PinOff,
  Repeat,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { Panel } from "@/components/od/ui";
import { useApp } from "@/components/session/session-provider";
import { useApiEvents, type ApiEvent } from "@/lib/api-events";
import type { TraceEventView } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CHIP } from "./loop-trace";
import { agentLabel, apiCaption, describe, flowCaption, speaker } from "./templates";

// ---------------------------------------------------------------------------
// Demo switch: ?demo=1 turns the panel on (remembered on this device), ?demo=0 off.
// ---------------------------------------------------------------------------

const DEMO_KEY = "crn.demo";

function readDemo(): boolean {
  const flag = new URLSearchParams(window.location.search).get("demo");
  try {
    if (flag === "1") window.localStorage.setItem(DEMO_KEY, "1");
    else if (flag === "0") window.localStorage.removeItem(DEMO_KEY);
    return window.localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return flag === "1";
  }
}

function subscribeLocation(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

/** True once `?demo=1` has been seen on this device. Always false on the server. */
export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribeLocation, readDemo, () => false);
}

// ---------------------------------------------------------------------------
// The feed: API calls and trace steps, queued and replayed at a readable pace.
// ---------------------------------------------------------------------------

type FlowItem = { key: string } & ({ kind: "api"; api: ApiEvent } | { kind: "trace"; event: TraceEventView });

const MIN_SHOW_MS = 450;
const MAX_ROWS = 9;
/** API calls this recent when the panel mounts are still part of "now". */
const RECENT_MS = 2000;

/**
 * Turns new API events and new trace events (diffed by `seq`) into a queue and
 * reveals one every MIN_SHOW_MS (all at once with reduced motion). It only slows
 * the replay; it never shows a step the backend hasn't reported.
 */
type Replay = {
  queue: FlowItem[];
  timer: number | null;
  lastShownAt: number;
};

/** Reveal the next queued row once it has waited its turn, then keep going. */
function pump(r: Replay, gap: number, reveal: (rows: FlowItem[]) => void) {
  if (r.timer !== null || !r.queue.length) return;
  const wait = Math.max(0, r.lastShownAt + gap - Date.now());
  r.timer = window.setTimeout(() => {
    r.timer = null;
    const next = gap ? r.queue.splice(0, 1) : r.queue.splice(0);
    r.lastShownAt = Date.now();
    reveal(next);
    pump(r, gap, reveal);
  }, wait);
}

function useAgentFlow(trace: TraceEventView[], reduced: boolean) {
  const api = useApiEvents();
  const [shown, setShown] = useState<FlowItem[]>([]);
  const replay = useRef<Replay>({ queue: [], timer: null, lastShownAt: 0 });
  const seenSeq = useRef<Set<number> | null>(null);
  const lastApiId = useRef(0);
  const gap = reduced ? 0 : MIN_SHOW_MS;

  useEffect(() => {
    const fresh: FlowItem[] = [];
    if (seenSeq.current === null) {
      // First look: everything older counts as seen, except the latest run
      // (usually the one in progress) and calls from the last moment.
      const latest = trace.reduce((max, e) => Math.max(max, e.invoke), -1);
      seenSeq.current = new Set(trace.filter((e) => e.invoke !== latest).map((e) => e.seq));
      const cutoff = Date.now() - RECENT_MS;
      lastApiId.current = api.filter((a) => a.at < cutoff).reduce((max, a) => Math.max(max, a.id), 0);
    }
    for (const a of api) {
      if (a.id <= lastApiId.current) continue;
      lastApiId.current = a.id;
      fresh.push({ key: `api-${a.id}`, kind: "api", api: a });
    }
    const seen = seenSeq.current;
    for (const e of [...trace].sort((a, b) => a.seq - b.seq)) {
      if (seen.has(e.seq)) continue;
      seen.add(e.seq);
      fresh.push({ key: `step-${e.seq}`, kind: "trace", event: e });
    }
    replay.current.queue.push(...fresh);
    // Always nudge: a remount (React strict mode) may have cleared a pending timer.
    pump(replay.current, gap, (rows) => setShown((prev) => [...prev, ...rows].slice(-MAX_ROWS)));
  }, [api, trace, gap]);

  useEffect(() => {
    const r = replay.current;
    return () => {
      if (r.timer !== null) window.clearTimeout(r.timer);
      r.timer = null;
    };
  }, []);

  /** Still replaying steps that were reported. */
  const draining = useCallback(() => replay.current.queue.length > 0 || replay.current.timer !== null, []);

  return { rows: shown, draining };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function StepIcon({ item, className }: { item: FlowItem; className?: string }) {
  if (item.kind === "api") return item.api.method === "GET" ? <ArrowDownLeft aria-hidden className={className} /> : <ArrowUpRight aria-hidden className={className} />;
  switch (item.event.step) {
    case "routed":
      return item.event.node === "end" ? <CircleCheck aria-hidden className={className} /> : <Diamond aria-hidden className={className} />;
    case "completed":
      return <Check aria-hidden className={className} />;
    case "failed":
      return <TriangleAlert aria-hidden className={className} />;
    case "skipped":
      return <Repeat aria-hidden className={className} />;
    case "asked":
      return <CornerDownLeft aria-hidden className={className} />;
  }
}

const statusTone = (status: number) =>
  status === 0 || status >= 400 ? "text-amber-ink" : status === 202 ? "text-sky-ink" : "text-brand-text";

function Row({ item }: { item: FlowItem }) {
  let body: ReactNode;
  if (item.kind === "api") {
    const { method, route, status, ms } = item.api;
    body = (
      <>
        <span className="flex items-baseline gap-2 font-mono text-[11.5px]">
          <span className="min-w-0 truncate">
            <b className="font-extrabold">{method}</b> {route}
          </span>
          <span className={cn("ml-auto shrink-0 tabular-nums font-bold", statusTone(status))}>{status || "—"}</span>
          <span className="w-11 shrink-0 text-right tabular-nums text-faint">{ms}ms</span>
        </span>
        <span className="block text-[11.5px] text-muted-foreground">{apiCaption(method, route, status)}</span>
      </>
    );
  } else {
    const e = item.event;
    const who = speaker(e);
    body = (
      <span className="flex items-start gap-1.5">
        <span className={cn("mt-px shrink-0 rounded-full px-1.5 py-px text-[10px] font-extrabold", CHIP[who] ?? "bg-surface-2 text-ink")}>
          {agentLabel(who)}
        </span>
        <span className={cn(e.step === "failed" || e.step === "skipped" ? "text-amber-ink" : "text-ink")}>{describe(e)}</span>
      </span>
    );
  }
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-start gap-2 text-[12px] leading-snug"
    >
      <StepIcon item={item} className={cn("mt-0.5 size-3.5 shrink-0", item.kind === "api" ? "text-faint" : "text-brand-text")} />
      <div className="min-w-0 flex-1">{body}</div>
    </motion.li>
  );
}

function FlowPanel({
  rows,
  live,
  actions,
  className,
}: {
  rows: FlowItem[];
  live: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={cn("flex flex-col gap-2.5 p-4", className)}>
      <div className="flex items-center gap-2">
        <Activity aria-hidden className="size-4 text-brand-text" />
        <h2 className="text-[13.5px] font-extrabold">Agents at work</h2>
        <span
          className={cn("ml-auto flex items-center gap-1.5 text-[11px] font-bold", live ? "text-brand-text" : "text-faint")}
          aria-live="polite"
        >
          <span className={cn("size-2 rounded-full", live ? "animate-pulse bg-brand" : "bg-line")} aria-hidden />
          {live ? "live" : "idle"}
        </span>
        {actions}
      </div>
      <p className="-mt-1.5 text-[11px] text-muted-foreground">{flowCaption(live)}</p>
      {rows.length ? (
        <ol className="flex flex-col gap-2 border-t border-line pt-2.5">
          <AnimatePresence initial={false}>
            {rows.map((item) => (
              <Row key={item.key} item={item} />
            ))}
          </AnimatePresence>
        </ol>
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Mounts
// ---------------------------------------------------------------------------

/** The live agent flow, inline (the "Building your plan" screen). Demo only. */
export function AgentFlowMini({ className }: { className?: string }) {
  const demo = useDemoMode();
  const app = useApp();
  if (!demo || !app.snapshot) return null;
  return <InlineFlow key={app.snapshot.session_id} trace={app.snapshot.trace} live={app.working} className={className} />;
}

function InlineFlow({ trace, live, className }: { trace: TraceEventView[]; live: boolean; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  const { rows } = useAgentFlow(trace, reduced);
  return <FlowPanel rows={rows} live={live} className={className} />;
}

/** Collapsed pill at bottom right that opens while the agents work. Demo only. */
export function AgentFlowPill() {
  const demo = useDemoMode();
  const app = useApp();
  if (!demo || !app.snapshot) return null;
  return <Pill key={app.snapshot.session_id} trace={app.snapshot.trace} working={app.working} />;
}

const LINGER_MS = 2000;

function Pill({ trace, working }: { trace: TraceEventView[]; working: boolean }) {
  const reduced = useReducedMotion() ?? false;
  const { rows, draining } = useAgentFlow(trace, reduced);
  const [pinned, setPinned] = useState(false);
  const [lingering, setLingering] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [wasWorking, setWasWorking] = useState(working);

  // A run starting reopens the panel; a run ending keeps it up a little longer.
  if (working !== wasWorking) {
    setWasWorking(working);
    if (working) setDismissed(false);
    else setLingering(true);
  }

  useEffect(() => {
    if (working || !lingering) return;
    let t = 0;
    const check = () => {
      if (draining()) t = window.setTimeout(check, 300);
      else setLingering(false);
    };
    t = window.setTimeout(check, LINGER_MS);
    return () => window.clearTimeout(t);
  }, [working, lingering, draining]);

  const open = pinned || (!dismissed && (working || lingering));

  return (
    <div className="fixed bottom-20 right-4 z-30 flex w-[min(360px,calc(100vw-32px))] flex-col items-end min-[751px]:bottom-5">
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, transition: { duration: reduced ? 0 : 0.25 } }}
            className="w-full"
          >
            <FlowPanel
              rows={rows}
              live={working}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setPinned((p) => !p)}
                    aria-pressed={pinned}
                    aria-label={pinned ? "Let it close by itself" : "Keep it open"}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-surface-2"
                  >
                    {pinned ? <PinOff aria-hidden className="size-3.5" /> : <Pin aria-hidden className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinned(false);
                      setLingering(false);
                      setDismissed(true);
                    }}
                    aria-label="Close agents at work"
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-surface-2"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </>
              }
              className="shadow-lg"
            />
          </motion.div>
        ) : (
          <motion.button
            key="pill"
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setPinned(true);
              setDismissed(false);
            }}
            className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[12px] font-bold shadow-card hover:bg-surface-2"
          >
            <span className={cn("size-2 rounded-full", working ? "animate-pulse bg-brand" : "bg-line")} aria-hidden />
            {working ? "Agents working" : "Agents"}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
