"use client";

import { useEffect, useRef, type RefObject } from "react";

import { ENDS, MOMENTS, ROWS, type MomentKey } from "./checklist";

const STOP = Symbol("stop");
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);


/**
 * Behind the scenes, ported from the design mock:
 *  - the loop at the top: a note travels from you to the coordinator, out to each
 *    helper and back, then a question comes back to you (pauses with the button
 *    and while the tab is hidden);
 *  - the coordinator's checklist, replaying the real order of checks for a moment;
 *  - the form helper demo, played when it scrolls into view;
 *  - reveal-on-scroll and the nav condensing.
 * Everything stops on unmount, or when Next hides the route. Returns the
 * controls the page's buttons call.
 */
export function useBehindMotion(rootRef: RefObject<HTMLElement | null>) {
  const pausedRef = useRef(false);
  const playRef = useRef<((key: MomentKey) => void) | null>(null);
  const replayRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
    const $$ = <T extends Element = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const front = root.closest(".od-front");
    const stops: (() => void)[] = [];
    let alive = true;
    const paused = () => pausedRef.current || document.hidden;

    // ───────── The loop at the top ─────────
    const tok = $<SVGGElement>("#agTok");
    const hub = $("#agHub");
    const you = $("#agYou");
    const seq = $$("#agSeq li");
    const edge = (k: string) => $<SVGPathElement>(`#agE${k}`);
    const node = (k: string) => $(`#agN${k}`);
    const tag = (k: string) => $(`#agT${k}`);

    const hold = async (ms: number) => {
      let left = ms;
      while (left > 0) {
        await sleep(50);
        if (!alive) throw STOP;
        if (!paused()) left -= 50;
      }
    };
    const travel = (k: string, reverse: boolean, ms: number) => {
      const p = edge(k);
      const length = p.getTotalLength();
      return new Promise<void>((resolve, reject) => {
        let t = 0;
        let last = performance.now();
        const step = (now: number) => {
          if (!alive) return reject(STOP);
          if (!paused()) t += now - last;
          last = now;
          const x = Math.min(1, t / ms);
          const e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
          const pt = p.getPointAtLength((reverse ? 1 - e : e) * length);
          tok.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
          if (x < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    };
    const mark = (i: number) =>
      seq.forEach((li, j) => {
        li.classList.toggle("on", j === i);
        li.classList.toggle("done", j < i);
      });
    const reset = () => {
      $$(".ag-tag, .ag-node, .ag-edge, .ag-hub").forEach((el) => el.classList.remove("show", "on"));
      tok.style.opacity = "0";
      tok.classList.remove("q");
    };
    const carry = async (k: string, reverse: boolean, ms: number) => {
      edge(k).classList.add("on");
      tok.style.opacity = "1";
      await travel(k, reverse, ms);
      tok.style.opacity = "0";
      edge(k).classList.remove("on");
    };
    const think = async (ms: number) => {
      hub.classList.add("on");
      await hold(ms);
      hub.classList.remove("on");
    };
    const loop = async () => {
      try {
        while (alive) {
          reset();
          mark(0);
          tag("A").classList.add("show");
          you.classList.add("on");
          await hold(1100);
          you.classList.remove("on");
          await carry("Y", true, 1150);
          tag("A").classList.remove("show");
          mark(1);
          await think(1500);
          for (const [i, k] of [
            [2, "L"],
            [3, "F"],
            [4, "C"],
            [5, "P"],
          ] as const) {
            mark(i);
            await carry(k, false, 850);
            node(k).classList.add("on");
            tag(k).classList.add("show");
            await hold(1250);
            node(k).classList.remove("on");
            await carry(k, true, 750);
            await think(380);
          }
          mark(6);
          await think(500);
          tok.classList.add("q");
          await carry("Y", false, 1150);
          you.classList.add("on");
          tag("Q").classList.add("show");
          await hold(3000);
        }
      } catch (e) {
        if (e !== STOP) throw e;
      }
    };
    if (reduced) {
      reset();
      seq.forEach((li) => li.classList.remove("on", "done"));
      $$(".ag-tag").forEach((t) => t.classList.add("show"));
    } else {
      const start = window.setTimeout(() => void loop(), 900);
      stops.push(() => window.clearTimeout(start));
    }

    // ───────── The coordinator's checklist ─────────
    const rows = $$("#agRows .ag-row");
    const pen = $("#agPen");
    const log = $("#agLog");
    let run = 0;
    const penTo = (i: number) => {
      const r = rows[i];
      pen.style.transform = `translateY(${r.offsetTop + r.offsetHeight / 2 - 10}px)`;
    };
    const addLog = (html: string, cls = "") => {
      if (log.children.length) log.insertAdjacentHTML("beforeend", `<li class="arr" aria-hidden="true">→</li>`);
      log.insertAdjacentHTML("beforeend", `<li class="${cls}">${html}</li>`);
    };
    const runMoment = async (key: MomentKey, instant: boolean) => {
      const my = ++run;
      const passes = MOMENTS.find((m) => m.key === key)!.passes;
      log.innerHTML = "";
      for (let p = 0; p < passes.length; p++) {
        const target = passes[p];
        rows.forEach((r) => r.classList.remove("skip", "hit"));
        pen.classList.add("on");
        for (let i = 0; i <= target; i++) {
          if (my !== run || !alive) return;
          penTo(i);
          if (!instant) await sleep(320);
          if (i < target) rows[i].classList.add("skip");
        }
        if (my !== run || !alive) return;
        rows[target].classList.add("hit");
        if (!(target in ENDS)) addLog(`<i>${p + 1}</i>${esc(ROWS[target].go)}`);
        if (!instant) await sleep(1250);
      }
      if (my !== run || !alive) return;
      addLog(esc(ENDS[passes[passes.length - 1]]), "end");
    };
    let moment: MomentKey = "zip";
    playRef.current = (key) => {
      moment = key;
      void runMoment(key, reduced);
    };
    stops.push(() => {
      playRef.current = null;
    });
    // Show the first moment's result straight away; it replays slowly once the list scrolls into view.
    void runMoment(moment, true);

    // ───────── The form helper demo ─────────
    const demo = $("#agDemo");
    const playDemo = () => {
      demo.classList.remove("play");
      void demo.offsetWidth;
      demo.classList.add("play");
    };
    replayRef.current = playDemo;
    stops.push(() => {
      replayRef.current = null;
    });

    // ───────── Reveal on scroll ─────────
    const items = $$(".rv:not(.in)");
    if (!("IntersectionObserver" in window) || reduced) {
      items.forEach((el) => el.classList.add("in"));
      playDemo();
    } else {
      front?.classList.add("js-io");
      let checklistSeen = false;
      const io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return;
            const el = e.target;
            if (el === demo) {
              playDemo();
              io.unobserve(el);
              return;
            }
            if (el.matches(".ag-list") && !checklistSeen) {
              checklistSeen = true;
              void runMoment(moment, false);
            }
            el.classList.add("in");
            io.unobserve(el);
          }),
        { rootMargin: "0px 0px -10% 0px" },
      );
      items.forEach((el) => io.observe(el));
      io.observe(demo);
      stops.push(() => {
        io.disconnect();
        front?.classList.remove("js-io");
      });
    }

    // ───────── The nav condenses once you scroll ─────────
    const shell = $("#agshell");
    const onScroll = () => shell.classList.toggle("scrolled", window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    stops.push(() => window.removeEventListener("scroll", onScroll));

    return () => {
      alive = false;
      run++;
      stops.forEach((stop) => stop());
    };
  }, [rootRef]);

  return {
    /** Pause or resume the loop at the top. */
    setPaused: (on: boolean) => {
      pausedRef.current = on;
    },
    /** Replay one moment of the coordinator's checklist. */
    play: (key: MomentKey) => playRef.current?.(key),
    /** Replay the form helper demo. */
    replay: () => replayRef.current?.(),
  };
}
