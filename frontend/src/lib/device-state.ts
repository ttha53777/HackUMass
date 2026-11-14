// Small per-device conveniences. Never sent to the server, never holds answers or documents.
// Every access is wrapped: storage can be blocked or empty in private windows.
const NAME_KEY = "od.name";

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
