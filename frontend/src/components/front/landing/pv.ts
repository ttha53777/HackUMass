// "Four different nights. One place to start." Four composite stories on paper cards.
// Each card's knot is the same idea drawn four ways: a worry that loops on itself,
// pulled straight into one line that ends at a door. Scroll position decides how
// untangled each card is. Ported from the design mock.
import { doodleMarkup } from "../doodles";

export type Night = {
  tint: string;
  blob: string;
  who: string;
  say: string;
  need: string;
  note: string;
  /** The sticky note reads as an alert (red). */
  al?: boolean;
  tag: string;
  step: string;
};

export const NIGHTS: Night[] = [
  {
    tint: "color-mix(in srgb,var(--alert-wash) 85%,var(--raised))",
    blob: "color-mix(in srgb,var(--alert) 26%,var(--alert-wash))",
    who: "Maya",
    say: "My heat might get shut off.",
    need: "utilities",
    note: "SHUT-OFF · FRI",
    al: true,
    tag: "Fuel Assistance",
    step: "One call starts heating help.",
  },
  {
    tint: "color-mix(in srgb,var(--sun) 38%,var(--raised))",
    blob: "var(--sun)",
    who: "Luis",
    say: "We need groceries until payday.",
    need: "food",
    note: "payday: 9 days",
    tag: "SNAP help",
    step: "Someone helps him apply for food money.",
  },
  {
    tint: "color-mix(in srgb,var(--wash) 80%,var(--raised))",
    blob: "color-mix(in srgb,var(--door) 28%,var(--wash))",
    who: "Jordan",
    say: "I'm behind on rent.",
    need: "housing",
    note: "PAST DUE",
    al: true,
    tag: "RAFT rent help",
    step: "Help catching up on rent.",
  },
  {
    tint: "#E1E6EF",
    blob: "#BFCBE0",
    who: "Sam",
    say: "I just need someone to talk to.",
    need: "mental_health",
    note: "2:14 am",
    tag: "Help line",
    step: "A free, confidential line to call.",
  },
];

type Pt = [number, number];
const START: Pt = [152, 190];
const END: Pt = [426, 200];

/** A smooth path through the points (Catmull-Rom as cubic Béziers). */
export function catmull(pts: Pt[]): string {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** The same points twice: once as loops (the worry), once as a gentle line (the way through). */
export function nightPoints(i: number): { knot: Pt[]; line: Pt[] } {
  let seed = i * 131 + 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const knot: Pt[] = [];
  const line: Pt[] = [];
  const N = 30;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const bx = START[0] + (END[0] - START[0]) * t;
    const by = START[1] + (END[1] - START[1]) * t;
    const A = 92 * Math.pow(Math.sin(Math.PI * t), 0.6) * (0.75 + rnd() * 0.5);
    const a = t * Math.PI * 7 + i * 1.7;
    knot.push([bx + Math.cos(a) * A * 0.62, by - 40 * Math.sin(Math.PI * t) + Math.sin(a) * A * 0.72]);
    line.push([bx, by + Math.sin(t * Math.PI * 2) * 5]);
  }
  return { knot, line };
}

/** The knot partly pulled straight: k = 0 is all loops, 1 is the straight line. */
export function knotPath(pts: { knot: Pt[]; line: Pt[] }, k: number): string {
  return catmull(pts.knot.map((p, n) => [p[0] + (pts.line[n][0] - p[0]) * k, p[1] + (pts.line[n][1] - p[1]) * k]));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A card's drawing (inner markup of its 520x280 svg). Static: built only from NIGHTS. */
export function nightArt(P: Night, i: number): string {
  const nw = P.note.length * 8.6 + 26;
  const tw = P.tag.length * 8.8 + 30;
  const tx = Math.min(454, 510 - tw / 2);
  const sparks = [
    [214, 30],
    [318, 44],
    [262, 250],
    [110, 58],
  ]
    .map(
      ([x, y], j) =>
        `<use href="#i-star" x="${x}" y="${y}" width="${j % 2 ? 12 : 16}" height="${j % 2 ? 12 : 16}" style="--t:${(i * 0.6 + j * 0.7) % 2.8}s"/>`,
    )
    .join("");
  return `<defs><radialGradient id="pvHalo${i}"><stop offset="0" style="stop-color:var(--sun);stop-opacity:.9"/><stop offset="1" style="stop-color:var(--sun);stop-opacity:0"/></radialGradient></defs>
      <g class="back">
        <path class="blob" d="M18 214 C6 160 52 112 104 118 C158 124 182 170 170 214 C160 252 30 258 18 214 Z"/>
        <g class="note" transform="rotate(${i % 2 ? 5 : -6} ${36 + nw / 2} 44)"><rect x="36" y="28" width="${nw}" height="32" rx="6"/><text class="${P.al ? "al" : ""}" x="${36 + nw / 2}" y="49" text-anchor="middle">${esc(P.note)}</text></g>
        <g class="spark">${sparks}</g>
      </g>
      <g class="mid">
        <path class="ln" d="M10 244 C150 241 360 247 510 243"/>
        <g class="obj"><svg class="dd" x="14" y="124" width="140" height="117" viewBox="0 0 120 100">${doodleMarkup(P.need)}</svg></g>
        <path class="knot" d=""/>
        <path class="lit" pathLength="1" d=""/>
      </g>
      <g class="front">
        <circle class="halo" cx="454" cy="190" r="84" fill="url(#pvHalo${i})"/>
        <path class="rays" d="M454 112 V100 M420 120 L412 110 M488 120 L496 110"/>
        <rect class="dlight" x="430" y="134" width="48" height="110"/>
        <path class="spill" d="M430 244 L478 244 L496 268 L412 268 Z"/>
        <g class="leaf"><rect x="430" y="134" width="48" height="110" rx="1.5"/><circle class="knob" cx="469" cy="192" r="3"/></g>
        <path class="ln" d="M423 244 L424 127 C444 125 464 125 485 127 L485 244"/>
        <g class="tag"><rect x="${tx - tw / 2}" y="58" width="${tw}" height="34" rx="17"/><text x="${tx}" y="81" text-anchor="middle">${esc(P.tag)}</text></g>
      </g>`;
}
