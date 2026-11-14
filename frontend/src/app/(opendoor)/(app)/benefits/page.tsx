"use client";

import Link from "next/link";

import { useApp } from "@/components/session/session-provider";
import { PageHead } from "@/components/shell/page-head";
import { benefits } from "@/lib/derive";

export default function BenefitsPage() {
  const { snapshot } = useApp();
  const list = snapshot ? benefits(snapshot) : [];
  return (
    <>
      <PageHead kind={{ label: "Government benefits", tone: "gov" }} title="Benefits to apply for">
        Each one has a step-by-step guide.
      </PageHead>
      <ul className="grid gap-2">
        {list.map(({ program, assessment }) =>
          program.guide ? (
            <li key={program.id}>
              <Link className="font-bold text-gov-ink underline" href={`/benefits/${program.guide.slug}`}>
                {program.guide.short_name}
              </Link>{" "}
              <span className="text-muted-foreground">{assessment?.status}</span>
            </li>
          ) : null,
        )}
      </ul>
    </>
  );
}
