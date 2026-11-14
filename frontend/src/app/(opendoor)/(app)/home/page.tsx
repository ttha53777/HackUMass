"use client";

import { PageHead } from "@/components/shell/page-head";
import { useApp } from "@/components/session/session-provider";

export default function HomePage() {
  const { snapshot } = useApp();
  const next = snapshot?.open_questions[0]?.question;
  return (
    <>
      <PageHead title="Your plan">Home is built in Phase 4. The shell, theme and navigation are live.</PageHead>
      <p className="text-muted-foreground">{next ? `Next question: ${next.prompt}` : "All caught up."}</p>
    </>
  );
}
