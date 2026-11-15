import type { ReactNode } from "react";

import { FrontDefs } from "@/components/front/front-defs";
import { FrontTheme } from "@/components/front/front-theme";
import { paperFontVars } from "@/components/front/paper-fonts";

import "@/components/front/front.css";

/**
 * The landing page, Behind the scenes, the conversation and Building: an
 * editorial paper look, light only, scoped under .od-front.
 */
export default function FrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`od-front ${paperFontVars}`}>
      <FrontTheme />
      <FrontDefs />
      {children}
    </div>
  );
}
