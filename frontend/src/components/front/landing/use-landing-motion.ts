"use client";

import { useEffect, type RefObject } from "react";

import { knotPath, nightPoints } from "./pv";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (x: number) => x * x * (3 - 2 * x);

/** Count an element's text up from a to b. */
function tween(el: HTMLElement, a: number, b: number, reduced: boolean) {
  if (reduced || a === b) {
    el.textContent = String(b);
    return;
  }
  const t0 = performance.now();
  const step = (t: number) => {
    const k = clamp((t - t0) / 800, 0, 1);
    el.textContent = String(Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Everything on the landing page that moves with the scroll, ported from the
 * design mock: the hero door opening, the nav condensing, the Four nights strip
 * untangling, the pinned story beats, reveal-on-scroll, the count-up and the
 * hero's line boil. One rAF-throttled scroll listener writes CSS variables, so
 * scrolling never re-renders React. Everything is torn down on unmount (or when
 * Next hides the route).
 */
export function useLandingMotion(rootRef: RefObject<HTMLElement | null>, programCount: number) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
    const $$ = <T extends Element = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const front = root.closest(".od-front");
    const stops: (() => void)[] = [];

    // Reveal on scroll (only when IntersectionObserver is there and motion is welcome).
    if ("IntersectionObserver" in window && !reduced) {
      front?.classList.add("js-io");
      const io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io.unobserve(e.target);
            }
          }),
        { rootMargin: "0px 0px -8% 0px" },
      );
      $$(".rv:not(.in), #fin:not(.in)").forEach((el) => io.observe(el));
      stops.push(() => {
        io.disconnect();
        front?.classList.remove("js-io");
      });
    } else {
      $$(".rv, #fin").forEach((el) => el.classList.add("in"));
    }

    const hero = $("#hero")!;
    const scene = $("#scene")!;
    const shell = $("#lshell")!;
    const story = $("#how")!;
    const beats = $$(".beat");
    const stages = $$<SVGSVGElement>(".stage svg");
    const rails = $$(".beat-rail i");

    // Four nights: each card untangles as it reaches the middle.
    const pvSec = $("#street")!;
    const pvTrack = $("#pvTrack")!;
    const pvNum = $("#pvNum")!;
    const cards = $$(".pv-card").map((el, i) => ({
      el,
      pts: nightPoints(i),
      knot: el.querySelector(".knot")!,
      lit: el.querySelector(".lit")!,
      k: -1,
    }));
    /** One card at offset c from the center: c > 0 is still to the right (tangled), c <= 0 has arrived (straight). */
    const paintCard = (card: (typeof cards)[number], c: number) => {
      const { el } = card;
      const k = ease(clamp((0.55 - c) / 0.55, 0, 1));
      el.style.setProperty("--c", c.toFixed(3));
      el.style.setProperty("--a", Math.abs(c).toFixed(3));
      if (Math.abs(k - card.k) < 0.002) return;
      card.k = k;
      el.style.setProperty("--j", (1 - k).toFixed(3));
      el.style.setProperty("--k2", clamp((k - 0.55) / 0.45, 0, 1).toFixed(3));
      el.style.setProperty("--k3", clamp((k - 0.3) / 0.7, 0, 1).toFixed(3));
      el.style.setProperty("--o", clamp((k - 0.72) / 0.28, 0, 1).toFixed(3));
      const d = knotPath(card.pts, k);
      card.knot.setAttribute("d", d);
      card.lit.setAttribute("d", d);
    };
    const paintNights = (p: number) => {
      const pos = -0.8 + p * 4;
      const first = cards[0].el;
      const step = first.offsetWidth + parseFloat(getComputedStyle(pvTrack).columnGap || "0");
      pvTrack.style.transform = `translateX(${(pvSec.clientWidth / 2 - first.offsetWidth / 2 - pos * step).toFixed(1)}px)`;
      cards.forEach((card, i) => paintCard(card, i - pos));
      pvNum.textContent = String(clamp(Math.round(pos), 0, 3) + 1).padStart(2, "0");
    };
    if (reduced) cards.forEach((card) => paintCard(card, -1));
    else paintNights(0);

    // Count up the programs in the checked list when that number scrolls in.
    const count = $("#imCount");
    if (count && "IntersectionObserver" in window && !reduced) {
      count.textContent = "0";
      let timer = 0;
      const io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return;
            timer = window.setTimeout(() => tween(count, 0, programCount, reduced), 500);
            io.disconnect();
          }),
        { rootMargin: "0px 0px -15% 0px" },
      );
      io.observe(count);
      stops.push(() => {
        io.disconnect();
        window.clearTimeout(timer);
        count.textContent = String(programCount);
      });
    }

    let ticking = false;
    let loaded = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const hp = clamp(y / (hero.offsetHeight * 0.9), 0, 1);
      hero.style.setProperty("--hp", hp.toFixed(3));
      shell.classList.toggle("scrolled", y > 24);
      const open = loaded ? 32 + hp * 50 : 0;
      scene.style.setProperty("--open", open.toFixed(1));
      scene.style.setProperty("--open-n", (open / 80).toFixed(3));

      if (reduced) return;
      const tr = pvSec.getBoundingClientRect();
      if (tr.top < vh && tr.bottom > 0) paintNights(clamp(-tr.top / (pvSec.offsetHeight - vh), 0, 1));

      const sr = story.getBoundingClientRect();
      const sp = clamp(-sr.top / (story.offsetHeight - vh), 0, 0.9999);
      const idx = Math.floor(sp * 3);
      const local = sp * 3 - idx;
      beats.forEach((b, i) => {
        b.classList.toggle("on", i === idx);
        b.classList.toggle("past", i < idx);
      });
      stages.forEach((s, i) => {
        const k = i < idx ? 1 : i === idx ? clamp(local * 1.5, 0, 1) : 0;
        s.style.setProperty("--k", k.toFixed(3));
        s.style.opacity = i === idx ? "1" : "0";
      });
      rails.forEach((r, i) => r.style.setProperty("--f", String(i < idx ? 1 : i === idx ? local.toFixed(3) : 0)));
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    // The door starts closed, then opens a little once the drawing has inked in.
    const openTimer = window.setTimeout(() => {
      loaded = true;
      update();
    }, 650);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    update();
    stops.push(() => {
      window.clearTimeout(openTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    });

    // Line boil on the hero doodle: three hand-drawn frames on a loop, the way animators keep a still drawing alive.
    if (!reduced) {
      const turbulence = document.getElementById("boilT");
      const boiled = $$<SVGElement>(".scene .boil");
      boiled.forEach((s) => (s.style.filter = "url(#boil)"));
      let f = 0;
      const boil = window.setInterval(() => {
        if (turbulence && window.scrollY < hero.offsetHeight) {
          f = (f + 1) % 3;
          turbulence.setAttribute("seed", String([1, 7, 13][f]));
        }
      }, 170);
      stops.push(() => window.clearInterval(boil));
    }

    return () => stops.forEach((stop) => stop());
  }, [rootRef, programCount]);
}
