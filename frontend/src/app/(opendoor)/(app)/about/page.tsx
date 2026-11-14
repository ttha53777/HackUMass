"use client";

import { useApp } from "@/components/session/session-provider";
import { PageHead } from "@/components/shell/page-head";

export default function AboutPage() {
  const { snapshot } = useApp();
  return (
    <>
      <PageHead title="About you">Everything you told us. You can change any answer.</PageHead>
      <ul className="grid gap-1.5">
        {snapshot?.answered.map((a) => (
          <li key={a.question_id}>
            <span className="text-muted-foreground">{a.prompt}</span> <strong>{a.display_value}</strong>
          </li>
        ))}
      </ul>
    </>
  );
}
