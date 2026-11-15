// The loop record in plain words. The backend trace (graph/trace.py) carries
// codes, node names and field names only, never a value, so every sentence the
// person sees is written here, from those codes.
import type { TraceEventView } from "@/lib/types";

export type AgentKey =
  | "administrator"
  | "user_intelligence"
  | "document_analysis"
  | "program_discovery"
  | "eligibility"
  | "action_planning"
  | "end";

export const AGENT_LABEL: Record<AgentKey, string> = {
  administrator: "Administrator",
  user_intelligence: "Profile Agent",
  document_analysis: "Document Agent",
  program_discovery: "Discovery Agent",
  eligibility: "Eligibility Agent",
  action_planning: "Action Agent",
  end: "Done",
};

export const agentLabel = (node: string) => AGENT_LABEL[node as AgentKey] ?? node.replace(/_/g, " ");

/** Profile field names, as the questions name them (backend graph/questions.py labels). */
const FIELD_LABEL: Record<string, string> = {
  needs: "what you need help with",
  zip: "ZIP code",
  utility_urgency: "your utility situation",
  housing_status: "housing",
  situation: "work situation",
  household_size: "household size",
  household_who: "who lives with you",
  monthly_income: "monthly income",
  age_60_plus: "age 60 or older",
  heat_included_in_rent: "heat included in rent",
  income_band: "yearly income",
  benefits_held: "benefits you get",
  utility_issues: "heat and utilities",
  housing_need: "housing situation",
  eversource_customer: "Eversource customer",
  umass_affiliation: "UMass community",
  disability_bus: "disability and the bus",
  near_bus_route: "bus route",
  college_student: "college student at home",
  raft_use: "what RAFT would cover",
  evidence_offer: "a way to fill in details",
  monthly_income_confirmation: "monthly income",
  household_size_confirmation: "household size",
};

export const fieldLabel = (field: string) => FIELD_LABEL[field] ?? field.replace(/_/g, " ");

const list = (fields: string[]) => {
  const names = [...new Set(fields.map(fieldLabel))];
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Why the Administrator routed somewhere (decide() reasons). */
const ROUTE_REASON: Record<string, string> = {
  evidence_document: "a paper came in to read",
  answer: "you answered a question",
  evidence_bank: "the simulated bank profile came in",
  evidence_bank_disconnect: "you disconnected the simulated bank",
  review: "you checked what we read from a paper",
  document_queue: "a paper was read and its details need adding",
  needs_or_zip_changed: "your needs or ZIP changed",
  facts_changed: "something it uses changed",
  results_changed: "your results changed",
};

/** Why the Administrator stopped to ask (the question's origin). */
const ASK_REASON: Record<string, (field: string) => string> = {
  // Covers both a disagreement and a single reading waiting for the person's yes.
  conflict: (f) => `A reading of ${f} needs your say-so before it's used, so it asks you`,
  core: (f) => `It needs ${f} to go on, so it asks you`,
  eligibility_followup: (f) => `One answer about ${f} could change a result, so it asks you`,
  evidence_offer: () => "It offers a quicker way to fill in details",
};

/** What a specialist finished, from its counts and field names (graph/trace.finished_event). */
function finished(e: TraceEventView): string {
  const n = e.count ?? 0;
  switch (e.node) {
    case "document_analysis":
      return e.fields.length ? `Read ${list(e.fields)} from the paper` : "Found nothing on the paper that it uses";
    case "user_intelligence":
      return e.fields.length ? `Updated your profile: ${list(e.fields)}` : "Nothing in your profile changed";
    case "program_discovery":
      return `Found ${plural(n, "program")} for your area`;
    case "eligibility":
      return `Checked ${plural(n, "program")} against their published rules`;
    case "action_planning":
      return `Put ${plural(n, "next step")} in order`;
    default:
      return "Finished";
  }
}

/** One trace event as a sentence. */
export function describe(e: TraceEventView): string {
  const agent = agentLabel(e.node);
  switch (e.step) {
    case "routed":
      if (e.node === "end") return "Nothing left to do. Your plan is up to date";
      if (e.node === "user_intelligence" && e.reason === "document_queue" && e.count && e.count > 1)
        return `Sends ${plural(e.count, "paper")} to the ${agent}: their details need adding`;
      return `Sends it to the ${agent}: ${ROUTE_REASON[e.reason ?? ""] ?? "there's work to do"}`;
    case "completed":
      return finished(e);
    case "failed":
      return `The ${agent} hit a problem, so we kept what we had`;
    case "skipped":
      return `The ${agent} already ran twice this time, so it stops here instead of looping`;
    case "asked": {
      const ask = ASK_REASON[e.reason ?? ""];
      const field = e.fields[0] ? fieldLabel(e.fields[0]) : "one detail";
      return ask ? ask(field) : `It asks you about ${field}`;
    }
  }
}

/** Who "speaks" a row: the Administrator routes and asks; specialists finish or fail. */
export const speaker = (e: TraceEventView): string =>
  e.step === "routed" || e.step === "asked" || e.step === "skipped" ? "administrator" : e.node;

/** What started one run of the loop, from its first routing step. */
export function trigger(events: TraceEventView[]): string {
  const first = events.find((e) => e.step === "routed" && e.node !== "end");
  const reason = first?.reason ?? "";
  if (reason in ROUTE_REASON) {
    const text = ROUTE_REASON[reason];
    return text[0].toUpperCase() + text.slice(1);
  }
  return events.some((e) => e.step === "asked") ? "Looking for the next question" : "Checking your plan";
}

/** A run that ended by asking the person again: the loop goes back to them. */
export const loopsBack = (events: TraceEventView[]) => events[events.length - 1]?.step === "asked";

/** The trace grouped into runs (one per graph invoke), newest last. */
export function runs(trace: TraceEventView[]): { invoke: number; events: TraceEventView[] }[] {
  const out: { invoke: number; events: TraceEventView[] }[] = [];
  for (const e of [...trace].sort((a, b) => a.seq - b.seq)) {
    const last = out[out.length - 1];
    if (last && last.invoke === e.invoke) last.events.push(e);
    else out.push({ invoke: e.invoke, events: [e] });
  }
  return out;
}
