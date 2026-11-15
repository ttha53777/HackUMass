// The "Watch demo" engine, ported from the design (docs/ui-reference/opendoor-plan-hub.html):
// a doodle cursor on a soft arc with a dotted ink trail, camera glides, typing, and hand-drawn
// annotations. Plain DOM work on the tour's own elements; every wait checks `alive()` and throws
// STOP when the tour was stopped, so a chapter unwinds at its next await.

export const STOP = Symbol("tour-stopped");

export type Engine = ReturnType<typeof createEngine>;

const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createEngine(els: { cursor: HTMLElement; body: HTMLElement; trail: SVGPathElement; root: HTMLElement }, alive: () => boolean) {
  const RM = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const C = { x: 0, y: 0, tilt: 0, raf: 0, trail: [] as [number, number][] };
  let anns: HTMLElement[] = [];

  const check = () => {
    if (!alive()) throw STOP;
  };
  const sleep = (ms: number) =>
    new Promise<void>((r) => setTimeout(r, RM ? Math.min(ms, 250) : ms)).then(check);

  function setCur(x: number, y: number, tilt = 0) {
    C.x = x;
    C.y = y;
    els.cursor.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    els.body.style.rotate = `${tilt.toFixed(2)}deg`;
  }
  function drawTrail() {
    const p = C.trail;
    els.trail.setAttribute("d", p.length < 2 ? "" : `M${p.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" L")}`);
  }
  function settle() {
    els.trail.style.opacity = "0";
    const t0 = performance.now();
    const from = C.tilt;
    const f = (now: number) => {
      const t = Math.min(1, (now - t0) / 380);
      C.tilt = from * (1 - easeIO(t));
      setCur(C.x, C.y, C.tilt);
      if (t < 1) C.raf = requestAnimationFrame(f);
      else {
        C.trail = [];
        drawTrail();
      }
    };
    C.raf = requestAnimationFrame(f);
  }
  function moveTo(x: number, y: number, dur?: number) {
    const sx = C.x,
      sy = C.y,
      dx = x - sx,
      dy = y - sy,
      dist = Math.hypot(dx, dy);
    if (dist < 2) return sleep(60);
    const d = RM ? 1 : (dur ?? Math.min(1150, Math.max(520, 380 + dist * 0.75)));
    const bend = Math.min(110, dist * 0.2) * (dx >= 0 ? 1 : -1);
    const cx = sx + dx * 0.5 + (-dy / dist) * bend,
      cy = sy + dy * 0.5 + (dx / dist) * bend;
    els.trail.style.opacity = ".55";
    C.trail = [[sx, sy]];
    return new Promise<void>((res) => {
      cancelAnimationFrame(C.raf);
      const t0 = performance.now();
      let px = sx;
      const f = (now: number) => {
        const t = Math.min(1, (now - t0) / d),
          e = easeIO(t),
          u = 1 - e;
        const X = u * u * sx + 2 * u * e * cx + e * e * x,
          Y = u * u * sy + 2 * u * e * cy + e * e * y;
        const v = X - px;
        px = X;
        C.tilt += (Math.max(-16, Math.min(16, v * 1.4)) - C.tilt) * 0.18;
        if (t >= 1) C.tilt *= 0.5;
        C.trail.push([X, Y]);
        if (C.trail.length > 22) C.trail.shift();
        setCur(X, Y, C.tilt);
        drawTrail();
        if (t < 1 && alive()) C.raf = requestAnimationFrame(f);
        else {
          settle();
          res();
        }
      };
      C.raf = requestAnimationFrame(f);
    }).then(check);
  }
  async function press() {
    els.cursor.classList.remove("pop");
    void els.cursor.offsetWidth;
    els.cursor.classList.add("press", "pop");
    await sleep(140);
    els.cursor.classList.remove("press");
  }
  function glide(box: HTMLElement | null, top: number, dur?: number) {
    const win = !box;
    const from = win ? window.scrollY : box!.scrollTop;
    const max = win ? document.documentElement.scrollHeight - window.innerHeight : box!.scrollHeight - box!.clientHeight;
    top = Math.max(0, Math.min(max, top));
    const d = top - from;
    if (Math.abs(d) < 6) return Promise.resolve();
    const ms = RM ? 1 : (dur ?? Math.min(1300, Math.max(560, Math.abs(d) * 0.55)));
    return new Promise<void>((res) => {
      const t0 = performance.now();
      const f = (now: number) => {
        const t = Math.min(1, (now - t0) / ms),
          y = from + d * easeIO(t);
        if (win) window.scrollTo(0, y);
        else box!.scrollTop = y;
        if (t < 1 && alive()) requestAnimationFrame(f);
        else res();
      };
      requestAnimationFrame(f);
    }).then(check);
  }
  async function show(el: Element) {
    const box = el.closest<HTMLElement>(".drawer .msgs, .drawer, .sp-b");
    const r = el.getBoundingClientRect(),
      bottomSafe = window.innerHeight - 150;
    if (box && box.scrollHeight > box.clientHeight + 4) {
      const br = box.getBoundingClientRect();
      if (r.top < br.top + 70 || r.bottom > Math.min(br.bottom, bottomSafe))
        await glide(box, box.scrollTop + (r.top - br.top) - Math.max(80, (Math.min(br.bottom, bottomSafe) - br.top - r.height) / 2));
      return;
    }
    if (box) return;
    if (r.top < 96 || r.bottom > bottomSafe) {
      let target = window.scrollY + r.top - Math.max(96, (bottomSafe - r.height) / 2);
      if (r.height > bottomSafe - 110) target = window.scrollY + r.top - 110;
      await glide(null, target);
    }
  }
  async function waitFor(sel: string, ms = 8000): Promise<HTMLElement> {
    for (let t = 0; t < ms; t += 90) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && el.getClientRects().length) return el;
      await sleep(90);
    }
    throw new Error(`tour: ${sel} did not appear`);
  }
  async function point(sel: string | HTMLElement, opt: { fx?: number; fy?: number } = {}) {
    const el = typeof sel === "string" ? await waitFor(sel) : sel;
    await show(el);
    const r = el.getBoundingClientRect();
    const fx = opt.fx ?? Math.min(0.5, 64 / Math.max(r.width, 1) + 0.12);
    await moveTo(r.left + r.width * fx, r.top + r.height * (opt.fy ?? 0.58));
    return el;
  }
  async function tap(sel: string | HTMLElement, opt: { fx?: number; fy?: number; dwell?: number; after?: number } = {}) {
    let el = await point(sel, opt);
    await sleep(opt.dwell ?? 180);
    if (!el.isConnected && typeof sel === "string") el = document.querySelector<HTMLElement>(sel) ?? el;
    clearAnn();
    await press();
    el.click();
    await sleep(opt.after ?? 420);
    return el;
  }
  /** Type into a React-controlled field: set the value natively and fire input, one key at a time. */
  async function typeIn(sel: string, text: string) {
    const el = (await point(sel, { fx: 0.08 })) as HTMLTextAreaElement | HTMLInputElement;
    await press();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
    for (const ch of text) {
      set.call(el, el.value + ch);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(RM ? 0 : 22 + Math.random() * 38 + (ch === "," || ch === "." ? 190 : 0));
    }
  }
  function roughBox(w: number, h: number) {
    const R = Math.min(24, h / 2.3);
    const j = (n = 4) => +((Math.random() - 0.5) * n).toFixed(1);
    const W = w,
      H = h;
    return (
      `M${R + 14} ${3 + j()} C${W * 0.4} ${-2 + j()} ${W * 0.7} ${1 + j()} ${W - R} ${j()} Q${W + 1} -1 ${W + j(3)} ${R}` +
      ` C${W + 2 + j()} ${H * 0.45} ${W - 1 + j()} ${H * 0.7} ${W + j()} ${H - R} Q${W + 1} ${H + 1} ${W - R} ${H + j(3)}` +
      ` C${W * 0.65} ${H + 2 + j()} ${W * 0.3} ${H - 1 + j()} ${R} ${H + j()} Q-2 ${H} ${j(3)} ${H - R}` +
      ` C${-2 + j()} ${H * 0.6} ${1 + j()} ${H * 0.3} ${j()} ${R} Q0 -3 ${R + 4} -2 C${R + 30} -1 ${R + 50} 4 ${R + 70} 7`
    );
  }
  function annotate(sel: string | Element | null, label: string, opt: { pad?: number; below?: boolean; left?: boolean } = {}) {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = opt.pad ?? 10;
    const fixed = !!el.closest(".drawer,.dock,.shell,.spot");
    let x = r.left - pad,
      y = r.top - pad;
    const w = r.width + pad * 2,
      h = r.height + pad * 2;
    if (!fixed) {
      x += window.scrollX;
      y += window.scrollY;
    }
    const d = document.createElement("div");
    d.className = `ann${fixed ? " fx" : ""}`;
    d.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    d.innerHTML = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><path pathLength="1" d="${roughBox(w, h)}"/></svg>`;
    if (label) {
      const l = document.createElement("span");
      l.className = "lbl";
      l.textContent = label;
      l.style.setProperty("--r", `${-2 - Math.random() * 3}deg`);
      if (opt.below || r.top < 130) l.style.top = `${h + 8}px`;
      else l.style.bottom = `${h + 6}px`;
      if (opt.left) l.style.left = "4px";
      else l.style.right = "4px";
      d.appendChild(l);
    }
    els.root.appendChild(d);
    anns.push(d);
  }
  function clearAnn() {
    for (const a of anns) {
      a.classList.add("out");
      setTimeout(() => a.remove(), 400);
    }
    anns = [];
  }
  function reset() {
    cancelAnimationFrame(C.raf);
    clearAnn();
    C.trail = [];
    drawTrail();
    els.cursor.classList.remove("on", "press", "pop");
  }

  return { sleep, setCur, moveTo, press, glide, show, waitFor, point, tap, typeIn, annotate, clearAnn, reset, RM };
}
