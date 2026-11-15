import { Atkinson_Hyperlegible_Next, Caveat, IBM_Plex_Mono, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import { FrontDefs } from "@/components/front/front-defs";
import { FrontTheme } from "@/components/front/front-theme";

import "@/components/front/front.css";

// The front pages' own type, set as variables on the wrapper only, so the
// dashboard keeps DM Sans and Manrope.
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

/**
 * The landing page, Behind the scenes, the conversation and Building: an
 * editorial paper look, light only, scoped under .od-front.
 */
export default function FrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`od-front ${display.variable} ${body.variable} ${mono.variable} ${hand.variable}`}>
      <FrontTheme />
      <FrontDefs />
      {children}
    </div>
  );
}
