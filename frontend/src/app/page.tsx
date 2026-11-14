import { GuidedIntake } from "@/components/intake/guided-intake";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Community Resource Navigator
        </h1>
        <p className="text-muted-foreground">
          Answer a few short questions and we’ll point you to government and community programs
          near you.
        </p>
      </header>
      <GuidedIntake />
    </main>
  );
}
