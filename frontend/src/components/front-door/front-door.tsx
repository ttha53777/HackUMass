"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "@/components/session/session-provider";
import { coreDone } from "@/lib/derive";
import { cleanName, readName, saveName } from "@/lib/device-state";
import type { AnswerIn } from "@/lib/types";

import { Building } from "./building";
import { Intake } from "./intake";
import { Welcome } from "./welcome";

type Stage = "welcome" | "intake" | "building";

const SAMPLE = { name: "Maya", needs: ["food", "utilities"], zip: "01002", size: 2, who: ["60"] };

/** The front door: Welcome, then the 3 core questions, then a short Building screen. */
export function FrontDoor() {
  const app = useApp();
  const router = useRouter();
  const { snapshot, working, submit, answerError, expired, loadError, restart, whenIdle } = app;
  const [stage, setStage] = useState<Stage>("welcome");
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState("");
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [minTimeDone, setMinTimeDone] = useState(false);

  // Latest snapshot for async sequences (read after awaiting an answer).
  const latest = useRef(app);
  useEffect(() => {
    latest.current = app;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading device storage once on mount
    setName(readName());
  }, []);

  // A person who already finished intake (refresh, or came back) goes straight in.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !snapshot) return;
    resumed.current = true;
    if (coreDone(snapshot)) router.replace("/home");
  }, [snapshot, router]);

  // Answers that depend on each other go one at a time, each after the backend
  // has finished the run the previous one started.
  const send = useCallback(
    async (body: AnswerIn) => {
      await whenIdle();
      const ok = await submit(body);
      await whenIdle();
      return ok;
    },
    [whenIdle, submit],
  );

  const start = (raw: string) => {
    const clean = cleanName(raw);
    setName(clean);
    saveName(clean);
    setOpening(true);
    setTimeout(
      () => {
        setStage("intake");
        setStep(0);
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450,
    );
  };

  const goBuilding = () => {
    setMinTimeDone(false);
    setStage("building");
  };

  const onNeeds = async (ids: string[]) => {
    setNotice(null);
    if (await send({ question_id: "needs", selected_option_ids: ids })) setStep(1);
  };

  const onZip = async (zip: string) => {
    setNotice(null);
    if (!(await send({ question_id: "zip", value: zip }))) return;
    const s = latest.current.snapshot;
    // Outside coverage, or nothing matched: say so here instead of asking more.
    if (s && (s.coverage !== "supported" || s.programs.length === 0)) {
      setNotice(s.notices[0]?.message ?? "We couldn't find programs for that. Try changing your answers.");
      return;
    }
    setStep(2);
  };

  const onHousehold = async (n: number, who: string[]) => {
    setNotice(null);
    if (!(await send({ question_id: "household_size", value: n }))) return;
    if (!(await send({ question_id: "household_who", selected_option_ids: who }))) return;
    goBuilding();
  };

  const sample = async () => {
    setName(SAMPLE.name);
    setStage("intake");
    if (!(await send({ question_id: "needs", selected_option_ids: SAMPLE.needs }))) return setStep(0);
    if (!(await send({ question_id: "zip", value: SAMPLE.zip }))) return setStep(1);
    setStep(2);
    if (!(await send({ question_id: "household_size", value: SAMPLE.size }))) return;
    if (!(await send({ question_id: "household_who", selected_option_ids: SAMPLE.who }))) return;
    goBuilding();
  };

  // Leave Building once the run is finished and the minimum time has passed.
  useEffect(() => {
    if (stage === "building" && minTimeDone && !working && coreDone(snapshot)) router.replace("/home");
  }, [stage, minTimeDone, working, snapshot, router]);

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
        <Welcome initialName={name} opening={opening} busy={!snapshot || working} onStart={start} onSample={sample} />
      ) : null}
      {stage === "intake" ? (
        <Intake
          step={step}
          name={name}
          snapshot={snapshot}
          working={working}
          notice={notice ?? answerError}
          onBack={() => (step === 0 ? (setOpening(false), setStage("welcome")) : setStep((step - 1) as 0 | 1))}
          onNeeds={onNeeds}
          onZip={onZip}
          onHousehold={onHousehold}
        />
      ) : null}
      {stage === "building" ? <Building name={name} snapshot={snapshot} onMinimumTime={() => setMinTimeDone(true)} /> : null}
    </>
  );
}
