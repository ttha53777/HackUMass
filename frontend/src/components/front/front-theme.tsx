"use client";

import { useEffect } from "react";

/**
 * Marks <html data-od-front> while a front page is showing, so the page behind
 * the wrapper (overscroll, the body) is paper too. An effect rather than
 * html:has(.od-front): Next keeps visited routes mounted but hidden, and React
 * runs this cleanup when that happens, so the dashboard never inherits it.
 */
export function FrontTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-od-front", "");
    // Light only: the app's own tokens (used by Building until it is restyled) ignore the system theme here too.
    const theme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      root.removeAttribute("data-od-front");
      if (theme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", theme);
    };
  }, []);
  return null;
}
