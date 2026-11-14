"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useApp } from "@/components/session/session-provider";
import { coreDone } from "@/lib/derive";

/** The dashboard needs a finished intake. Without one, go back to the front door. */
export function Gate({ children }: { children: ReactNode }) {
  const { snapshot, loadError } = useApp();
  const router = useRouter();
  const ready = coreDone(snapshot);

  useEffect(() => {
    if (snapshot && !ready) router.replace("/");
  }, [snapshot, ready, router]);

  if (loadError) {
    return (
      <div role="alert" className="m-auto flex max-w-md flex-col items-center gap-4 p-8 text-center text-muted-foreground">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-[11px] bg-brand px-5 py-[13px] font-bold text-on-brand hover:bg-brand-hover"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!ready) {
    return <p className="m-auto p-8 text-muted-foreground">Loading your plan...</p>;
  }
  return <>{children}</>;
}
