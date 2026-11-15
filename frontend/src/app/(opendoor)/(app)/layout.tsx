import { Suspense, type ReactNode } from "react";

import { paperFontVars } from "@/components/front/paper-fonts";
import { HubShell } from "@/components/hub/hub-shell";
import { HubProvider } from "@/components/hub/hub-state";
import { AnswerProvider } from "@/components/session/answer-provider";
import { PlanProvider } from "@/components/session/plan-state";
import { Gate } from "@/components/shell/gate";

// Every page here waits for the person's session, which loads in the browser,
// so navigations into this segment are not expected to render instantly.
export const instant = false;

/**
 * The Plan Hub: what the person sees after onboarding (/home, /papers).
 * The old sidebar dashboard is archived in app/(opendoor)/_archive/legacy-dashboard.
 */
export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <HubShell fonts={paperFontVars}>
      <Gate>
        <PlanProvider>
          <AnswerProvider>
            <Suspense>
              <HubProvider>{children}</HubProvider>
            </Suspense>
          </AnswerProvider>
        </PlanProvider>
      </Gate>
    </HubShell>
  );
}
