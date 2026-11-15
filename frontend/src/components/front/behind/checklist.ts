// The coordinator's checklist, in the order backend/app/graph/administrator.py `decide()`
// reads it: it stops at the first line that's true, that helper runs, and it starts
// again from the top. Step 0 (storing a form helper's result) dispatches nothing, so
// it is not a row.

export type Row = { q: string; go: string; kind: "helper" | "you" };

export const ROWS: Row[] = [
  { q: "Is there a paper to read?", go: "Document Reader", kind: "helper" }, // 1a
  { q: "Is there a new answer to file?", go: "Listener", kind: "helper" }, // 1b
  { q: "Did your needs or ZIP code change?", go: "Finder", kind: "helper" }, // 2
  { q: "Is a key question still unanswered?", go: "Asks you", kind: "you" }, // 3
  { q: "Are any results out of date?", go: "Checker", kind: "helper" }, // 4
  { q: "Is the plan out of date?", go: "Planner", kind: "helper" }, // 5
  { q: "Would one more answer sharpen a result?", go: "Asks a follow-up", kind: "you" }, // 6
  { q: "Nothing left to do?", go: "All done", kind: "you" }, // 7
];

/** Rows where the turn ends and waits for you. */
export const ENDS: Record<number, string> = {
  3: "Turn ends · waits for your answer",
  6: "Turn ends · waits for your answer",
  7: "Turn ends · your plan is ready",
};

/** Moments to replay: the row each pass of the checklist stops at. */
export const MOMENTS = [
  { key: "zip", label: "You enter your ZIP code", passes: [1, 2, 3] },
  { key: "last", label: "You answer the last key question", passes: [1, 4, 5, 6] },
  { key: "done", label: "You answer every follow-up", passes: [1, 4, 5, 7] },
] as const;

export type MomentKey = (typeof MOMENTS)[number]["key"];
