"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

import "./through.css";

type Go = (from: Element | null, target: string | (() => void)) => Promise<void>;

const Ctx = createContext<Go | null>(null);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** How long to wait for the next page before opening the door anyway. */
const ROUTE_TIMEOUT = 1500;

/**
 * Walk through the door. `go(button, "/start")` floods the screen in door green
 * from the pressed button, navigates, waits for the new page, then swings the
 * door open onto warm light. `go(button, fn)` runs fn instead of navigating.
 * With reduced motion it just navigates.
 */
export function ThroughProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const overlay = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const path = useRef(pathname);
  const arrivals = useRef<(() => void)[]>([]);

  useEffect(() => {
    path.current = pathname;
    arrivals.current.splice(0).forEach((arrive) => arrive());
  }, [pathname]);

  useEffect(() => {
    router.prefetch("/start");
  }, [router]);

  const go = useCallback<Go>(
    async (from, target) => {
      const navigate = () => (typeof target === "string" ? router.push(target) : target());
      const o = overlay.current;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!o || reduced || busy.current) {
        navigate();
        return;
      }
      busy.current = true;
      const door = o.querySelector<HTMLElement>(".th-door")!;
      const light = o.querySelector<HTMLElement>(".th-light")!;
      const r = from?.getBoundingClientRect() ?? { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      o.style.setProperty("--cx", `${r.left + r.width / 2}px`);
      o.style.setProperty("--cy", `${r.top + r.height / 2}px`);
      door.style.transition = "none";
      door.style.transform = "none";
      door.style.opacity = "1";
      light.style.transition = "none";
      light.style.opacity = "0";
      o.classList.add("on");
      door.getBoundingClientRect();
      door.style.transition = "clip-path .75s cubic-bezier(.65,0,.35,1)";
      door.style.clipPath = "circle(150% at var(--cx) var(--cy))";
      await sleep(780);
      light.style.opacity = "1";

      const startPath = path.current;
      navigate();
      if (typeof target === "string") {
        await Promise.race([
          new Promise<void>((resolve) => (path.current !== startPath ? resolve() : arrivals.current.push(resolve))),
          sleep(ROUTE_TIMEOUT),
        ]);
        // Let the new page paint before the door opens on it.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      window.scrollTo(0, 0);
      await sleep(120);
      door.style.transition = "transform 1.05s cubic-bezier(.6,0,.25,1), opacity .4s ease .75s";
      door.style.transform = "rotateY(100deg)";
      door.style.opacity = "0";
      await sleep(800);
      light.style.transition = "opacity .7s ease";
      light.style.opacity = "0";
      await sleep(720);
      o.classList.remove("on");
      door.style.transition = "none";
      door.style.clipPath = "";
      door.style.transform = "none";
      busy.current = false;
    },
    [router],
  );

  return (
    <Ctx.Provider value={go}>
      {children}
      <div ref={overlay} className="od-through" aria-hidden="true">
        <div className="th-light" />
        <div className="th-door" />
      </div>
    </Ctx.Provider>
  );
}

export function useThrough(): Go {
  const go = useContext(Ctx);
  if (!go) throw new Error("useThrough must be used inside ThroughProvider");
  return go;
}
