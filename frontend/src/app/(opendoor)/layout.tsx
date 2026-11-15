import type { ReactNode } from "react";

import { ThroughProvider } from "@/components/front/through";
import { SessionProvider } from "@/components/session/session-provider";
import { ToastProvider } from "@/components/shell/toast";

/**
 * One session for the front door and the dashboard, kept across navigation.
 * The door transition sits here, above both, so it can cover a route change.
 */
export default function OpenDoorLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <ThroughProvider>{children}</ThroughProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
