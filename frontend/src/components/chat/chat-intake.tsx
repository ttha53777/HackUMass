"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { HandHeart, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "@/components/session/session-provider";
import { interpretMessage } from "@/lib/api";
import { coreDone } from "@/lib/derive";
import { saveConfirmed } from "@/lib/device-state";
import type { AnswerIn, InterpretOut, NotedFacts, Question, SessionSnapshot } from "@/lib/types";

import { BotMessage, SafetyCard, TypingBubble, UserMessage } from "./bubbles";
import { Composer } from "./composer";
import { QuickReplies } from "./quick-replies";
import { ReviewCard } from "./review-card";
import {
  CORE_IDS,
  EXTRA_IDS,
  OFF_TOPIC,
  PAUSE_TEXT,
  SAFETY_TEXT,
  SAMPLE_ANSWERS,
  ack,
  answered,
  bridge,
  chosenLabels,
  confirmation,
  greeting,
  parseTyped,
  reviewRows,
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
  | { key: string; kind: "review" };

/** chat: answering questions. review: looking over the summary. paused: "not right now". */
type Mode = "chat" | "review" | "paused";
type Asking = {
  question: Question;
  confirm?: { label: string; answer: AnswerIn };
  first?: string;
  pause?: boolean;
};

const isCore = (id: string) => (CORE_IDS as readonly string[]).includes(id);
const EMPTY_NOTED: NotedFacts = { household_size: null, household_who: [], zip: null };

// Unique per message; survives Fast Refresh resetting module state.
const nextKey = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The guided intake as a warm conversation: the four core questions, up to two
 * extras the backend says matter, then a review card with Done. Taps answer
 * directly; typed messages are read by the backend (`/interpret`), which proposes
 * a guarded reply, an answer, and facts to confirm later.
 */
export function ChatIntake({
  name,
  sample,
  onExit,
  onDone,
}: {
  name: string;
  sample: boolean;
  onExit: () => void;
  onDone: () => void;
}) {
  const app = useApp();
  const reduced = useReducedMotion() ?? false;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [typing, setTyping] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("chat");
  const [ghost, setGhost] = useState<string | undefined>(undefined);
  const [thinking, setThinking] = useState(false);
  // "Try a sample" plays until the review card; afterwards the person drives.
  const [sampleDone, setSampleDone] = useState(false);
  const autoplay = sample && !sampleDone;

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
  // Extras are offered once each; a skip counts as answered.
  const extrasAsked = useRef(new Set<string>());
  // The question that was open when the person said "Not right now".
  const pausedOn = useRef<Question | null>(null);

  const composer = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const push = useCallback((entry: Entry) => setEntries((list) => [...list, entry]), []);
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const say = useCallback(
    async (text: string, kind: "bot" | "warn" = "bot", followOn = false) => {
      setTyping(true);
      await wait(typingMs(text, reduced, followOn));
      if (!alive.current) return;
      setTyping(false);
      push({ key: nextKey(), kind, text, animate: true });
    },
    [push, reduced],
  );

  /** Ask a question, as a confirmation when the person already mentioned the answer. */
  const ask = useCallback(
    async (q: Question, extra?: Omit<Asking, "question" | "confirm">) => {
      const confirm = confirmation(q, noted.current);
      const { prompt, reason } = confirm ? { prompt: confirm.prompt, reason: null } : shown(q);
      setTyping(true);
      await wait(typingMs(prompt, reduced));
      if (!alive.current) return;
      setTyping(false);
      push({ key: nextKey(), kind: "question", prompt, reason, animate: true });
      await wait(reduced ? 0 : 160);
      if (alive.current) {
        setMode("chat");
        setAsking({ question: q, confirm: confirm ? { label: confirm.label, answer: confirm.answer } : undefined, ...extra });
      }
    },
    [push, reduced],
  );

  /** The summary, replacing any earlier one so only one card is ever live. */
  const review = useCallback(async () => {
    setAsking(null);
    setSampleDone(true);
    await say("Here's everything you've told me so far.", "bot", true);
    if (!alive.current) return;
    setEntries((list) => [...list.filter((e) => e.kind !== "review"), { key: nextKey(), kind: "review" }]);
    setMode("review");
  }, [say]);

  /** The next core question, then up to two extras the backend lists as useful, then review. */
  const advance = useCallback(async () => {
    const s = latest.current.snapshot;
    if (!s) return;
    if (!coreDone(s)) {
      const q = s.pending_question;
      if (q && isCore(q.id)) return ask(q);
      return review();
    }
    const next = EXTRA_IDS.map((id) => s.open_questions.find((o) => o.question.id === id)?.question).find(
      (q) => q && !s.answered.some((a) => a.question_id === q.id) && !extrasAsked.current.has(q.id),
    );
    if (next) {
      extrasAsked.current.add(next.id);
      return ask(next);
    }
    return review();
  }, [ask, review]);

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
   * Submit an answer. `typed`: the person's bubble is already shown; `before` is the
   * warm reply to say first, `after` an honest note added to the acknowledgement.
   */
  const answer = useCallback(
    async (body: AnswerIn, q: Question, typed?: { before: string[]; after?: string | null }) => {
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
        await say("I don't have programs for that ZIP code yet. Right now I cover Amherst and nearby towns in Hampshire and Franklin Counties.", "warn");
        await say("If there's another ZIP you can use, like where you work or stay, I can try that.", "bot", true);
        if (alive.current) setAsking({ question: q });
        return;
      }
      const line = ack(q.id, s, Boolean(typed?.before.length));
      await say(typed?.after ? `${line} ${typed.after}` : line, "bot", Boolean(typed?.before.length));
      if (!alive.current) return;
      await advance();
    },
    [advance, push, say, send],
  );

  /** A typed message: read it on the server, then reply, answer, or ask again gently. */
  const understand = useCallback(
    async (raw: string, q: Question) => {
      setAsking(null);
      setHint(null);
      setMode("chat");
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

      const urgent = result?.safety === "urgent";
      if (urgent && !safetyShown.current) {
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
      // Income amounts and ZIPs are read here as well; the server doesn't map them.
      const local = q.id === "income_band" || q.type === "zip" ? parseTyped(q, raw) : null;
      const body = result?.answer ?? (local && !("hint" in local) ? local : null);
      const fresh = (result?.unsupported_needs ?? []).filter((n) => !unsupportedSaid.current.has(n));
      fresh.forEach((n) => unsupportedSaid.current.add(n));
      const reply = result?.reply ?? null;
      const after = unsupportedLine(fresh);
      if (body) return answer(body, q, { before: reply ? [reply] : [], after });

      if (reply) await say(reply);
      if (after) await say(after, "bot", true);
      await say(bridge(q, { urgent, replied: Boolean(reply) }), "bot", Boolean(reply || after));
      if (alive.current) {
        setAsking({ question: q, first: urgent && q.id === "needs" ? "housing" : undefined, pause: urgent });
      }
    },
    [answer, push, reduced, say],
  );

  const pause = useCallback(async () => {
    if (!asking) return;
    pausedOn.current = asking.question;
    setAsking(null);
    await say(PAUSE_TEXT);
    if (alive.current) setMode("paused");
  }, [asking, say]);

  const resume = useCallback(async () => {
    const q = pausedOn.current;
    pausedOn.current = null;
    if (q) await ask(q);
  }, [ask]);

  const typed = (raw: string) => {
    const q = asking?.question ?? (mode === "paused" ? pausedOn.current : null);
    if (!q || !raw.trim()) return;
    if (mode === "paused") pausedOn.current = null;
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
      const s = latest.current.snapshot;
      const item = s?.answered.find((a) => a.question_id === questionId);
      if (!item) return;
      // Extras are re-asked with their current options (income ranges follow household size).
      const q = s?.open_questions.find((o) => o.question.id === questionId)?.question ?? item.question;
      setAsking(null);
      setHint(null);
      setMode("chat");
      await say("Of course. Let's change that.");
      await ask(q);
    },
    [ask, say],
  );

  const done = () => {
    const id = latest.current.snapshot?.session_id;
    if (id) saveConfirmed(id);
    onDone();
  };

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
    const items = [...CORE_IDS, ...EXTRA_IDS].map((id) => s.answered.find((a) => a.question_id === id)).filter((a) => !!a);
    if (items.length) {
      replay.push({ key: nextKey(), kind: "bot", text: greeting(name), animate: false });
      for (const item of items) {
        extrasAsked.current.add(item.question_id);
        const { prompt, reason } = shown(item.question);
        replay.push({ key: nextKey(), kind: "question", prompt, reason, animate: false });
        const labels = chosenLabels(item);
        replay.push({
          key: nextKey(),
          kind: "user",
          text: item.skipped ? "I'd rather skip this one" : labels.length ? labels.join(", ") : item.display_value,
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

  // "Try a sample": answer each question as if typed, after a short pause.
  useEffect(() => {
    if (!autoplay || !asking) return;
    const q = asking.question;
    const body =
      q.id === "income_band" && q.options[0]
        ? { question_id: q.id, selected_option_ids: [q.options[0].id] }
        : SAMPLE_ANSWERS[q.id];
    if (!body) return;
    let cancelled = false;
    void (async () => {
      await wait(reduced ? 0 : 350);
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

  // Keep the newest message in view while the thread grows, unless the person
  // scrolled up to reread.
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
    if ((asking && !asking.confirm && (t === "zip" || t === "text" || t === "currency")) || mode === "paused") {
      composer.current?.focus({ preventScroll: true });
    }
  }, [asking, mode]);

  const busy = typing || app.working || thinking;
  const canEdit = !busy && !autoplay;
  // Only the latest answer to each question can be changed.
  const lastUserIndex = new Map<string, number>();
  entries.forEach((e, i) => {
    if (e.kind === "user") lastUserIndex.set(e.questionId, i);
  });
  const lastReview = entries.findLastIndex((e) => e.kind === "review");

  const q = asking?.question;
  const placeholder =
    mode === "paused"
      ? "Type whenever you're ready…"
      : mode === "review"
        ? "Tap a line above to change it"
        : !q
          ? "One moment…"
          : q.type === "zip"
            ? "Type your 5-digit ZIP, like 01002"
            : q.type === "number"
              ? "Or type it, like “me and my two kids”"
              : q.id === "income_band"
                ? "Or type a rough amount, like 30,000 a year"
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
                  {e.kind === "review" && i === lastReview ? (
                    <ReviewCard
                      rows={reviewRows(app.snapshot)}
                      disabled={busy || mode !== "review"}
                      onChange={(id) => void edit(id)}
                      onDone={done}
                    />
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
                    first={asking.first}
                    skip={asking.question.skippable && asking.question.id !== "income_band"}
                    pause={asking.pause ? () => void pause() : undefined}
                    disabled={app.working || autoplay}
                    onAnswer={(a) => void answer(a, asking.question)}
                  />
                </motion.div>
              ) : null}
              {mode === "paused" && !typing ? (
                <motion.div key="resume" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pl-11">
                  <button
                    type="button"
                    onClick={() => void resume()}
                    className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 py-2 text-[14.5px] font-bold hover:border-brand-line hover:bg-surface-2"
                  >
                    I&apos;m ready to keep going
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <Composer
            ref={composer}
            placeholder={placeholder}
            disabled={(!asking && mode !== "paused") || app.working || autoplay || thinking}
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
