// Small per-device conveniences. Never sent to the server, never holds answers or documents.
// Every access is wrapped: storage can be blocked or empty in private windows.
const NAME_KEY = "od.name";
const PLAN_KEY = "od.plan";

export function readName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string): void {
  try {
    if (name) window.localStorage.setItem(NAME_KEY, name);
    else window.localStorage.removeItem(NAME_KEY);
  } catch {
    // ignore
  }
}

export const cleanName = (raw: string) => raw.trim().replace(/\s+/g, " ").slice(0, 40);

/** Where the person says they are with one benefit application. */
export type AppStage = "gather" | "applied" | "approved" | "denied";

export const STAGE_LABEL: Record<AppStage, string> = {
  gather: "Getting ready",
  applied: "Applied, waiting",
  approved: "Approved",
  denied: "Turned down",
};

/**
 * The person's own progress, saved on this device only and tied to one session:
 * a new session starts empty. Only ids, stages and booleans, never document content.
 */
export type PlanState = {
  sessionId: string | null;
  /** Benefit program id -> stage and when it was set (ISO). */
  apps: Record<string, { stage: AppStage; date: string }>;
  /** Plan items (program ids) the person marked done. */
  done: string[];
  /** Kinds of paper the person said they have ("id", "income", ...). */
  docs: string[];
};

export const emptyPlan = (sessionId: string | null): PlanState => ({ sessionId, apps: {}, done: [], docs: [] });

const STAGES: AppStage[] = ["gather", "applied", "approved", "denied"];
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").slice(0, 200) : [];

export function readPlan(sessionId: string): PlanState {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PLAN_KEY) ?? "null") as Partial<PlanState> | null;
    if (!raw || raw.sessionId !== sessionId) return emptyPlan(sessionId);
    const apps: PlanState["apps"] = {};
    for (const [id, value] of Object.entries(raw.apps ?? {})) {
      if (value && STAGES.includes(value.stage) && typeof value.date === "string") apps[id] = { stage: value.stage, date: value.date };
    }
    return { sessionId, apps, done: strings(raw.done), docs: strings(raw.docs) };
  } catch {
    return emptyPlan(sessionId);
  }
}

export function savePlan(plan: PlanState): void {
  try {
    window.localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {
    // ignore: the plan still works for this visit
  }
}
