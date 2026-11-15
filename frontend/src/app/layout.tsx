import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";

import "./globals.css";

const body = DM_Sans({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const display = Manrope({ variable: "--font-display", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "OpenDoor",
  description: "Find government benefits and local help near you, one question at a time.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {/* Demo "Agents at work" panel: remember ?demo=1 / ?demo=0 on any page, before
            a redirect can drop the query (components/loop/agent-flow-mini.tsx reads it). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=new URLSearchParams(location.search).get("demo");if(d==="1")localStorage.setItem("crn.demo","1");else if(d==="0")localStorage.removeItem("crn.demo")}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
