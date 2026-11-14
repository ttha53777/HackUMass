"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatIntake } from "@/components/chat/chat-intake";
import { SAMPLE_NAME } from "@/components/chat/script";
import { useApp } from "@/components/session/session-provider";
import { coreDone } from "@/lib/derive";
import { cleanName, readName, saveName } from "@/lib/device-state";

import { Welcome } from "./welcome";

type Stage = "welcome" | "chat";

/** The front door: Welcome, then a conversation with the navigator, then Home. */
export function FrontDoor() {
  const router = useRouter();
  const { snapshot, working, expired, loadError, restart } = useApp();
  const [stage, setStage] = useState<Stage>("welcome");
  const [name, setName] = useState("");
  const [sample, setSample] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading device storage once on mount
    setName(readName());
  }, []);

  // Someone who already finished the intake (refresh, or came back) goes straight in;
  // someone part-way through picks the conversation up where it was.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !snapshot) return;
    resumed.current = true;
    if (coreDone(snapshot)) router.replace("/home");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time resume decision
    else if (snapshot.answered.length > 0) setStage("chat");
  }, [snapshot, router]);

  const start = (raw: string, asSample = false) => {
    const clean = asSample ? SAMPLE_NAME : cleanName(raw);
    setName(clean);
    saveName(clean);
    setSample(asSample);
    setOpening(true);
    setTimeout(() => setStage("chat"), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450);
  };

  const exit = useCallback(() => {
    setOpening(false);
    setSample(false);
    setStage("welcome");
  }, []);

  if (loadError) {
    return (
      <div className="m-auto max-w-md p-8 text-center">
        <p role="alert" className="mb-4 text-muted-foreground">
          {loadError}
        </p>
        <button type="button" onClick={() => void restart()} className="rounded-[11px] bg-brand px-5 py-[13px] font-bold text-on-brand">
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {expired && stage === "welcome" ? (
        <p role="status" className="bg-amber px-4 py-3 text-center text-[13px] text-amber-ink">
          Your last visit timed out, so we started fresh.
        </p>
      ) : null}
      {stage === "welcome" ? (
        <Welcome
          initialName={name}
          opening={opening}
          busy={!snapshot || working}
          onStart={(raw) => start(raw)}
          onSample={() => start("", true)}
        />
      ) : (
        <ChatIntake key={snapshot?.session_id ?? "none"} name={name} sample={sample} onExit={exit} />
      )}
    </>
  );
}
