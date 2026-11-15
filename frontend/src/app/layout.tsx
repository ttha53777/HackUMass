import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import Script from "next/script";

import "./globals.css";

const body = DM_Sans({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const display = Manrope({ variable: "--font-display", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "OpenDoor",
  description: "Find government benefits and local help near you, one question at a time.",
};

/**
 * Runs before the app on every page:
 *  - the saved light/dark choice (components/shell/theme-toggle.tsx), so the page
 *    doesn't flash the other theme;
 *  - ?demo=1 / ?demo=0 for the "Agents at work" panel (components/loop/agent-flow-mini.tsx),
 *    remembered before a redirect can drop the query.
 */
const BOOT = `try{var t=localStorage.getItem("crn.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;var d=new URLSearchParams(location.search).get("demo");if(d==="1")localStorage.setItem("crn.demo","1");else if(d==="0")localStorage.removeItem("crn.demo")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <Script id="boot" strategy="beforeInteractive">
          {BOOT}
        </Script>
        {children}
      </body>
    </html>
  );
}
