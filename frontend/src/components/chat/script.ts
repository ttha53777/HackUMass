// What the navigator says between questions. Every line is a template filled
// only with values the backend already returned (answers, region, counts), so
// no program fact is ever written here.
import type { AnswerIn, AnsweredItem, Question, SessionSnapshot } from "@/lib/types";
import { isLive } from "@/lib/derive";
import { plural } from "@/lib/format";

/** The four questions the chat asks before handing over to Home (mirrors derive.coreDone). */
export const CORE_IDS = ["needs", "zip", "household_size", "household_who"] as const;

/** Answers for "Try a sample". */
export const SAMPLE_NAME = "Maya";
export const SAMPLE_ANSWERS: Record<string, AnswerIn> = {
  needs: { question_id: "needs", selected_option_ids: ["food", "utilities"] },
  zip: { question_id: "zip", value: "01002" },
  household_size: { question_id: "household_size", value: 2 },
  household_who: { question_id: "household_who", selected_option_ids: ["60"] },
};

export function greeting(name: string): string {
  return name
    ? `Hi ${name}, I'm your navigator. I'll look through what's out there while we talk. It takes about a minute.`
    : "Hi, I'm your navigator. I'll look through what's out there while we talk. It takes about a minute.";
}

/** How long the typing bubble shows before a message of this length. */
export function typingMs(text: string, reduced: boolean): number {
  if (reduced) return 0;
  return Math.min(1300, 520 + text.length * 9);
}

const MATCHED = /\(we also matched this to (.+)\)$/;

/** Labels the person chose for a select answer, including options matched from their own words. */
export function chosenLabels(item: AnsweredItem | undefined): string[] {
  if (!item) return [];
  const matched = item.display_value.match(MATCHED)?.[1];
  const labels = item.display_value
    .replace(MATCHED, "")
    .split(", ")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("Other"));
  if (matched) labels.push(...matched.split(", "));
  return [...new Set(labels)];
}

export const answered = (s: SessionSnapshot | null, id: string) =>
  s?.answered.find((a) => a.question_id === id && !a.skipped);

function list(items: string[]): string {
  const lower = items.map((x) => x.toLowerCase());
  if (lower.length <= 1) return lower[0] ?? "";
  return `${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}`;
}

/** The short reply after an answer was accepted. */
export function ack(questionId: string, s: SessionSnapshot): string {
  const item = answered(s, questionId);
  switch (questionId) {
    case "needs": {
      const labels = chosenLabels(item);
      return labels.length
        ? `Got it: ${list(labels)}. I'll start there.`
        : "Thanks. I'll keep that in mind and look at everything nearby.";
    }
    case "zip": {
      const r = s.region;
      const n = s.programs.length;
      return r ? `${r.city}, ${r.county}. ${plural(n, "program")} ${n === 1 ? "serves" : "serve"} your area.` : "Thanks.";
    }
    case "household_size": {
      const n = Number(item?.display_value ?? 0);
      return n === 1 ? "Just you. Thanks." : n ? `${n} people at home. Thanks.` : "Thanks.";
    }
    case "household_who":
      return "That helps. Some programs are only for certain ages.";
    default:
      return "Thanks, I've updated that.";
  }
}

/** The opening line of the results message. */
export function resultsLine(s: SessionSnapshot): { headline: string; detail: string } {
  const live = s.programs.filter(isLive);
  const gov = live.filter((c) => c.program.track === "benefit").length;
  const loc = live.filter((c) => c.program.track === "local").length;
  if (live.length === 0) {
    return {
      headline: "I didn't find a clear match yet.",
      detail: "Your plan still lists what's nearby, and a few short questions there could open more up.",
    };
  }
  return {
    headline: `${plural(live.length, "program")} ${live.length === 1 ? "looks" : "look"} worth a look for you.`,
    detail: `${plural(gov, "benefit")} you can apply for, and ${plural(loc, "local option")} nearby. Your plan puts them in order.`,
  };
}

/**
 * Turns text typed into the chat box into an answer for this question, or
 * returns a hint to show instead. Select questions that take "Other" pass the
 * words to the backend, which matches them to known options.
 */
export function parseTyped(q: Question, raw: string): AnswerIn | { hint: string } {
  const text = raw.trim().replace(/\s+/g, " ").slice(0, 500);
  if (!text) return { hint: "" };
  if (q.type === "zip") {
    const zip = text.replace(/\D/g, "");
    return /^\d{5}$/.test(zip) ? { question_id: q.id, value: zip } : { hint: "A ZIP code is five digits, like 01002." };
  }
  if (q.type === "number" || q.type === "currency") {
    const n = numberIn(text);
    const lo = q.min ?? 0;
    const hi = q.max ?? Number.MAX_SAFE_INTEGER;
    if (n === null) return { hint: "A number works best here, like 2." };
    if (n < lo || n > hi) return { hint: `Pick a number from ${lo} to ${hi}.` };
    return { question_id: q.id, value: n };
  }
  if (q.type === "single_select" || q.type === "multi_select") {
    const t = text.toLowerCase();
    const hits = q.options.filter((o) => t.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(t));
    if (hits.length && (q.type === "multi_select" || hits.length === 1)) {
      return { question_id: q.id, selected_option_ids: hits.map((o) => o.id) };
    }
    if (q.allow_other) return { question_id: q.id, selected_option_ids: ["other"], text };
    return { hint: "I didn't quite catch that. Tap the option that fits best." };
  }
  return { question_id: q.id, text };
}

const WORDS: Record<string, number> = {
  "just me": 1, me: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};

function numberIn(text: string): number | null {
  const digits = text.match(/\d+(\.\d+)?/);
  if (digits) return Number(digits[0]);
  const t = text.toLowerCase();
  for (const [word, n] of Object.entries(WORDS)) if (new RegExp(`\\b${word}\\b`).test(t)) return n;
  return null;
}

/** What the person "said", shown in their bubble. */
export function userSaid(q: Question, a: AnswerIn): string {
  if (a.text && a.selected_option_ids?.includes("other")) return a.text;
  if (a.selected_option_ids?.length) {
    return q.options.filter((o) => a.selected_option_ids!.includes(o.id)).map((o) => o.label).join(", ");
  }
  if (q.id === "household_size" && a.value === 1) return "Just me";
  if (q.id === "household_size" && typeof a.value === "number") return `${a.value} people`;
  return String(a.value ?? a.text ?? "");
}
