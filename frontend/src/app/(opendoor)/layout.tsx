import type { ReactNode } from "react";

import { SessionProvider } from "@/components/session/session-provider";
import { ToastProvider } from "@/components/shell/toast";

/**
 * One session for the front door and the dashboard, kept across navigation.
 * /legacy sits outside this group on purpose: it runs its own session hook.
 */
export default function OpenDoorLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
