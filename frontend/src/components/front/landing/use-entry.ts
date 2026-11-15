"use client";

import { useApp } from "@/components/session/session-provider";
import { coreDone } from "@/lib/derive";
import { readConfirmed } from "@/lib/device-state";

import { useThrough } from "../through";

/** Where this device stands: nothing yet, part-way through the questions, or a finished plan. */
export type EntryState = "new" | "resume" | "plan";

/**
 * The landing page's ways in. `start` walks through the door to the conversation,
 * or to the plan when this device already finished it. Device storage is read only
 * once the session has loaded in the browser, so the first render matches the server.
 */
export function useEntry() {
  const go = useThrough();
  const { snapshot } = useApp();
  const state: EntryState = !snapshot
    ? "new"
    : coreDone(snapshot) && readConfirmed(snapshot.session_id)
      ? "plan"
      : snapshot.answered.length > 0
        ? "resume"
        : "new";

  const start = (from: Element) => void go(from, state === "plan" ? "/home" : "/start");
  const sample = (from: Element) => void go(from, "/start?sample=1");
  const withNeed = (from: Element, need: string) => void go(from, `/start?need=${encodeURIComponent(need)}`);
  const withWords = (from: Element, words: string) => void go(from, `/start?say=${encodeURIComponent(words)}`);

  return { state, start, sample, withNeed, withWords };
}

/** Labels for the main call to action, by where the person stands. */
export const START_LABEL: Record<"nav" | "hero" | "fin", Record<EntryState, string>> = {
  nav: { new: "Start", resume: "Continue", plan: "My plan" },
  hero: { new: "Start, it takes about 3 minutes", resume: "Pick up where you left off", plan: "See my plan" },
  fin: { new: "Start now", resume: "Pick up where you left off", plan: "See my plan" },
};
