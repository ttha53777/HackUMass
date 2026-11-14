// What the navigator says between questions. Every line is a template filled
// only with values the backend already returned (answers, region, counts), so
// no program fact is ever written here.
import type { AnswerIn, AnsweredItem, NotedFacts, Question, SessionSnapshot, UnsupportedNeed } from "@/lib/types";
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
  const hi = name ? `Hi ${name}, I'm really glad you reached out.` : "Hi, I'm really glad you reached out.";
  return `${hi} I'll ask a few short questions and look for help near you while we talk.`;
}

/** How the chat words some questions. The backend prompt stays as is for other screens. */
const DISPLAY: Record<string, { prompt: string; reason: string | null }> = {
  needs: {
    prompt: "What's been weighing on you lately?",
    reason: "Tell me in your own words, or tap what fits. You don't need to know which programs exist.",
  },
};

export function shown(q: Question): { prompt: string; reason: string | null } {
  return DISPLAY[q.id] ?? { prompt: q.prompt, reason: q.reason };
}

/** Fixed, team-reviewed safety message (the one fact here not from the curated data). */
export const SAFETY_TEXT = {
  title: "Your safety comes first.",
  lines: ["If you're in immediate danger, call 911.", "For crisis support any time, call or text 988."],
};

export const OFF_TOPIC =
  "I'm here to help you find food, heat, housing, health and transport support nearby. Tell me what's going on, or tap what fits below.";

/** When a typed message didn't settle the question. */
export function nudge(q: Question): string {
  if (q.type === "zip") return "I'll need the five digits of your ZIP code, like 01002.";
  if (q.id === "household_size") return "About how many people live with you, counting you? A number works best.";
  return "Thank you for sharing that. Tap what fits best below, or tell me a little more.";
}

const UNSUPPORTED_LABEL: Record<UnsupportedNeed, string | null> = {
  childcare: "childcare",
  mental_health: "mental health support",
  legal: "legal help",
  job: "help finding work",
  other: null,
};

/** An honest line about what the app can't search for yet. */
export function unsupportedLine(needs: UnsupportedNeed[]): string | null {
  const labels = needs.map((n) => UNSUPPORTED_LABEL[n]).filter((x): x is string => !!x);
  if (!labels.length) return null;
  return `I can't search for ${list(labels)} yet, so I'll focus on what I can find for you.`;
}

/** A question asked as a confirmation of something the person already said. */
export function confirmation(q: Question, noted: NotedFacts): { prompt: string; label: string; answer: AnswerIn } | null {
  if (q.id === "household_size" && noted.household_size) {
    const n = noted.household_size;
    return {
      prompt: n === 1 ? "You mentioned it's just you at home. Is that right?" : `You mentioned there are ${n} of you at home. Is that right?`,
      label: "Yes, that's right",
      answer: { question_id: q.id, value: n },
    };
  }
  if (q.id === "household_who" && noted.household_who.length) {
    const labels = q.options.filter((o) => noted.household_who.includes(o.id)).map((o) => o.label);
    if (!labels.length) return null;
    return {
      prompt: `You mentioned ${list(labels)}. Is that everyone I should know about?`,
      label: "Yes, that's everyone",
      answer: { question_id: q.id, selected_option_ids: noted.household_who },
    };
  }
  if (q.id === "zip" && noted.zip) {
    return { prompt: `You mentioned ${noted.zip}. Is that your ZIP code?`, label: `Yes, ${noted.zip}`, answer: { question_id: q.id, value: noted.zip } };
  }
  return null;
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

/** The short reply after an answer was accepted. `afterReply`: a warm reply was already shown. */
export function ack(questionId: string, s: SessionSnapshot, afterReply = false): string {
  const item = answered(s, questionId);
  switch (questionId) {
    case "needs": {
      const labels = chosenLabels(item);
      if (!labels.length) return "Thank you. I'll look at everything nearby.";
      return afterReply ? `I'll start by looking for help with ${list(labels)}.` : `Thank you. I'll start by looking for help with ${list(labels)}.`;
    }
    case "zip": {
      const r = s.region;
      const n = s.programs.length;
      return r ? `${r.city}, ${r.county}. ${plural(n, "program")} ${n === 1 ? "serves" : "serve"} your area.` : "Thanks.";
    }
    case "household_size": {
      const n = Number(item?.display_value ?? 0);
      return n === 1 ? "Just you. Thank you." : n ? `${n} of you at home. Thank you.` : "Thank you.";
    }
    case "household_who":
      return "Thank you. That helps me find the right programs.";
    default:
      return "Thank you, I've updated that.";
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
