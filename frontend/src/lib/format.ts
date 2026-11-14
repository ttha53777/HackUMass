/** "2026-11-14" -> "Nov 14, 2026". Parsed as a calendar date, so no time zone shifts it. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "1 program" / "3 programs". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Lowercase the first letter, for labels used mid-sentence ("Monthly income" -> "monthly income"). */
export function lowerFirst(text: string): string {
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}
