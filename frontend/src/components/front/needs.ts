// How the front pages name each need. Ids match the backend's `needs` question options.

export type NeedCopy = { id: string; label: string; hint: string; primary?: boolean };

export const NEEDS: NeedCopy[] = [
  { id: "food", label: "Food", hint: "Groceries, meals, campus pantry", primary: true },
  { id: "utilities", label: "Heat & utilities", hint: "Heating, electric, fuel", primary: true },
  { id: "housing", label: "Rent & housing", hint: "Rent, repairs, a place to stay", primary: true },
  { id: "healthcare", label: "Medical care", hint: "A clinic, coverage", primary: true },
  { id: "transportation", label: "Getting around", hint: "Buses, rides to appointments", primary: true },
  { id: "phone_internet", label: "Phone & internet", hint: "Service, a hotspot" },
  { id: "childcare", label: "Childcare", hint: "Early learning, Head Start" },
  { id: "mental_health", label: "Someone to talk to", hint: "Support, a crisis line", primary: true },
  { id: "legal", label: "Legal help", hint: "Questions, immigration" },
  { id: "employment", label: "Work & training", hint: "Finding a job" },
  { id: "taxes", label: "Free tax help", hint: "Filing for free" },
  { id: "safety", label: "Safety at home", hint: "Confidential support" },
  { id: "seniors", label: "Caring for an older adult", hint: "Meals, rides, home help" },
  { id: "pregnancy_baby", label: "Pregnancy & baby", hint: "WIC, home visits" },
  { id: "disability", label: "Disability support", hint: "Rides, benefits help" },
];

export const NEED: Record<string, NeedCopy> = Object.fromEntries(NEEDS.map((n) => [n.id, n]));
