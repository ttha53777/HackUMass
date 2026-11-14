"use client";

import { useApp } from "@/components/session/session-provider";
import { PageHead } from "@/components/shell/page-head";
import { localHelp } from "@/lib/derive";

export default function LocalPage() {
  const { snapshot } = useApp();
  const list = snapshot ? localHelp(snapshot) : [];
  return (
    <>
      <PageHead kind={{ label: "Local help", tone: "loc" }} title="Places near you">
        Pantries, meals, shelter and rides. Usually just a call or a visit.
      </PageHead>
      <ul className="grid gap-1.5">
        {list.map(({ program }) => (
          <li key={program.id}>{program.name}</li>
        ))}
      </ul>
    </>
  );
}
