// Reads the conversation's state out of the session snapshot. The backend owns every
// answer (except the name, which stays on the device), the question options, the
// places found and their fit; this file only maps them onto the mock's screens.

import { chosenNeedIds } from "@/components/chat/script";
import { coreDone } from "@/lib/derive";
import type { AnswerIn, ProgramCard, Question, SessionSnapshot } from "@/lib/types";

import { CORE, EXTRAS, OPTION_IDS, SAMPLE, type Opt, type Qid } from "./content";
import { incomeLabel, list, needLabel, type Dict } from "./i18n";

export const answeredItem = (s: SessionSnapshot | null, id: string) => s?.answered.find((a) => a.question_id === id);

/** Answered or deliberately skipped. "name" is tracked on the device. */
export const isDone = (s: SessionSnapshot | null, id: Qid, nameDone: boolean) =>
  id === "name" ? nameDone : id === "review" ? false : Boolean(answeredItem(s, id));

/** The extras worth asking: what the backend lists once the core is in, a guess (the mock's rule) before. */
function extras(s: SessionSnapshot | null): Qid[] {
  if (s && coreDone(s)) {
    const open = new Set(s.open_questions.map((o) => o.question.id));
    return EXTRAS.filter((id) => open.has(id) || answeredItem(s, id));
  }
  const needs = needsOf(s);
  return EXTRAS.filter(
    (id) =>
      id === "income_band" ||
      (id === "utility_urgency" && needs.includes("utilities")) ||
      (id === "housing_status" && (needs.includes("housing") || needs.includes("utilities"))),
  );
}

/** Every question in the order asked, ending with the review. */
export const order = (s: SessionSnapshot | null): Qid[] => ["name", ...CORE, ...extras(s), "review"];

/** The first question still to answer after `from` (or from the start), else the review. */
export function nextAfter(s: SessionSnapshot | null, from: Qid | null, nameDone: boolean): Qid {
  const ord = order(s);
  const start = from ? ord.indexOf(from) + 1 : 0;
  return ord.slice(start).find((id) => id !== "review" && !isDone(s, id, nameDone)) ?? "review";
}

/** The backend's current definition of a question (income ranges follow household size). */
export const backendQuestion = (s: SessionSnapshot | null, id: string): Question | undefined =>
  s?.open_questions.find((o) => o.question.id === id)?.question ??
  (s?.pending_question?.id === id ? s.pending_question : undefined) ??
  answeredItem(s, id)?.question;

/** Options for a choice question, in the mock's words (in the chosen language) where it has them. */
export function optionsFor(s: SessionSnapshot | null, id: Qid, t: Dict): Opt[] {
  if (id === "household_who" || id === "utility_urgency" || id === "housing_status") {
    const labels: Record<string, string> = t.options[id];
    return OPTION_IDS[id].map((o) => ({ ...o, label: labels[o.id] }));
  }
  const q = backendQuestion(s, id);
  if (!q) return [];
  if (id === "income_band") {
    // "Not sure" is the skip button ("I'd rather not say"), not a lettered row.
    return q.options.filter((o) => o.id !== "unsure").map((o) => ({ id: o.id, label: incomeLabel(t, o.id) ?? o.label }));
  }
  return q.options.map((o) => ({ id: o.id, label: o.label }));
}

/** The answer to "I'd rather not say" on the income question. */
export function skipAnswer(s: SessionSnapshot | null, id: Qid): AnswerIn {
  const q = backendQuestion(s, id);
  return q?.options.some((o) => o.id === "unsure")
    ? { question_id: id, selected_option_ids: ["unsure"] }
    : { question_id: id, skipped: true };
}

/** The needs chosen, including ones the backend matched from the person's own words. */
export const needsOf = (s: SessionSnapshot | null): string[] => chosenNeedIds(s);

/** Option ids chosen for a select question, read back from the answer's labels. */
export function chosen(s: SessionSnapshot | null, id: string): string[] {
  const item = answeredItem(s, id);
  if (!item || item.skipped) return [];
  if (id === "needs") return needsOf(s);
  const dv = item.display_value;
  if (id === "income_band") return incomeIds(dv, item.question.options);
  const parts = dv.split(", ");
  // Single answers can carry a unit ("Under $43,284 a year").
  return item.question.options.filter((o) => dv === o.label || parts.includes(o.label) || dv.startsWith(`${o.label} `)).map((o) => o.id);
}

/**
 * The income range chosen. The stored answer keeps only its words ("Under $43,284 a
 * year", "$43,284 to $70,073 a year", "Over $93,431 a year"), so the id is rebuilt from them.
 */
function incomeIds(dv: string, options: { id: string; label: string }[]): string[] {
  const hit = options.find((o) => dv === o.label || dv.startsWith(`${o.label} `));
  if (hit) return [hit.id];
  if (/^not sure/i.test(dv)) return ["unsure"];
  const n = (dv.match(/\$[\d,]+/g) ?? []).map((x) => x.replace(/\D/g, ""));
  if (/^under/i.test(dv) && n[0]) return [`0-${n[0]}`];
  if (/^over/i.test(dv) && n[0]) return [`${n[0]}-inf`];
  return n.length === 2 ? [`${n[0]}-${n[1]}`] : [];
}

export function sizeOf(s: SessionSnapshot | null): number | null {
  const item = answeredItem(s, "household_size");
  const n = item && !item.skipped ? Number(item.display_value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const zipOf = (s: SessionSnapshot | null) => {
  const item = answeredItem(s, "zip");
  return item && !item.skipped ? item.display_value.replace(/\D/g, "").slice(0, 5) : "";
};

/** The short answer shown in the trail's tooltip and on the review. */
export function answerText(s: SessionSnapshot | null, id: Qid, name: string, t: Dict): string {
  const UI = t.ui;
  const item = answeredItem(s, id);
  switch (id) {
    case "name":
      return name || UI.skipped;
    case "needs":
      return list(t, needsOf(s).map((n) => needLabel(t, n))) || (item ? UI.notSure : "");
    case "zip":
      return item ? `${zipOf(s)} · ${s?.region?.city ?? ""}`.replace(/ · $/, "") : "";
    case "household_size": {
      const n = sizeOf(s);
      return n === null ? "" : n === 1 ? UI.justMe : UI.people(n);
    }
    case "review":
      return "";
    default: {
      if (!item) return "";
      if (item.skipped) return UI.skipped;
      const ids = chosen(s, id);
      if (id === "income_band" && (ids.includes("unsure") || /^not sure/i.test(item.display_value))) return UI.skipped;
      if (id === "income_band") return ids.map((x) => incomeLabel(t, x) ?? item.display_value).join("") || item.display_value;
      const opts = optionsFor(s, id, t);
      return list(t, ids.map((o) => opts.find((x) => x.id === o)?.label ?? o)) || item.display_value;
    }
  }
}

/** The question's number on its eyebrow ("01"), or ✓ for the review. */
export function numberOf(s: SessionSnapshot | null, id: Qid): string {
  const steps: Qid[] = order(s).filter((x) => x !== "review");
  const n = steps.indexOf(id) + 1;
  return n > 0 ? String(n).padStart(2, "0") : "✓";
}

// ───────── The places panel ─────────

export type Fit = "likely" | "possibly" | "info";

/** The backend's status, in the panel's three words. Ruled-out and already-received are left out. */
function fitOf(card: ProgramCard): Fit | null {
  switch (card.assessment?.status) {
    case "likely_eligible":
      return "likely";
    case "possibly_eligible":
    case "opens_later":
      return "possibly";
    case "likely_ineligible":
    case "already_receiving":
      return null;
    default:
      // insufficient_information, or not checked yet
      return "info";
  }
}

export type Place = { id: string; name: string; provider: string; fit: Fit };

export function places(s: SessionSnapshot | null): Place[] {
  if (!s || s.coverage !== "supported") return [];
  return s.programs.flatMap((c) => {
    const fit = fitOf(c);
    return fit ? [{ id: c.program.id, name: c.program.name, provider: c.program.provider, fit }] : [];
  });
}

/** The income range the example picks: the one holding about $24,000 a year. */
export function sampleIncome(opts: Opt[]): string | undefined {
  const hit = opts.find((o) => {
    const m = o.id.match(/^(\d+)-(\d+|inf)$/);
    return m && SAMPLE.yearly >= Number(m[1]) && (m[2] === "inf" || SAMPLE.yearly < Number(m[2]));
  });
  return (hit ?? opts[0])?.id;
}
