// The conversation's shape: which questions, in what order, of what kind, with which
// fixed options. The words are in ./i18n, one dictionary per language, ported from the
// design mock's TX tables. Every line is a template filled only with the person's own
// answers or values the backend returned (town, counts, a curated phone number).

/** Question ids, in the order the conversation asks them. "name" stays on the device. */
export type Qid =
  | "name"
  | "needs"
  | "zip"
  | "household_size"
  | "household_who"
  | "utility_urgency"
  | "housing_status"
  | "income_band"
  | "review";

export type Kind = "text" | "needs" | "zip" | "count" | "multi" | "single" | "review";

/** The questions the backend asks first; the plan can't be built without them. */
export const CORE: Qid[] = ["needs", "zip", "household_size", "household_who"];

/** Asked after the core, in this order, only while the backend lists them as useful. */
export const EXTRAS: Qid[] = ["utility_urgency", "housing_status", "income_band"];

export const KIND: Record<Qid, Kind> = {
  name: "text",
  needs: "needs",
  zip: "zip",
  household_size: "count",
  household_who: "multi",
  utility_urgency: "single",
  housing_status: "single",
  income_band: "single",
  review: "review",
};

/** Questions with a skip button (the name is skipped by leaving it blank). */
export const SKIPPABLE = new Set<Qid>(["income_band"]);

export type Opt = { id: string; label: string; only?: boolean };

/** Fixed options, in the mock's order, by the backend's option ids. Labels come from the dictionary. */
export const OPTION_IDS = {
  household_who: [{ id: "60" }, { id: "55" }, { id: "child" }, { id: "none", only: true }],
  utility_urgency: [{ id: "shutoff" }, { id: "behind" }, { id: "reduce" }],
  housing_status: [{ id: "renting" }, { id: "own" }, { id: "staying_with_others" }, { id: "no_stable_housing" }],
} as const;

/** Help that often goes together, offered once after the needs answer (the mock's map). */
export const RELATED: Record<string, string[]> = {
  food: ["utilities", "healthcare"],
  utilities: ["housing", "phone_internet"],
  housing: ["utilities", "legal"],
  healthcare: ["transportation", "mental_health"],
  transportation: ["healthcare", "employment"],
  phone_internet: ["utilities", "employment"],
  childcare: ["food", "employment"],
  mental_health: ["healthcare", "safety"],
  legal: ["housing"],
  employment: ["childcare", "transportation"],
  taxes: ["employment"],
  safety: ["housing", "mental_health"],
  seniors: ["food", "transportation", "healthcare"],
  pregnancy_baby: ["food", "healthcare", "childcare"],
  disability: ["transportation", "healthcare"],
};

/**
 * Words to needs, used only when the server can't read a message (offline or
 * rate-limited). The server's reading (`/interpret`) is preferred.
 */
export const KEYWORDS: [RegExp, string][] = [
  [/food|grocer|hungry|eat|meal|pantry|snap|ebt|payday|campus|umass|tuition|textbook/i, "food"],
  [/heat|electric|gas\b|oil|fuel|shut.?off|utility|utilities|propane|cold/i, "utilities"],
  [/rent|evict|housing|landlord|apartment|homeless|place to stay|mortgage/i, "housing"],
  [/doctor|clinic|sick|medic|prescription|health insurance|dentist/i, "healthcare"],
  [/bus|ride|car\b|transport|get to|appointment/i, "transportation"],
  [/phone|internet|wi-?fi|hotspot|cut off/i, "phone_internet"],
  [/child ?care|daycare|kid|preschool|toddler/i, "childcare"],
  [/elderly|senior|older adult|aging|caregiv|nursing home|meals on wheels/i, "seniors"],
  [/pregnan|expecting|newborn|baby|babies|infant|diaper|formula|\bwic\b|prenatal/i, "pregnancy_baby"],
  [/disab|wheelchair|\bssdi?\b|paratransit|mobility/i, "disability"],
  [/talk|lonely|anxious|depress|stress|sad|overwhelm|mom\b|a hand/i, "mental_health"],
  [/lawyer|legal|court|immigra|visa/i, "legal"],
  [/job|work|laid off|unemploy|career|training/i, "employment"],
  [/tax/i, "taxes"],
  [/hits me|abuse|violent|afraid of|scared of|unsafe at home/i, "safety"],
];
export const CRISIS = /kill myself|suicid|end my life|hurt myself|want to die|in danger|hits me|going to hurt/i;

export const parseNeeds = (text: string) => [...new Set(KEYWORDS.filter(([re]) => re.test(text)).map(([, id]) => id))];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The example played for you: Maya, in Amherst. */
export const SAMPLE = {
  name: "Maya",
  needs: ["food", "utilities"],
  zip: "01002",
  size: 2,
  who: ["60"],
  utility_urgency: "behind",
  housing_status: "renting",
  /** About $2,000 a month: the yearly range that holds $24,000. */
  yearly: 24000,
};

/** Each language's name is written in its own language and script. */
export const LANGS = [
  { id: "en", tag: "en", name: "English" },
  { id: "es", tag: "es", name: "Español" },
  { id: "pt", tag: "pt", name: "Português" },
  { id: "zh", tag: "zh-Hans", name: "中文" },
  { id: "hi", tag: "hi", name: "हिन्दी" },
] as const;
export type Lang = (typeof LANGS)[number]["id"];
