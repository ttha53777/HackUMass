// What the navigator says between questions. Every line is a template filled
// only with values the backend already returned (answers, region, counts), so
// no program fact is ever written here.
import type { AnswerIn, AnsweredItem, NotedFacts, Question, SessionSnapshot, UnsupportedNeed } from "@/lib/types";
import { isLive } from "@/lib/derive";
import { plural } from "@/lib/format";

/** The four questions the chat asks before handing over to Home (mirrors derive.coreDone). */
export const CORE_IDS = ["needs", "zip", "household_size", "household_who"] as const;

/** Asked after the core, only when the backend lists them as useful. Both skippable. */
export const EXTRA_IDS = ["income_band", "housing_status"] as const;

/** Answers for "Try a sample". */
export const SAMPLE_NAME = "Maya";
export const SAMPLE_ANSWERS: Record<string, AnswerIn> = {
  needs: { question_id: "needs", selected_option_ids: ["food", "utilities"] },
  zip: { question_id: "zip", value: "01002" },
  household_size: { question_id: "household_size", value: 2 },
  household_who: { question_id: "household_who", selected_option_ids: ["60"] },
  housing_status: { question_id: "housing_status", selected_option_ids: ["renting"] },
  // income_band options are built per session; the sample picks the first range.
};

export function greeting(name: string): string {
  const hi = name ? `Hi ${name}, I'm really glad you reached out.` : "Hi, I'm really glad you reached out.";
  return `${hi} I'll ask a few short questions and look for help near you while we talk.`;
}

/** How the chat words some questions. The backend prompt stays as is for other screens. */
const DISPLAY: Record<string, { prompt?: string; reason?: string | null }> = {
  needs: {
    prompt: "What's been weighing on you lately?",
    reason: "Tell me in your own words, or tap what fits. You don't need to know which programs exist.",
  },
  household_size: {
    prompt: "How many people live with you, including you?",
    reason: "Count everyone you share food or bills with. Income limits depend on it.",
  },
  household_who: {
    prompt: "Does anyone at home fit any of these?",
    reason: "Some programs are only for older adults, young children or pregnancy. Pick any that apply.",
  },
  income_band: { reason: "A rough range is fine, and you can skip this." },
  housing_status: { prompt: "And what's your housing like right now?", reason: "Some help is only for renters or homeowners." },
};

export function shown(q: Question): { prompt: string; reason: string | null } {
  const d = DISPLAY[q.id];
  return { prompt: d?.prompt ?? q.prompt, reason: d && "reason" in d ? (d.reason ?? null) : q.reason };
}

/** Plainer chip labels for some options (ids unchanged). */
const OPTION_LABEL: Record<string, Record<string, string>> = {
  household_who: { "60": "60 or older", "55": "55 to 59", child: "A child under 5 or a pregnancy", none: "No one like that" },
};

export function optionLabel(q: Question, optionId: string, fallback: string): string {
  return OPTION_LABEL[q.id]?.[optionId] ?? fallback;
}

/** Fixed, team-reviewed safety message (the one fact here not from the curated data). */
export const SAFETY_TEXT = {
  title: "Your safety comes first.",
  lines: ["If you're in immediate danger, call 911.", "For crisis support any time, call or text 988."],
};

export const OFF_TOPIC =
  "I'm here to help you find food, heat, housing, health and transport support nearby. Tell me what's going on, or tap what fits below.";

/**
 * What to say when a typed message didn't settle the question. Never a stock
 * "thank you" after the navigator already replied to what was said.
 */
export function bridge(q: Question, { urgent, replied }: { urgent: boolean; replied: boolean }): string {
  if (urgent) {
    return "You can keep going here whenever it feels right. I can look for practical help too, like a safe place to stay, food or bills.";
  }
  if (q.type === "zip") return "I'll need the five digits of your ZIP code, like 01002.";
  if (q.id === "household_size") return "About how many people live with you, counting you? A number is all I need.";
  if (q.id === "income_band") return "A rough yearly amount is fine, like 30,000. Or tap a range, or skip.";
  return replied
    ? "Whenever you're ready, tap what fits below or tell me a bit more."
    : "I want to make sure I get this right. Tap what fits below, or tell me a bit more.";
}

export const PAUSE_TEXT =
  "That's okay. Take your time. I'm here when you're ready, and you can type anything below.";

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
  return `I can't search for ${list(labels)} yet.`;
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
    const labels = q.options.filter((o) => noted.household_who.includes(o.id)).map((o) => optionLabel(q, o.id, o.label).toLowerCase());
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
export function typingMs(text: string, reduced: boolean, followOn = false): number {
  if (reduced) return 0;
  return followOn ? Math.min(700, 280 + text.length * 5) : Math.min(1300, 520 + text.length * 9);
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
    case "income_band":
      return item ? "Thank you. That's all I need about money." : "No problem, we can skip that.";
    case "housing_status":
      return "Thank you. That's the last question.";
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
    headline: `${plural(live.length, "program")} could help you.`,
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
  if (q.id === "income_band") return incomeBand(q, text);
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

/** A typed amount matched to the income range that contains it (yearly). */
function incomeBand(q: Question, text: string): AnswerIn | { hint: string } {
  const t = text.toLowerCase();
  if (/rather not|prefer not|not sure|don'?t know|no idea|skip/.test(t)) return { question_id: q.id, selected_option_ids: ["unsure"] };
  const m = t.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k\b)?/);
  if (!m) return { hint: "A rough yearly amount is fine, like 30,000. Or tap a range." };
  let amount = Number(m[1]) * (m[2] ? 1000 : 1);
  if (/month|\/mo\b|a mo\b/.test(t)) amount *= 12;
  else if (/week|\/wk\b/.test(t)) amount *= 52;
  else if (/hour|\/hr\b/.test(t)) return { hint: "Could you give me a rough total for the month or year?" };
  for (const o of q.options) {
    const r = o.id.match(/^(\d+)-(\d+|inf)$/);
    if (!r) continue;
    const lo = Number(r[1]);
    const hi = r[2] === "inf" ? Infinity : Number(r[2]);
    if (amount >= lo && amount < hi) return { question_id: q.id, selected_option_ids: [o.id] };
  }
  return { hint: "Tap the range that's closest." };
}

/** What the person "said", shown in their bubble. */
export function userSaid(q: Question, a: AnswerIn): string {
  if (a.skipped) return "I'd rather skip this one";
  if (a.text && a.selected_option_ids?.includes("other")) return a.text;
  if (a.selected_option_ids?.length) {
    return q.options
      .filter((o) => a.selected_option_ids!.includes(o.id))
      .map((o) => optionLabel(q, o.id, o.label))
      .join(", ");
  }
  if (q.id === "household_size" && a.value === 1) return "Just me";
  if (q.id === "household_size" && typeof a.value === "number") return `${a.value} people`;
  return String(a.value ?? a.text ?? "");
}

const REVIEW_LABEL: Record<string, string> = {
  needs: "Help with",
  zip: "Area",
  household_size: "Household",
  household_who: "At home",
  income_band: "Yearly income",
  housing_status: "Housing",
};

export type ReviewRow = { id: string; label: string; value: string };

/** One row per answered core or extra question, for the review card. */
export function reviewRows(s: SessionSnapshot | null): ReviewRow[] {
  if (!s) return [];
  const rows: ReviewRow[] = [];
  for (const id of [...CORE_IDS, ...EXTRA_IDS]) {
    const item = s.answered.find((a) => a.question_id === id);
    if (!item) continue;
    let value = item.skipped ? "Skipped" : item.display_value;
    if (!item.skipped) {
      if (id === "needs") value = chosenLabels(item).join(", ") || value;
      if (id === "zip" && s.region) value = `${s.region.city} · ${item.display_value}`;
      if (id === "household_size") value = item.display_value === "1" ? "Just you" : `${item.display_value} people`;
      if (id === "household_who") {
        value = item.question.options
          .filter((o) => item.display_value.split(", ").includes(o.label))
          .map((o) => optionLabel(item.question, o.id, o.label))
          .join(", ") || value;
      }
    }
    rows.push({ id, label: REVIEW_LABEL[id] ?? item.question.prompt, value });
  }
  return rows;
}

/**
 * Help that often goes together, offered once after the needs answer
 * ("Would any of these help too?"). A fixed, reviewable map: no guessing.
 */
export const RELATED: Record<string, string[]> = {
  childcare: ["employment", "food"],
  employment: ["childcare", "taxes"],
  housing: ["legal", "utilities"],
  utilities: ["phone_internet", "housing"],
  safety: ["housing", "legal", "mental_health"],
  food: ["taxes", "utilities"],
  legal: ["housing", "mental_health"],
  mental_health: ["healthcare"],
  healthcare: ["mental_health", "transportation"],
  transportation: ["employment"],
  taxes: ["employment"],
  phone_internet: ["utilities"],
};

/** The needs option ids the person has chosen (including ones matched from their words). */
export function chosenNeedIds(s: SessionSnapshot | null): string[] {
  const item = answered(s, "needs");
  if (!item) return [];
  const labels = new Set(chosenLabels(item));
  return item.question.options.filter((o) => labels.has(o.label)).map((o) => o.id);
}

/** Up to three related needs not chosen yet, most connected first. */
export function relatedNeeds(chosen: string[], max = 3): string[] {
  const score = new Map<string, number>();
  chosen.forEach((id) =>
    (RELATED[id] ?? []).forEach((r, i) => {
      if (!chosen.includes(r)) score.set(r, (score.get(r) ?? 0) + (3 - Math.min(i, 2)));
    }),
  );
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, max);
}
