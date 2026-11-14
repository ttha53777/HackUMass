"use client";

import { use } from "react";

import { useApp } from "@/components/session/session-provider";
import { PageHead } from "@/components/shell/page-head";

export default function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { snapshot } = useApp();
  const card = snapshot?.programs.find((c) => c.program.guide?.slug === slug);
  if (!card?.program.guide) return <PageHead title="We couldn't find that guide" />;
  return (
    <>
      <PageHead kind={{ label: "Government benefit", tone: "gov" }} title={card.program.guide.short_name}>
        {card.program.guide.what}
      </PageHead>
    </>
  );
}
