"use client";

import Link from "next/link";
import { use } from "react";

import { GuideView } from "./guide-view";
import { btn } from "@/components/od/ui";
import { useApp } from "@/components/session/session-provider";
import { PageHead } from "@/components/shell/page-head";

/** Finds the guide for a slug in the session and shows it. */
export function GuideRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { snapshot } = useApp();
  const card = snapshot?.programs.find((c) => c.program.guide?.slug === slug);
  if (!card?.program.guide) {
    return (
      <>
        <PageHead title="We couldn't find that guide">It may not match what you picked. Your benefits list shows every guide for you.</PageHead>
        <Link href="/benefits" className={btn("ghost")}>
          All government benefits
        </Link>
      </>
    );
  }
  return <GuideView card={card} />;
}
