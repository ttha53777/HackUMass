"use client";

import { useSyncExternalStore } from "react";

/**
 * A record of API calls for the demo "Agents at work" panel. Method, route
 * template, status and timing only: never a body, a query string or an id.
 */
export type ApiEvent = {
  id: number;
  method: string;
  /** e.g. "/sessions/…/answers": ids are replaced with "…". */
  route: string;
  /** HTTP status, or 0 when the server could not be reached. */
  status: number;
  ms: number;
  /** Date.now() when the response (or failure) arrived. */
  at: number;
};

const MAX_EVENTS = 60;
const EMPTY: readonly ApiEvent[] = [];

let events: readonly ApiEvent[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

/** Path segments that name a collection, so the segment after them is an id. */
const ID_PARENTS = new Set(["sessions", "applications"]);
/** Fixed words that can follow a collection name and are not ids. */
const KNOWN = new Set(["readiness"]);
const LOOKS_LIKE_ID = /^(?=.*\d)[\w-]{12,}$/;

/** "/sessions/abc/answers?x=1" -> "/sessions/…/answers". */
export function routeTemplate(path: string): string {
  const parts = path.split(/[?#]/)[0].split("/");
  return parts
    .map((part, i) => {
      if (!part || KNOWN.has(part)) return part;
      if (ID_PARENTS.has(parts[i - 1] ?? "") || LOOKS_LIKE_ID.test(part)) return "…";
      return part;
    })
    .join("/");
}

/** Called by lib/api.ts after each request settles. Never throws. */
export function recordApiCall(method: string, path: string, status: number, ms: number) {
  try {
    const event: ApiEvent = {
      id: nextId++,
      method: method.toUpperCase(),
      route: routeTemplate(path),
      status,
      ms: Math.max(0, Math.round(ms)),
      at: Date.now(),
    };
    events = [...events, event].slice(-MAX_EVENTS);
    for (const listener of listeners) listener();
  } catch {
    // Demo instrumentation must never break a request.
  }
}

export function subscribeApiEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getApiEvents = (): readonly ApiEvent[] => events;
const getServerApiEvents = (): readonly ApiEvent[] => EMPTY;

/** The latest API calls, oldest first. */
export function useApiEvents(): readonly ApiEvent[] {
  return useSyncExternalStore(subscribeApiEvents, getApiEvents, getServerApiEvents);
}
