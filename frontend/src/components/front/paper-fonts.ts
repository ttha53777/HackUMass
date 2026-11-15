import { Atkinson_Hyperlegible_Next, Caveat, IBM_Plex_Mono, Newsreader } from "next/font/google";

// The paper look's type, shared by the front pages (.od-front) and the Plan Hub (.od-hub).
// Set as CSS variables on each wrapper only, never on <html>.
const display = Newsreader({
  variable: "--font-od-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});
// next/font has no metrics to size a fallback for this face, so use a plain system fallback.
const body = Atkinson_Hyperlegible_Next({
  variable: "--font-od-body",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});
const mono = IBM_Plex_Mono({ variable: "--font-od-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });
const hand = Caveat({ variable: "--font-od-hand", subsets: ["latin"], display: "swap" });

/** Class names that define --font-od-display, --font-od-body, --font-od-mono and --font-od-hand. */
export const paperFontVars = `${display.variable} ${body.variable} ${mono.variable} ${hand.variable}`;
