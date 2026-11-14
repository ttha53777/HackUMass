import { BackendStatus } from "@/components/backend-status";

// Scaffold placeholder. The guided intake (ticket T6) replaces this page.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Community Resource Navigator
      </h1>
      <p className="text-muted-foreground">
        Find government and community assistance near you, one question at a
        time. The guided intake is not built yet.
      </p>
      <div>
        <BackendStatus />
      </div>
    </main>
  );
}
