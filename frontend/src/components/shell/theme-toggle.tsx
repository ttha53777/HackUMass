"use client";

// Archived: not used by the live app (not routed). The live UI is components/hub/; see app/(opendoor)/_archive/legacy-dashboard/README.md.
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/** Same key the inline script in app/layout.tsx reads before first paint. */
export const THEME_KEY = "crn.theme";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The theme on screen: the saved choice, else the system's. */
function readTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  return set === "light" || set === "dark" ? set : systemTheme();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Still switches for this visit.
  }
  for (const listener of listeners) listener();
}

/** Light / dark switch. Remembered on this device; follows the system until used. */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;
  const label = next === "light" ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${label.toLowerCase()}`}
      title={`Switch to ${label.toLowerCase()}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line bg-surface text-[12px] font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink",
        withLabel ? "px-3 py-1.5" : "size-8 justify-center",
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {withLabel ? label : null}
    </button>
  );
}
