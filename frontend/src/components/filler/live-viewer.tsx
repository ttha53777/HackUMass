"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { Cursor, FillerRunController } from "./use-filler-run";

const SPECIAL_KEYS = new Set([
  "Enter", "Tab", "Backspace", "Delete", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
]);

/**
 * The cloud browser, live: the screencast, the agent's cursor (with a ripple on each click),
 * and, when it is the person's turn, their own clicks, scrolls and typing sent back to it.
 */
export function LiveViewer({ ctl, interactive, label }: { ctl: FillerRunController; interactive: boolean; label: string }) {
  const img = useRef<HTMLImageElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const size = useRef({ width: 1280, height: 800 });
  const [hasFrame, setHasFrame] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 1280, height: 800 });
  const { onFrame, send, cursor } = ctl;

  useEffect(
    () =>
      onFrame((frame) => {
        size.current = { width: frame.width, height: frame.height };
        setFrameSize((prev) => (prev.width === frame.width && prev.height === frame.height ? prev : { width: frame.width, height: frame.height }));
        if (img.current) img.current.src = frame.src;
        setHasFrame(true);
      }),
    [onFrame],
  );

  // Scrolling over the live view scrolls the form, not this page. React's onWheel is
  // passive (it can't prevent the page scroll), so this listener is attached by hand.
  useEffect(() => {
    const el = screen.current;
    if (!el || !interactive) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      send({
        type: "mouse",
        action: "wheel",
        x: Math.round(((e.clientX - r.left) / r.width) * size.current.width),
        y: Math.round(((e.clientY - r.top) / r.height) * size.current.height),
        dy: Math.round(e.deltaY),
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [interactive, send]);

  // Hand the keyboard to the live view when it becomes the person's turn.
  useEffect(() => {
    if (interactive) screen.current?.focus();
  }, [interactive]);

  const point = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * size.current.width),
      y: Math.round(((e.clientY - r.top) / r.height) * size.current.height),
    };
  };

  const onKey = (e: KeyboardEvent) => {
    if (!interactive) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length === 1) send({ type: "text", text: e.key });
    else if (SPECIAL_KEYS.has(e.key)) send({ type: "key", key: e.key });
    else return;
    e.preventDefault();
  };

  return (
    <div className={`fl-screen${interactive ? " yours" : ""}`}>
      <div className="fl-bar">
        <i />
        <i />
        <i />
        <span>{label}</span>
        <b className={ctl.connected ? "fl-live on" : "fl-live"}>{!ctl.active ? "Ended" : ctl.connected ? "Live" : "Connecting"}</b>
      </div>
      <div
        ref={screen}
        className="fl-view"
        tabIndex={interactive ? 0 : -1}
        role={interactive ? "application" : "img"}
        aria-label={interactive ? `${label}. You have control: click and type here.` : `${label}, as the helper fills it in`}
        onClick={(e) => interactive && send({ type: "mouse", action: "click", ...point(e) })}
        onKeyDown={onKey}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- frames arrive as data URLs from our own stream */}
        <img ref={img} alt="" draggable={false} style={{ visibility: hasFrame ? "visible" : "hidden" }} />
        {!hasFrame ? <p className="fl-wait">Opening the form…</p> : null}
        {cursor && !interactive && ctl.active ? <CursorDot cursor={cursor} size={frameSize} /> : null}
        {interactive ? <span className="fl-yours">Your turn: click and type right here</span> : null}
      </div>
    </div>
  );
}

function CursorDot({ cursor, size }: { cursor: Cursor; size: { width: number; height: number } }) {
  return (
    <span
      className="fl-cursor"
      aria-hidden="true"
      style={{ left: `${(cursor.x / size.width) * 100}%`, top: `${(cursor.y / size.height) * 100}%` }}
    >
      {cursor.kind === "click" ? <i key={cursor.at} className="fl-ripple" /> : null}
    </span>
  );
}
