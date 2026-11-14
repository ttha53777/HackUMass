// Pure selectors over the session snapshot. The backend decides statuses, reasons and
// the question order; this file only groups and counts what it already decided.
import type { EligibilityStatus, ProgramCard, SessionSnapshot } from "./types";

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
