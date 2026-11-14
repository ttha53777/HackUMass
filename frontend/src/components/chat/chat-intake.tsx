"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowRight, HandHeart, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "@/components/session/session-provider";
import { coreDone } from "@/lib/derive";
import type { AnswerIn, Question, SessionSnapshot } from "@/lib/types";

import { BotMessage, TypingBubble, UserMessage } from "./bubbles";
import { Checklist } from "./checklist";
import { Composer } from "./composer";
import { ProfilePanel } from "./profile-panel";
import { QuickReplies } from "./quick-replies";
import {
  CORE_IDS,
  SAMPLE_ANSWERS,
  ack,
  answered,
  chosenLabels,
  greeting,
  parseTyped,
  resultsLine,
  typingMs,
  userSaid,
} from "./script";

type Entry =
  | { key: string; kind: "bot" | "warn"; text: string; animate: boolean }
  | { key: string; kind: "question"; question: Question; animate: boolean }
  | { key: string; kind: "user"; text: string; animate: boolean }
  | { key: string; kind: "checklist" }
  | { key: string; kind: "results"; headline: string; detail: string };

type Phase = "chat" | "checking" | "done";

const isCore = (id: string) => (CORE_IDS as readonly string[]).includes(id);

// Unique per message; survives Fast Refresh resetting module state.
const nextKey = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The guided intake as a conversation. The navigator asks whatever core
 * question the backend has pending, acknowledges each answer from the returned
 * snapshot, then checks programs in-thread and hands over to Home.
 */
export function ChatIntake({ name, sample, onExit }: { name: string; sample: boolean; onExit: () => void }) {
  const app = useApp();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [typing, setTyping] = useState(false);
  const [asking, setAsking] = useState<Question | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("chat");
  const [minTimeDone, setMinTimeDone] = useState(false);
  const [ghost, setGhost] = useState<string | undefined>(undefined);
  // "Try a sample" plays the core questions only; afterwards the person drives.
  const autoplay = sample && phase === "chat";

  // Latest app state for async sequences, read after each await.
  const latest = useRef(app);
  useEffect(() => {
    latest.current = app;
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const composer = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const push = useCallback((entry: Entry) => setEntries((list) => [...list, entry]), []);
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const say = useCallback(
    async (text: string, kind: "bot" | "warn" = "bot") => {
      setTyping(true);
      await wait(typingMs(text, reduced));
      if (!alive.current) return;
      setTyping(false);
      push({ key: nextKey(), kind, text, animate: true });
    },
    [push, reduced],
  );

  const ask = useCallback(
    async (q: Question) => {
      setTyping(true);
      await wait(typingMs(q.prompt, reduced));
      if (!alive.current) return;
      setTyping(false);
      push({ key: nextKey(), kind: "question", question: q, animate: true });
      await wait(reduced ? 0 : 180);
      if (alive.current) setAsking(q);
    },
    [push, reduced],
  );

  const finish = useCallback(async () => {
    setPhase("checking");
    setMinTimeDone(false);
    await say("Give me a moment. I'm checking every program near you against what you told me.");
    if (alive.current) push({ key: nextKey(), kind: "checklist" });
  }, [push, say]);

  /** Ask the backend's next core question, or wrap up once the core is done. */
  const advance = useCallback(async () => {
    const s = latest.current.snapshot;
    if (coreDone(s)) return finish();
    const q = s?.pending_question;
    if (q && isCore(q.id)) return ask(q);
    return finish();
  }, [ask, finish]);

  // Answers that depend on each other go one at a time, each after the backend
  // finished the run the previous one started.
  const send = useCallback(async (body: AnswerIn) => {
    const { whenIdle, submit } = latest.current;
    await whenIdle();
    const ok = await submit(body);
    await whenIdle();
    return ok;
  }, []);

  const answer = useCallback(
    async (body: AnswerIn, q: Question) => {
      const wasDone = phase === "done";
      setAsking(null);
      setHint(null);
      setGhost(undefined);
      push({ key: nextKey(), kind: "user", text: userSaid(q, body), animate: true });
      setTyping(true);
      const ok = await send(body);
      if (!alive.current) return;
      const s = latest.current.snapshot as SessionSnapshot;
      if (!ok) {
        setTyping(false);
        push({ key: nextKey(), kind: "warn", text: latest.current.answerError ?? "That didn't go through. Try again?", animate: true });
        setAsking(q);
        return;
      }
      if (q.id === "zip" && (s.coverage !== "supported" || s.programs.length === 0)) {
        await say(s.notices[0]?.message ?? "I couldn't find programs for that ZIP yet.", "warn");
        await say("Want to try a different ZIP? Most programs here serve Amherst and nearby towns.");
        if (alive.current) setAsking(q);
        return;
      }
      await say(ack(q.id, s));
      if (!alive.current) return;
      if (wasDone && coreDone(s)) {
        const r = resultsLine(s);
        await say("Here's your updated picture.");
        push({ key: nextKey(), kind: "results", ...r });
        return;
      }
      await advance();
    },
    [advance, phase, push, say, send],
  );

  const typed = (raw: string) => {
    if (!asking) return;
    const parsed = parseTyped(asking, raw);
    if ("hint" in parsed) return setHint(parsed.hint || null);
    void answer(parsed, asking);
  };

  const edit = useCallback(
    async (questionId: string) => {
      const item = answered(latest.current.snapshot, questionId);
      if (!item) return;
      setAsking(null);
      setHint(null);
      await say("Sure, let's change that.");
      await ask(item.question);
    },
    [ask, say],
  );

  // Start once the session is loaded. A session already part-way through is
  // replayed instantly, so a refresh keeps the conversation.
  const started = useRef(false);
  const sessionId = useRef<string | null>(null);
  useEffect(() => {
    const s = app.snapshot;
    if (started.current || !s || app.working) return;
    started.current = true;
    sessionId.current = s.session_id;
    const replay: Entry[] = [];
    const done = CORE_IDS.map((id) => answered(s, id)).filter((a) => !!a);
    if (done.length) {
      replay.push({ key: nextKey(), kind: "bot", text: greeting(name), animate: false });
      for (const item of done) {
        replay.push({ key: nextKey(), kind: "question", question: item.question, animate: false });
        const labels = chosenLabels(item);
        replay.push({ key: nextKey(), kind: "user", text: labels.length ? labels.join(", ") : item.display_value, animate: false });
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time replay of a resumed session
      setEntries(replay);
      void advance();
    } else {
      void say(greeting(name)).then(() => advance());
    }
  }, [app.snapshot, app.working, advance, name, say]);

  // The session was lost and replaced: this conversation no longer applies.
  useEffect(() => {
    if (sessionId.current && app.snapshot && app.snapshot.session_id !== sessionId.current) onExit();
  }, [app.snapshot, onExit]);

  // Results appear once the backend finished and the checklist had its moment.
  const resultsShown = useRef(false);
  useEffect(() => {
    if (phase !== "checking" || !minTimeDone || app.working || !coreDone(app.snapshot) || resultsShown.current) return;
    resultsShown.current = true;
    const r = resultsLine(app.snapshot as SessionSnapshot);
    void (async () => {
      setTyping(true);
      await wait(typingMs(r.headline, reduced));
      if (!alive.current) return;
      setTyping(false);
      push({ key: nextKey(), kind: "results", ...r });
      setPhase("done");
    })();
  }, [phase, minTimeDone, app.working, app.snapshot, push, reduced]);

  // "Try a sample": answer each question as if typed, after a short pause.
  useEffect(() => {
    if (!autoplay || !asking) return;
    const body = SAMPLE_ANSWERS[asking.id];
    if (!body) return;
    const q = asking;
    let cancelled = false;
    void (async () => {
      await wait(reduced ? 0 : 750);
      if (q.type === "zip" || q.type === "number") {
        const text = String(body.value);
        for (let i = 1; i <= text.length && !cancelled; i++) {
          setGhost(text.slice(0, i));
          await wait(reduced ? 0 : 110);
        }
        await wait(reduced ? 0 : 250);
      }
      if (!cancelled && alive.current) void answer(body, q);
    })();
    return () => {
      cancelled = true;
    };
  }, [autoplay, asking, answer, reduced]);

  // Keep the newest message in view while the thread grows (messages, chips, the
  // checklist filling in), unless the person scrolled up to reread.
  const stick = useRef(true);
  useEffect(() => {
    stick.current = true;
  }, [entries.length, asking]);
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 48;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stick.current = false;
    };
    const onScroll = () => {
      if (atBottom()) stick.current = true;
    };
    const follow = () => {
      if (stick.current) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduced ? "auto" : "smooth" });
    };
    const observer = new ResizeObserver(follow);
    observer.observe(log);
    window.addEventListener("wheel", onWheel, { passive: true });
    const onTouch = () => {
      stick.current = false;
    };
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduced]);
  useEffect(() => {
    if (asking && (asking.type === "zip" || asking.type === "text" || asking.type === "currency")) {
      composer.current?.focus({ preventScroll: true });
    }
  }, [asking]);

  const answeredCore = CORE_IDS.filter((id) => answered(app.snapshot, id)).length;
  const placeholder = !asking
    ? "…"
    : asking.type === "zip"
      ? "Type your 5-digit ZIP, like 01002"
      : asking.type === "number"
        ? "Or type a number"
        : asking.allow_other
          ? "Or tell me in your own words…"
          : "Tap any that apply, or type one";

  return (
    <MotionConfig reducedMotion="user">
      <section className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/85 px-4 py-3.5 backdrop-blur">
          <div className="mx-auto flex w-[min(1120px,100%)] items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-display text-xl font-extrabold tracking-[-0.05em]">
              <span className="grid size-7 place-items-center rounded-[9px] bg-brand text-on-brand">
                <HandHeart aria-hidden className="size-4" />
              </span>
              <span>
                Open<b className="text-art-h1">Door</b>
              </span>
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5" aria-label={`${answeredCore} of ${CORE_IDS.length} answered`} role="img">
                {CORE_IDS.map((id, i) => (
                  <motion.i
                    key={id}
                    aria-hidden
                    className="block h-[5px] w-5 rounded-full min-[600px]:w-7"
                    initial={false}
                    animate={{ backgroundColor: i < answeredCore ? "var(--brand)" : "var(--line)" }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await latest.current.restart();
                  onExit();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-muted-foreground hover:text-ink"
              >
                <RotateCcw aria-hidden className="size-3.5" />
                <span className="max-[599px]:sr-only">Start over</span>
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid w-[min(1120px,100%)] flex-1 items-start gap-5 px-4 pt-5 min-[900px]:grid-cols-[290px_minmax(0,1fr)] min-[900px]:gap-12 min-[900px]:pt-10">
          <ProfilePanel name={name} snapshot={app.snapshot} canEdit={phase !== "checking" && !typing && !app.working && !autoplay} onEdit={(id) => void edit(id)} />

          <div className="flex min-h-[calc(100vh-140px)] flex-col">
            <div ref={logRef} role="log" aria-live="polite" aria-label="Conversation with your navigator" className="flex flex-1 flex-col gap-5 pb-4">
              {entries.map((e, i) => {
                const prev = entries[i - 1];
                const lead = !prev || prev.kind === "user";
                return (
                  <motion.div key={e.key} layout="position" transition={{ type: "spring", stiffness: 400, damping: 36 }}>
                    {e.kind === "bot" ? <BotMessage lead={lead} animate={e.animate}>{e.text}</BotMessage> : null}
                    {e.kind === "warn" ? <BotMessage lead={lead} tone="warn" animate={e.animate}>{e.text}</BotMessage> : null}
                    {e.kind === "question" ? (
                      <BotMessage lead={lead} tone="question" animate={e.animate}>
                        {e.question.prompt}
                        {e.question.reason ? (
                          <span className="mt-1.5 block font-sans text-[13.5px] font-medium leading-relaxed tracking-normal text-muted-foreground">
                            {e.question.reason}
                          </span>
                        ) : null}
                      </BotMessage>
                    ) : null}
                    {e.kind === "user" ? <UserMessage animate={e.animate}>{e.text}</UserMessage> : null}
                    {e.kind === "checklist" ? <Checklist snapshot={app.snapshot} reduced={reduced} onMinimumTime={() => setMinTimeDone(true)} /> : null}
                    {e.kind === "results" ? (
                      <BotMessage lead={lead}>
                        <span className="block font-display text-[clamp(19px,2.2vw,23px)] font-extrabold leading-[1.3] tracking-[-0.03em] text-ink">{e.headline}</span>
                        <span className="mt-1 block">{e.detail}</span>
                        <motion.button
                          type="button"
                          onClick={() => router.replace("/home")}
                          whileHover={{ x: 2 }}
                          whileTap={{ scale: 0.97 }}
                          className="mt-4 inline-flex items-center gap-2 rounded-[12px] bg-brand px-5 py-3 font-bold text-on-brand hover:bg-brand-hover"
                        >
                          See my plan <ArrowRight aria-hidden className="size-4" />
                        </motion.button>
                        <span className="mt-2.5 block text-xs text-faint">You can change any answer in your profile first.</span>
                      </BotMessage>
                    ) : null}
                  </motion.div>
                );
              })}

              <AnimatePresence>{typing ? <TypingBubble key="typing" lead={entries[entries.length - 1]?.kind === "user" || entries.length === 0} /> : null}</AnimatePresence>

              <AnimatePresence mode="wait">
                {asking && !typing ? (
                  <motion.div key={asking.id + entries.length} exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}>
                    <QuickReplies question={asking} disabled={app.working || autoplay} onAnswer={(a) => void answer(a, asking)} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <Composer
              ref={composer}
              placeholder={placeholder}
              disabled={!asking || app.working || autoplay}
              numeric={asking?.type === "zip" || asking?.type === "number"}
              hint={hint}
              ghost={ghost}
              onSend={typed}
            />
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
