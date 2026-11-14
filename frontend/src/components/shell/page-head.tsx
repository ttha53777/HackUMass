import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHead({
  kind,
  title,
  children,
}: {
  kind?: { label: string; tone: "gov" | "loc" };
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        {kind ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-extrabold tracking-wide",
              kind.tone === "gov" ? "bg-gov text-gov-ink" : "bg-loc text-loc-ink",
            )}
          >
            {kind.label}
          </span>
        ) : null}
        <h1 className="my-2 font-display text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.12] tracking-[-0.04em]">{title}</h1>
        {children ? <p className="max-w-[640px] text-[14.5px] leading-[1.7] text-muted-foreground">{children}</p> : null}
      </div>
    </div>
  );
}
