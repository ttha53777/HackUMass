// How the hub groups and draws each need. Ids, labels and hints come from the front pages'
// list (components/front/needs.ts), whose ids match the backend's `needs` question options.
import { NEED, NEEDS } from "@/components/front/needs";

export const NEED_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Everyday", ids: ["food", "utilities", "phone_internet", "transportation"] },
  { label: "Home & safety", ids: ["housing", "safety", "legal"] },
  { label: "Health", ids: ["healthcare", "mental_health", "disability", "pregnancy_baby"] },
  { label: "Family", ids: ["childcare", "seniors"] },
  { label: "Money & work", ids: ["employment", "taxes"] },
];

/** Symbol id (without "i-") for each need. */
export const NEED_ICON: Record<string, string> = {
  food: "n-food",
  utilities: "n-heat",
  housing: "n-housing",
  healthcare: "n-medical",
  transportation: "n-transport",
  phone_internet: "n-phone",
  childcare: "n-childcare",
  mental_health: "n-mental",
  legal: "n-legal",
  employment: "n-work",
  taxes: "n-tax",
  safety: "n-safety",
  seniors: "n-senior",
  pregnancy_baby: "n-baby",
  disability: "n-disability",
};

export const needLabel = (id: string) => NEED[id]?.label ?? id;
export const needIcon = (id: string | null) => (id && NEED_ICON[id]) || "local";

/** Every need the hub offers, for search. */
export const ALL_NEEDS = NEEDS;
