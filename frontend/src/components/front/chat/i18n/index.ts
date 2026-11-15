import type { Lang } from "../content";
import { en } from "./en";
import { es } from "./es";
import { hi } from "./hi";
import { pt } from "./pt";
import type { Dict } from "./types";
import { zh } from "./zh";

export type { Dict } from "./types";

export const DICTS: Record<Lang, Dict> = { en, es, pt, zh, hi };

/** "a, b and c", in the language's own way (Chinese joins with 、 and no spaces). */
export function list(t: Dict, items: string[]): string {
  if (items.length < 2) return items.join("");
  const { sep, and } = t.ui;
  return items.slice(0, -1).join(sep) + (sep === "、" ? and : ` ${and} `) + items[items.length - 1];
}

export const needLabel = (t: Dict, id: string) => t.needs[id]?.[0] ?? id;

/** An income range's label, rebuilt from its id ("0-24000", "24000-36000", "36000-inf"). */
export function incomeLabel(t: Dict, id: string): string | null {
  const m = id.match(/^(\d+)-(\d+|inf)$/);
  if (!m) return null;
  const lo = t.income.money(Number(m[1]));
  if (m[2] === "inf") return t.income.over(lo);
  return Number(m[1]) === 0 ? t.income.under(t.income.money(Number(m[2]))) : t.income.range(lo, t.income.money(Number(m[2])));
}

// The chosen language lives with the name, in this tab only.
const LANG_KEY = "od.lang";

export function readLang(): Lang {
  try {
    const v = window.sessionStorage.getItem(LANG_KEY);
    return v && v in DICTS ? (v as Lang) : "en";
  } catch {
    return "en";
  }
}

export function saveLang(lang: Lang): void {
  try {
    window.sessionStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore: the choice still holds for this visit
  }
}

export function clearLang(): void {
  try {
    window.sessionStorage.removeItem(LANG_KEY);
  } catch {
    // ignore
  }
}
