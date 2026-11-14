// Pure selectors over the session snapshot. The backend decides statuses, reasons and
// the question order; this file only groups, orders and counts what it already decided.
import type { AppStage, PlanState } from "./device-state";
import type {
  AnsweredItem,
  CheckKind,
  CheckView,
  EligibilityStatus,
  HoursEntry,
  OpenQuestionView,
  Program,
  ProgramCard,
  SessionSnapshot,
} from "./types";

/** Statuses that still matter to the person: not ruled out, not already theirs. */
export const LIVE: EligibilityStatus[] = [
  "likely_eligible",
  "possibly_eligible",
  "insufficient_information",
  "opens_later",
];

export const isLive = (card: ProgramCard) =>
  card.assessment !== null && LIVE.includes(card.assessment.status);

export const benefits = (s: SessionSnapshot) => s.programs.filter((c) => c.program.track === "benefit");
export const localHelp = (s: SessionSnapshot) => s.programs.filter((c) => c.program.track === "local");

export const liveCount = (cards: ProgramCard[]) => cards.filter(isLive).length;

/** True once the four core questions are answered and results exist or were ruled out. */
export function coreDone(s: SessionSnapshot | null): boolean {
  if (!s) return false;
  const answered = new Set(s.answered.filter((a) => !a.skipped).map((a) => a.question_id));
  return ["needs", "zip", "household_size", "household_who"].every((id) => answered.has(id));
}

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

/** How a status looks. "maybe" covers both possibly-eligible and not-enough-information. */
export type Tone = "fit" | "open" | "maybe" | "later" | "have" | "out" | "checking";

const isOpenAccess = (p: Program) => p.requirements.some((r) => r.kind === "open_access");

export function toneOf(card: ProgramCard): Tone {
  switch (card.assessment?.status) {
    case "likely_eligible":
      return isOpenAccess(card.program) ? "open" : "fit";
    case "possibly_eligible":
    case "insufficient_information":
      return "maybe";
    case "opens_later":
      return "later";
    case "already_receiving":
      return "have";
    case "likely_ineligible":
      return "out";
    default:
      return "checking";
  }
}

/** Ids of the questions currently open, for quick lookups. */
export const openIds = (s: SessionSnapshot) => new Set(s.open_questions.map((o) => o.question.id));

/** Open questions that would settle something about this program, in check order. */
export function asksFor(card: ProgramCard, open: Set<string>): string[] {
  const ids = (card.assessment?.checks ?? [])
    .filter((c) => c.kind === "ask" && c.question_id && open.has(c.question_id))
    .map((c) => c.question_id as string);
  return [...new Set(ids)];
}

const TONE_LABEL: Record<Exclude<Tone, "maybe">, string> = {
  fit: "Likely fit",
  open: "Open to everyone",
  later: "Opens later",
  have: "You have this",
  out: "Not a fit right now",
  checking: "Checking",
};

export function statusLabel(card: ProgramCard, open: Set<string>): string {
  const tone = toneOf(card);
  if (tone === "maybe") {
    const n = asksFor(card, open).length;
    return n === 0 ? "Call to confirm" : n === 1 ? "One question away" : `${n} questions away`;
  }
  return TONE_LABEL[tone];
}

export const checksOf = (card: ProgramCard, ...kinds: CheckKind[]): CheckView[] =>
  (card.assessment?.checks ?? []).filter((c) => kinds.includes(c.kind));

const firstSentence = (text: string) => {
  const cut = text.indexOf(". ");
  return cut === -1 ? text : text.slice(0, cut + 1);
};

/** The one line under a program's name: why it fits, why not, or what it is. */
export function reasonLine(card: ProgramCard): string {
  const tone = toneOf(card);
  if (tone === "out") return checksOf(card, "fail")[0]?.text ?? card.program.description;
  if (tone === "later") return checksOf(card, "later")[0]?.text ?? card.program.description;
  return checksOf(card, "pass", "have")[0]?.text ?? firstSentence(card.program.description);
}

export const shortName = (p: Program) => p.guide?.short_name ?? p.name;

/** First US phone number in a contact line, e.g. "413-549-3968" or "(413) 233-1500 ext. 2". */
export function phoneOf(text: string | null | undefined): string | null {
  const match = String(text ?? "").match(/\(?\d{3}\)?[-\s.]\d{3}-\d{4}(\s*ext\.?\s*\d+)?/);
  return match ? match[0] : null;
}

/** The program's first step, from its record; falls back to its provider and description. */
export function stepOf(p: Program): { title: string; detail: string } {
  return p.first_step ?? { title: `Contact ${p.provider}`, detail: firstSentence(p.description) };
}

export const cardById = (s: SessionSnapshot, id: string) => s.programs.find((c) => c.program.id === id);

// ---------------------------------------------------------------------------
// Home: the plan and the next step
// ---------------------------------------------------------------------------

/** Program order: the Action Planning agent's rank first, then the snapshot's own order. */
function byPlanRank(s: SessionSnapshot) {
  const rank = new Map(s.action_plan.map((a) => [a.program_id, a.rank]));
  const index = new Map(s.programs.map((c, i) => [c.program.id, i]));
  return (a: ProgramCard, b: ProgramCard) =>
    (rank.get(a.program.id) ?? 999) - (rank.get(b.program.id) ?? 999) ||
    (index.get(a.program.id) ?? 0) - (index.get(b.program.id) ?? 0);
}

export const stageOf = (plan: PlanState, id: string): AppStage | undefined => plan.apps[id]?.stage;

/** Steps worth taking now: likely fits, open-to-all help, and benefits the person started. */
export function planItems(s: SessionSnapshot, plan: PlanState): ProgramCard[] {
  return s.programs
    .filter((c) => {
      const tone = toneOf(c);
      if (tone === "fit" || tone === "open") return true;
      const stage = stageOf(plan, c.program.id);
      return c.program.track === "benefit" && !!stage && stage !== "denied" && tone !== "out" && tone !== "have";
    })
    .sort(byPlanRank(s))
    .slice(0, 6);
}

export const isStepDone = (plan: PlanState, id: string) => {
  const stage = stageOf(plan, id);
  return plan.done.includes(id) || stage === "applied" || stage === "approved";
};

export type NextStep =
  | { kind: "resume"; card: ProgramCard }
  | { kind: "plan"; card: ProgramCard }
  | { kind: "question"; open: OpenQuestionView }
  | { kind: "done" };

/** Resume a guide in progress, else the first open plan step, else the best question. */
export function nextStep(s: SessionSnapshot, plan: PlanState): NextStep {
  const inProgress = s.programs.find(
    (c) => c.program.guide && stageOf(plan, c.program.id) === "gather" && toneOf(c) !== "out",
  );
  if (inProgress) return { kind: "resume", card: inProgress };
  const first = planItems(s, plan).find((c) => !isStepDone(plan, c.program.id));
  if (first) return { kind: "plan", card: first };
  if (s.open_questions[0]) return { kind: "question", open: s.open_questions[0] };
  return { kind: "done" };
}

// ---------------------------------------------------------------------------
// Hours: this week's drop-in times
// ---------------------------------------------------------------------------

export type WeekEvent = { card: ProgramCard; entry: HoursEntry };
export type WeekDay = { date: Date; offset: number; events: WeekEvent[] };

/** Monday = 0 ... Sunday = 6, matching HoursEntry.days. */
const weekday = (d: Date) => (d.getDay() + 6) % 7;

function opensOn(entry: HoursEntry, d: Date): boolean {
  if (!entry.days.includes(weekday(d))) return false;
  if (entry.nth_weekday == null) return true;
  return Math.ceil(d.getDate() / 7) === entry.nth_weekday;
}

/** The next 7 days of posted hours for programs that may help. Unknown hours are left out. */
export function weekEvents(s: SessionSnapshot, today = new Date()): WeekDay[] {
  const cards = s.programs.filter(
    (c) => c.program.hours?.length && ["fit", "open", "maybe", "have"].includes(toneOf(c)),
  );
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const events = cards.flatMap((card) =>
      (card.program.hours ?? []).filter((entry) => opensOn(entry, date)).map((entry) => ({ card, entry })),
    );
    return { date, offset, events };
  });
}

export const dayName = (day: WeekDay, short = false) =>
  day.offset === 0
    ? "Today"
    : day.offset === 1
      ? short
        ? "Tmrw"
        : "Tomorrow"
      : day.date.toLocaleDateString("en-US", { weekday: short ? "short" : "long" });

// ---------------------------------------------------------------------------
// Documents: one entry per kind of paper
// ---------------------------------------------------------------------------

export type DocNeed = { kind: string; texts: string[] };

/** The provider's document list grouped by kind (index-aligned with document_kinds). */
export function docsFor(p: Program): DocNeed[] {
  const out: DocNeed[] = [];
  (p.documents_needed ?? []).forEach((text, i) => {
    const kind = p.document_kinds[i] ?? `${p.id}:${i}`;
    const found = out.find((d) => d.kind === kind);
    if (found) found.texts.push(text);
    else out.push({ kind, texts: [text] });
  });
  return out;
}

/** Every kind of paper the person's live programs (and started applications) ask for, most-used first. */
export function walletKinds(s: SessionSnapshot, plan: PlanState): { kind: string; texts: string[]; uses: string[] }[] {
  const out = new Map<string, { kind: string; texts: string[]; uses: string[] }>();
  for (const card of s.programs) {
    const tone = toneOf(card);
    const started = !!plan.apps[card.program.id] && tone !== "have";
    if (!(["fit", "maybe", "later"].includes(tone) || started)) continue;
    for (const d of docsFor(card.program)) {
      const entry = out.get(d.kind) ?? { kind: d.kind, texts: [], uses: [] };
      entry.texts.push(...d.texts);
      entry.uses.push(card.program.id);
      out.set(d.kind, entry);
    }
  }
  return [...out.values()].sort((a, b) => b.uses.length - a.uses.length);
}

export function readiness(p: Program, plan: PlanState) {
  const docs = docsFor(p);
  return { got: docs.filter((d) => plan.docs.includes(d.kind)).length, total: docs.length };
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

/** The answered item for a question id or profile field, if any. */
export const answerFor = (s: SessionSnapshot, idOrField: string): AnsweredItem | undefined =>
  s.answered.find(
    (a) => !a.skipped && (a.question_id === idOrField || a.question.target_field === idOrField),
  );

/** True when the stored answer includes one of these option ids (compared by label). */
export function answerIncludes(item: AnsweredItem | undefined, optionIds: string[]): boolean {
  if (!item) return false;
  const labels = item.question.options.filter((o) => optionIds.includes(o.id)).map((o) => o.label);
  const shown = item.display_value.split(", ");
  return labels.some((label) => label === item.display_value || shown.includes(label));
}

/** Guide notes whose condition matches the person's answers. Text comes from the record. */
export function guideNotes(s: SessionSnapshot, card: ProgramCard): string[] {
  return (card.program.guide?.conditional_notes ?? [])
    .filter((n) => answerIncludes(answerFor(s, n.field), n.any_of))
    .map((n) => n.text);
}

/** Tailoring questions for one guide: still open (and not already an eligibility ask), and answered. */
export function tailoring(s: SessionSnapshot, card: ProgramCard) {
  const ids = card.program.guide?.tailor_questions ?? [];
  const asks = new Set(asksFor(card, openIds(s)));
  const open = s.open_questions.filter((o) => ids.includes(o.question.id) && !asks.has(o.question.id));
  const answered = s.answered.filter((a) => ids.includes(a.question_id) && !a.skipped);
  return { open, answered };
}
