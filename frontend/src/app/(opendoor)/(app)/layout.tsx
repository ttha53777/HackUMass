import { Suspense, type ReactNode } from "react";

import { paperFontVars } from "@/components/front/paper-fonts";
import { FillerProvider } from "@/components/filler/filler-context";
import { HubShell } from "@/components/hub/hub-shell";
import { HubProvider } from "@/components/hub/hub-state";
import { PapersProvider } from "@/components/hub/papers-context";
import { Tour } from "@/components/hub/tour/tour";
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
            <PapersProvider>
              <FillerProvider>
                <Suspense>
                  <HubProvider>
                    {children}
                    <Tour />
                  </HubProvider>
                </Suspense>
              </FillerProvider>
            </PapersProvider>
          </AnswerProvider>
        </PlanProvider>
      </Gate>
    </HubShell>
  );
}
