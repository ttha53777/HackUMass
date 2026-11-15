// Pure selectors for the Plan Hub. Like derive.ts, nothing here decides a status, an order or
// a lane: the backend does (assessment.status, action_plan rank, horizon, deadline). This file
// groups, labels and counts what it already decided, plus the person's own progress (PlanState).
import { docLabel } from "@/components/od/doc-kinds";

import { answerFor, answerIncludes, asksFor, docsFor, isLive, isStepDone, openIds, shortName, toneOf } from "./derive";
import type { PlanState } from "./device-state";
import type { ActionItem, AnsweredItem, ProgramCard, Provenance, SessionSnapshot } from "./types";

export type Fit = "likely" | "open" | "possibly" | "need" | "later" | "have" | "out";
export type Lane = "today" | "week" | "later";
export type Kind = "gov" | "local";

export type Pip =
  | { k: "papers"; ok: boolean; label: string; kind: string | null }
  | { k: "income"; ok: boolean; label: string }
  | { k: "form"; ok: boolean; label: string; sent: boolean };

export type HubStep = {
  id: string;
  title: string;
  card: ProgramCard;
  action: ActionItem | null;
  kind: Kind;
  fit: Fit;
  lane: Lane;
  /** A shutoff, no place to stay, or safety: goes first and raises the urgent banner. */
  deadline: boolean;
  urgent: boolean;
  /** The person's need this step helps with (first matching category). */
  need: string | null;
  /** Kinds of paper the provider asks for. */
  kinds: string[];
  pips: Pip[];
  /** Open questions that would settle this program. */
  asks: string[];
  done: boolean;
  /** Sent with the browser assistant. */
  sent: boolean;
};

export const FIT_LABEL: Record<Fit, string> = {
  likely: "Likely fit",
  open: "Open to everyone",
  possibly: "Possibly a fit",
  need: "Need more info",
  later: "Opens later",
  have: "You have this",
  out: "Not a fit right now",
};

/** CSS class for the fit badge (the design has four looks). */
export const FIT_CLASS: Record<Fit, string> = {
  likely: "likely",
  open: "likely",
  possibly: "possibly",
  need: "need",
  later: "opt",
  have: "likely",
  out: "opt",
};

export const LANES: { id: Lane; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "sun" },
  { id: "week", label: "This week", icon: "cal" },
  { id: "later", label: "When you are ready", icon: "plant" },
];

const LANE_ORDER: Record<Lane, number> = { today: 0, week: 1, later: 2 };

/** "Photo ID" -> "photo ID": lower-case the first letter only, so acronyms survive. */
const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

const INCOME_QUESTIONS = ["monthly_income", "income_band"];

/** Option ids chosen in a stored multi-select answer (the snapshot keeps labels, not ids). */
export function selectedIds(item: AnsweredItem | undefined): string[] {
  if (!item || item.skipped) return [];
  return item.question.options.filter((o) => answerIncludes(item, [o.id])).map((o) => o.id);
}

export const needsOf = (s: SessionSnapshot) => selectedIds(answerFor(s, "needs"));

function fitOf(card: ProgramCard, asks: string[]): Fit {
  switch (toneOf(card)) {
    case "fit":
      return "likely";
    case "open":
      return "open";
    case "later":
      return "later";
    case "have":
      return "have";
    case "out":
      return "out";
    default:
      return asks.length ? "need" : "possibly";
  }
}

const hasIncomeRule = (card: ProgramCard) =>
  card.program.requirements.some((r) => r.kind === "income_max" || r.kind === "income_min");

export const incomeKnown = (s: SessionSnapshot) => INCOME_QUESTIONS.some((id) => !!answerFor(s, id));

/** The income question to open for editing: the one answered, else the one open. */
export function incomeQuestionId(s: SessionSnapshot): string | null {
  const answered = s.answered.find((a) => INCOME_QUESTIONS.includes(a.question_id));
  if (answered) return answered.question_id;
  return s.open_questions.find((o) => INCOME_QUESTIONS.includes(o.question.id))?.question.id ?? null;
}

const isSent = (s: SessionSnapshot, id: string) => {
  const status = s.applications?.[id]?.status;
  return status === "submitted" || status === "unclear";
};

function stepBuilder(s: SessionSnapshot, plan: PlanState) {
  const needs = needsOf(s);
  const open = openIds(s);
  const actions = new Map(s.action_plan.map((a) => [a.program_id, a]));
  const income = incomeKnown(s);
  const automatable = new Set(s.automatable_program_ids ?? []);

  return (card: ProgramCard): HubStep => {
    const id = card.program.id;
    const action = actions.get(id) ?? null;
    const asks = asksFor(card, open);
    const docs = docsFor(card.program);
    const sent = isSent(s, id);
    const pips: Pip[] = [];
    if (docs.length) {
      const missing = docs.find((d) => !plan.docs.includes(d.kind));
      pips.push({
        k: "papers",
        ok: !missing,
        label: missing ? `Add ${lowerFirst(docLabel(missing.kind, missing.texts))}` : "Papers ready",
        kind: missing?.kind ?? null,
      });
    }
    if (hasIncomeRule(card)) pips.push({ k: "income", ok: income, label: income ? "Income added" : "Add your income" });
    if (automatable.has(id)) pips.push({ k: "form", ok: sent, sent, label: sent ? "Sent by you" : "Form" });
    const deadline = action?.deadline ?? false;
    return {
      id,
      title: shortName(card.program),
      card,
      action,
      kind: card.program.track === "benefit" ? "gov" : "local",
      fit: fitOf(card, asks),
      lane: action?.horizon ?? "later",
      deadline,
      // The red outline is for the one step per need that cannot wait (the backend's deadline).
      urgent: deadline,
      need: card.program.categories.find((c) => needs.includes(c)) ?? card.program.categories[0] ?? null,
      kinds: docs.map((d) => d.kind),
      pips,
      asks,
      done: isStepDone(plan, id) || sent,
      sent,
    };
  };
}

/** Every live program as a plan step, in the Action Planning agent's order. */
export function hubSteps(s: SessionSnapshot, plan: PlanState): HubStep[] {
  const index = new Map(s.programs.map((c, i) => [c.program.id, i]));
  const steps = s.programs.filter(isLive).map(stepBuilder(s, plan));
  const rank = (st: HubStep) => st.action?.rank ?? 1000 + (index.get(st.id) ?? 0);
  return steps.sort((a, b) => rank(a) - rank(b));
}

/** Pending steps in doing order: lane, then deadline, then urgent, then the plan's rank. */
export function pendingInOrder(steps: HubStep[]): HubStep[] {
  return steps
    .filter((st) => !st.done)
    .map((st, i) => ({ st, i }))
    .sort(
      (a, b) =>
        LANE_ORDER[a.st.lane] - LANE_ORDER[b.st.lane] ||
        Number(b.st.deadline) - Number(a.st.deadline) ||
        Number(b.st.urgent) - Number(a.st.urgent) ||
        a.i - b.i,
    )
    .map(({ st }) => st);
}

export const nextUp = (steps: HubStep[]) => pendingInOrder(steps)[0];

export type HubCase = "start" | "empty" | "urgent" | "waiting" | "done" | "offline" | "nomatch" | "loading";

/** Which dashboard case to show. First match wins. */
export function caseOf(s: SessionSnapshot, steps: HubStep[], online: boolean): HubCase {
  if (!online) return "offline";
  if (s.busy && !s.programs.length) return "loading";
  if (s.coverage === "unsupported") return "nomatch";
  if (!needsOf(s).length || !steps.length) return "empty";
  const pending = steps.filter((st) => !st.done);
  if (!pending.length) return "done";
  if (pending.some((st) => st.deadline)) return "urgent";
  if (steps.some((st) => st.sent) && !pending.some((st) => st.lane === "today")) return "waiting";
  return "start";
}

/** The person's needs, each with how many steps help with it. */
export function toldNeeds(s: SessionSnapshot, steps: HubStep[]): { id: string; count: number }[] {
  return needsOf(s).map((id) => ({
    id,
    count: steps.filter((st) => st.card.program.categories.includes(id)).length,
  }));
}

export function progress(steps: HubStep[]) {
  const done = steps.filter((st) => st.done).length;
  return { done, total: steps.length };
}

/** Open steps that ask for this kind of paper. */
export const usedIn = (kind: string, steps: HubStep[]) => steps.filter((st) => !st.done && st.kinds.includes(kind));

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  user_reported: "You told us",
  document_extracted: "From a paper",
  nessie_sandbox: "From bank, simulated",
  inferred: "Worked out",
};

/** Where a stored answer came from, by its profile field. */
export function provenanceOf(s: SessionSnapshot, field: string): Provenance | null {
  return s.profile_summary.find((p) => p.field === field)?.provenance ?? null;
}

/** Any program in the snapshot as a step, live or not (the spotlight can open either). */
export function stepFor(s: SessionSnapshot, plan: PlanState, id: string): HubStep | null {
  const card = s.programs.find((c) => c.program.id === id);
  return card ? stepBuilder(s, plan)(card) : null;
}
