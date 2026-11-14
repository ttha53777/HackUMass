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
      <p role="alert" className="m-auto max-w-md p-8 text-center text-muted-foreground">
        {loadError}
      </p>
    );
  }
  if (!ready) {
    return <p className="m-auto p-8 text-muted-foreground">Loading your plan...</p>;
  }
  return <>{children}</>;
}
