import { DrawerProvider } from "@/components/program/drawer";
import { AnswerProvider } from "@/components/session/answer-provider";
import { PlanProvider } from "@/components/session/plan-state";
import { AppShell } from "@/components/shell/app-shell";
import { Gate } from "@/components/shell/gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Gate>
      <PlanProvider>
        <AnswerProvider>
          <DrawerProvider>
            <AppShell>{children}</AppShell>
          </DrawerProvider>
        </AnswerProvider>
      </PlanProvider>
    </Gate>
  );
}
