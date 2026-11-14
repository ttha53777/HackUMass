"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowRight, HandHeart, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "@/components/session/session-provider";
import { interpretMessage } from "@/lib/api";
import { coreDone } from "@/lib/derive";
import type { AnswerIn, InterpretOut, NotedFacts, Question, SessionSnapshot } from "@/lib/types";

import { BotMessage, SafetyCard, TypingBubble, UserMessage } from "./bubbles";
import { Checklist } from "./checklist";
import { Composer } from "./composer";
import { QuickReplies } from "./quick-replies";
import {
  CORE_IDS,
  OFF_TOPIC,
  SAFETY_TEXT,
  SAMPLE_ANSWERS,
  ack,
  answered,
  chosenLabels,
  confirmation,
  greeting,
  nudge,
  parseTyped,
  resultsLine,
  shown,
  typingMs,
  unsupportedLine,
  userSaid,
} from "./script";

type Entry =
  | { key: string; kind: "bot" | "warn"; text: string; animate: boolean }
  | { key: string; kind: "question"; prompt: string; reason: string | null; animate: boolean }
  | { key: string; kind: "user"; text: string; questionId: string; animate: boolean }
  | { key: string; kind: "safety" }
  | { key: string; kind: "checklist" }
  | { key: string; kind: "results"; headline: string; detail: string };

type Phase = "chat" | "checking" | "done";
type Asking = { question: Question; confirm?: { label: string; answer: AnswerIn } };

const isCore = (id: string) => (CORE_IDS as readonly string[]).includes(id);
const EMPTY_NOTED: NotedFacts = { household_size: null, household_who: [], zip: null };

// Unique per message; survives Fast Refresh resetting module state.
const nextKey = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The guided intake as a warm conversation. The navigator asks whatever core
 * question the backend has pending. Taps answer directly; typed messages are read
 * by the backend (`/interpret`), which proposes a guarded reply, an answer, and
 * facts to confirm later. Nothing typed is applied without the person seeing it.
 */
export function ChatIntake({ name, sample, onExit }: { name: string; sample: boolean; onExit: () => void }) {
  const app = useApp();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [typing, setTyping] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("chat");
  const [minTimeDone, setMinTimeDone] = useState(false);
  const [ghost, setGhost] = useState<string | undefined>(undefined);
  const [thinking, setThinking] = useState(false);
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
  // Facts the person mentioned for questions not asked yet; confirmed before use.
  const noted = useRef<NotedFacts>(EMPTY_NOTED);
  const safetyShown = useRef(false);
  // Each "I can't search for X yet" is said once per conversation.
  const unsupportedSaid = useRef(new Set<string>());

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

  /** Ask a question, as a confirmation when the person already mentioned the answer. */
  const ask = useCallback(
    async (q: Question) => {
      const confirm = confirmation(q, noted.current);
      const { prompt, reason } = confirm ? { prompt: confirm.prompt, reason: null } : shown(q);
      setTyping(true);
      await wait(typingMs(prompt, reduced));
      if (!alive.current) return;
      setTyping(false);
      push({ key: nextKey(), kind: "question", prompt, reason, animate: true });
      await wait(reduced ? 0 : 180);
      if (alive.current) setAsking({ question: q, confirm: confirm ? { label: confirm.label, answer: confirm.answer } : undefined });
    },
    [push, reduced],
  );

  const finish = useCallback(async () => {
    setPhase("checking");
    setMinTimeDone(false);
    await say("Give me a moment. I'm checking every program near you against what you've shared.");
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

  /**
   * Submit an answer. `typed`: the person's bubble is already shown, and `before`
   * holds the lines to say first (a warm reply, an honest "can't search for that").
   */
  const answer = useCallback(
    async (body: AnswerIn, q: Question, typed?: { before: string[] }) => {
      const wasDone = phase === "done";
      setAsking(null);
      setHint(null);
      setGhost(undefined);
      if (!typed) push({ key: nextKey(), kind: "user", text: userSaid(q, body), questionId: q.id, animate: true });
      // The reply shows while the answer is sent, so the wait feels like listening.
      const sending = send(body);
      for (const line of typed?.before ?? []) await say(line);
      setTyping(true);
      const ok = await sending;
      if (!alive.current) return;
      const s = latest.current.snapshot as SessionSnapshot;
      if (!ok) {
        setTyping(false);
        push({ key: nextKey(), kind: "warn", text: latest.current.answerError ?? "That didn't go through. Could you try again?", animate: true });
        setAsking({ question: q });
        return;
      }
      if (q.id === "zip" && (s.coverage !== "supported" || s.programs.length === 0)) {
        await say(s.notices[0]?.message ?? "I couldn't find programs for that ZIP yet.", "warn");
        await say("If you have a different ZIP, I can try that. Most programs here serve Amherst and nearby towns.");
        if (alive.current) setAsking({ question: q });
        return;
      }
      await say(ack(q.id, s, Boolean(typed?.before.length)));
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

  /** A typed message: read it on the server, then reply, answer, or ask again. */
  const understand = useCallback(
    async (raw: string, q: Question) => {
      setAsking(null);
      setHint(null);
      push({ key: nextKey(), kind: "user", text: raw.trim(), questionId: q.id, animate: true });
      setTyping(true);
      setThinking(true);
      let result: InterpretOut | null = null;
      try {
        const { whenIdle } = latest.current;
        await whenIdle();
        const sessionId = latest.current.snapshot?.session_id;
        if (sessionId) result = await interpretMessage(sessionId, { question_id: q.id, text: raw.slice(0, 500) });
      } catch {
        result = null; // offline, rate-limited or failed: fall back to the local reading below
      } finally {
        setThinking(false);
      }
      if (!alive.current) return;

      if (result?.safety === "urgent" && !safetyShown.current) {
        safetyShown.current = true;
        setTyping(false);
        push({ key: nextKey(), kind: "safety" });
        await wait(reduced ? 0 : 500);
      }
      if (result?.off_topic) {
        await say(OFF_TOPIC);
        if (alive.current) setAsking({ question: q });
        return;
      }
      if (result) {
        noted.current = {
          household_size: result.noted.household_size ?? noted.current.household_size,
          household_who: result.noted.household_who.length ? result.noted.household_who : noted.current.household_who,
          zip: result.noted.zip ?? noted.current.zip,
        };
      }
      const local = parseTyped(q, raw);
      const body = result ? result.answer : "hint" in local || local.selected_option_ids?.includes("other") ? null : local;
      const fresh = (result?.unsupported_needs ?? []).filter((n) => !unsupportedSaid.current.has(n));
      fresh.forEach((n) => unsupportedSaid.current.add(n));
      const before = [result?.reply, unsupportedLine(fresh)].filter((x): x is string => !!x);
      if (body) return answer(body, q, { before });

      for (const line of before) await say(line);
      await say(nudge(q));
      if (alive.current) setAsking({ question: q });
    },
    [answer, push, reduced, say],
  );

  const typed = (raw: string) => {
    if (!asking || !raw.trim()) return;
    const q = asking.question;
    // Plain digits for a ZIP or a count need no reading.
    if ((q.type === "zip" || q.type === "number") && /^\s*\d[\d\s-]*\s*$/.test(raw)) {
      const parsed = parseTyped(q, raw);
      if ("hint" in parsed) return setHint(parsed.hint || null);
      return void answer(parsed, q);
    }
    void understand(raw, q);
  };

  const edit = useCallback(
    async (questionId: string) => {
      const item = answered(latest.current.snapshot, questionId);
      if (!item) return;
      setAsking(null);
      setHint(null);
      await say("Of course. Let's change that.");
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
        const { prompt, reason } = shown(item.question);
        replay.push({ key: nextKey(), kind: "question", prompt, reason, animate: false });
        const labels = chosenLabels(item);
        replay.push({
          key: nextKey(),
          kind: "user",
          text: labels.length ? labels.join(", ") : item.display_value,
          questionId: item.question_id,
          animate: false,
        });
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
    const q = asking.question;
    const body = SAMPLE_ANSWERS[q.id];
    if (!body) return;
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
    const t = asking?.question.type;
    if (asking && !asking.confirm && (t === "zip" || t === "text" || t === "currency")) {
      composer.current?.focus({ preventScroll: true });
    }
  }, [asking]);

  const canEdit = phase !== "checking" && !typing && !app.working && !autoplay && !thinking;
  // Only the latest answer to each question can be changed.
  const lastUserIndex = new Map<string, number>();
  entries.forEach((e, i) => {
    if (e.kind === "user") lastUserIndex.set(e.questionId, i);
  });

  const q = asking?.question;
  const placeholder = !q
    ? "…"
    : q.type === "zip"
      ? "Type your 5-digit ZIP, like 01002"
      : q.type === "number"
        ? "Or type it, like “me and my two kids”"
        : "Or tell me in your own words…";

  return (
    <MotionConfig reducedMotion="user">
      <section className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 bg-paper/85 px-4 py-3.5 backdrop-blur">
          <div className="mx-auto flex w-[min(760px,100%)] items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-display text-xl font-extrabold tracking-[-0.05em]">
              <span className="grid size-7 place-items-center rounded-[9px] bg-brand text-on-brand">
                <HandHeart aria-hidden className="size-4" />
              </span>
              <span>
                Open<b className="text-brand">Door</b>
              </span>
            </span>
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
        </header>

        <div className="mx-auto flex w-[min(760px,100%)] flex-col px-4 pb-10 pt-6 min-[900px]:pt-12">
          <div ref={logRef} role="log" aria-live="polite" aria-label="Conversation with your navigator" className="flex flex-col gap-5 pb-2">
            {entries.map((e, i) => {
              const prev = entries[i - 1];
              const lead = !prev || prev.kind === "user";
              return (
                <motion.div key={e.key} layout="position" transition={{ type: "spring", stiffness: 400, damping: 36 }}>
                  {e.kind === "bot" ? <BotMessage lead={lead} animate={e.animate}>{e.text}</BotMessage> : null}
                  {e.kind === "warn" ? <BotMessage lead={lead} tone="warn" animate={e.animate}>{e.text}</BotMessage> : null}
                  {e.kind === "safety" ? <SafetyCard title={SAFETY_TEXT.title} lines={SAFETY_TEXT.lines} /> : null}
                  {e.kind === "question" ? (
                    <BotMessage lead={lead} tone="question" animate={e.animate}>
                      {e.prompt}
                      {e.reason ? (
                        <span className="mt-1.5 block font-sans text-[13.5px] font-medium leading-relaxed tracking-normal text-muted-foreground">
                          {e.reason}
                        </span>
                      ) : null}
                    </BotMessage>
                  ) : null}
                  {e.kind === "user" ? (
                    <UserMessage
                      animate={e.animate}
                      onEdit={canEdit && lastUserIndex.get(e.questionId) === i && answered(app.snapshot, e.questionId) ? () => void edit(e.questionId) : undefined}
                    >
                      {e.text}
                    </UserMessage>
                  ) : null}
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
                      <span className="mt-2.5 block text-xs text-faint">You can tap any of your answers above to change it first.</span>
                    </BotMessage>
                  ) : null}
                </motion.div>
              );
            })}

            <AnimatePresence>{typing ? <TypingBubble key="typing" lead={entries[entries.length - 1]?.kind === "user" || entries.length === 0} /> : null}</AnimatePresence>

            <AnimatePresence mode="wait">
              {asking && !typing ? (
                <motion.div key={asking.question.id + entries.length} exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}>
                  <QuickReplies
                    question={asking.question}
                    confirm={asking.confirm}
                    disabled={app.working || autoplay}
                    onAnswer={(a) => void answer(a, asking.question)}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <Composer
            ref={composer}
            placeholder={placeholder}
            disabled={!asking || app.working || autoplay || thinking}
            numeric={q?.type === "zip"}
            hint={hint}
            ghost={ghost}
            onSend={typed}
          />
        </div>
      </section>
    </MotionConfig>
  );
}
