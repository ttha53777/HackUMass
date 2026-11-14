import { AppShell } from "@/components/shell/app-shell";
import { Gate } from "@/components/shell/gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Gate>
      <AppShell>{children}</AppShell>
    </Gate>
  );
}
