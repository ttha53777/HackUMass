"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";

import { CatIcon, ExtLink, SectionHead } from "@/components/od/ui";
import { useApp } from "@/components/session/session-provider";
import { getWebResources } from "@/lib/api";
import type { WebResourceGroup } from "@/lib/types";

/** Web results for needs we have no checked program for. Kept apart from the plan. */
export function useWebResources(): WebResourceGroup[] {
  const { snapshot, working } = useApp();
  const [groups, setGroups] = useState<WebResourceGroup[]>([]);
  const sessionId = snapshot?.session_id;
  // Re-run when the needs or ZIP answer changes.
  const key = snapshot?.answered
    .filter((a) => a.question_id === "needs" || a.question_id === "zip")
    .map((a) => a.display_value)
    .join("|");
  useEffect(() => {
    if (!sessionId || working) return;
    let live = true;
    getWebResources(sessionId)
      .then((out) => live && setGroups(out.groups))
      .catch(() => live && setGroups([]));
    return () => {
      live = false;
    };
  }, [sessionId, key, working]);
  return groups;
}

export function WebResources() {
  const groups = useWebResources();
  if (!groups.length) return null;
  return (
    <section aria-labelledby="web-resources" className="mt-[30px]">
      <SectionHead title="More places to look" sub="Found on the web" />
      <div className="rounded-[20px] border border-dashed border-line bg-surface-2/60 p-5">
        <p className="mb-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
          <Globe aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-text" />
          <span id="web-resources">
            We don&apos;t have checked programs for these yet, so we searched the web. We haven&apos;t checked these.
            Confirm details with the organization.
          </span>
        </p>
        <div className="grid gap-4 min-[620px]:grid-cols-2">
          {groups.map((g) => (
            <div key={g.need}>
              <p className="mb-2 flex items-center gap-2 text-[13px] font-extrabold">
                <CatIcon category={g.need} className="size-7 rounded-[9px] [&_svg]:size-4" /> {g.label}
              </p>
              <ul className="flex flex-col gap-1.5">
                {g.results.map((r) => (
                  <li key={r.url}>
                    <ExtLink
                      href={r.url}
                      className="group inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-text hover:underline [&_svg]:size-3"
                    >
                      {r.title}
                    </ExtLink>
                    <span className="block text-[11.5px] text-faint">{r.domain}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
