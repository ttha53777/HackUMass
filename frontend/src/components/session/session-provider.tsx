"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useSession, type SessionController } from "@/hooks/use-session";
import { snapshotFixture } from "@/lib/fixtures/snapshot";

/**
 * One session for the whole app, kept across page navigation.
 * NEXT_PUBLIC_UI_FIXTURE=1 swaps in the canned snapshot so every screen can be
 * built and reviewed without a backend; answers are then ignored.
 */
const Ctx = createContext<SessionController | null>(null);

const USE_FIXTURE = process.env.NEXT_PUBLIC_UI_FIXTURE === "1";

function Fixture({ children }: { children: ReactNode }) {
  const value: SessionController = {
    snapshot: snapshotFixture,
    loadError: null,
    answerError: null,
    expired: false,
    working: false,
    submit: async () => true,
    submitEvidence: async () => null,
    disconnectBank: async () => null,
    submitDocument: async () => null,
    readPaper: async () => ({ error: null, identity: [], title: null }),
    submitReview: async () => null,
    restart: async () => {},
    clearAnswerError: () => {},
    whenIdle: async () => {},
    refresh: async () => {},
    demo: false,
    beginDemo: () => {},
    endDemo: async () => {},
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function Live({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useSession()}>{children}</Ctx.Provider>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return USE_FIXTURE ? <Fixture>{children}</Fixture> : <Live>{children}</Live>;
}

export function useApp(): SessionController {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp must be used inside SessionProvider");
  return value;
}
