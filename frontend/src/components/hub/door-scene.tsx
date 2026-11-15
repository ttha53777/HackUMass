"use client";

import { memo, type CSSProperties } from "react";

import type { HubCase } from "@/lib/hub-derive";

// The hero's hand-drawn door, copied from the design (heroSVG). Static markup with no user
// content. The leaf and the glow read --open from the wrapper (1 = shut, ~.14 = wide open), so
// the door swings without re-drawing the ink.

const ACC: Partial<Record<HubCase, string>> = {
  urgent:
    '<g stroke-width="2"><path class="f-paper" d="M106 238 L190 230 L196 334 L112 342 Z" stroke="var(--ink)"/><path d="M122 262 H178 M123 276 H172 M124 290 H166" stroke="var(--ink-3)"/><path d="M150 304 V318 M150 326 V327" stroke="var(--alert)" stroke-width="4"/><circle cx="148" cy="238" r="4" fill="var(--alert)" stroke="none"/><path d="M104 222 L96 214 M118 214 L114 204 M136 220 L140 210" stroke="var(--alert)"/></g>',
  waiting:
    '<g stroke-width="2.2"><circle class="f-paper" cx="486" cy="226" r="38" stroke="var(--ink)"/><path d="M486 226 V202 M486 226 L503 236" stroke="var(--ink)"/><path d="M486 190 V194 M486 258 V262 M450 226 H454 M518 226 H522" stroke="var(--ink-3)"/><path class="f-paper" d="M258 478 H318 V452 H258Z" stroke="var(--ink)"/><path d="M258 452 L288 470 L318 452" stroke="var(--ink)"/></g>',
  done:
    '<g stroke-width="2.2"><circle class="f-sun" cx="480" cy="150" r="26" stroke="var(--brass)"/><path d="M480 108 V118 M480 182 V192 M438 150 H448 M512 150 H522 M450 120 L457 127 M503 173 L510 180 M510 120 L503 127 M457 173 L450 180" stroke="var(--brass)"/><path d="M180 100 L186 92 M420 94 L428 100 M300 86 V76 M240 92 L236 83 M360 90 L365 81 M150 160 L158 156 M440 220 L448 216" stroke="var(--door)"/><path d="M284 489 L296 495 L318 482" stroke="var(--door)" stroke-width="3.4"/></g>',
  empty:
    '<g stroke-width="2.2"><path class="f-paper" d="M426 168 H524 V222 H462 L440 244 V222 H426Z" stroke="var(--ink)"/><path d="M452 195 H452.1 M475 195 H475.1 M498 195 H498.1" stroke="var(--ink)" stroke-width="5"/><path d="M130 190 L120 182 M142 206 L130 204 M118 222 L108 224" stroke="var(--brass)"/></g>',
  offline:
    '<g stroke-width="2.2"><path class="f-paper" d="M432 214 C416 214 414 190 432 188 C436 168 468 164 476 186 C498 184 508 212 488 214Z" stroke="var(--ink)"/><path d="M420 150 L506 232" stroke="var(--alert)" stroke-width="3"/><path d="M300 510 C322 520 344 512 356 498 M356 498 V484 M364 498 V484" stroke="var(--ink)"/></g>',
  nomatch:
    '<g stroke-width="2.2"><path class="f-paper" d="M160 338 C138 312 132 300 132 284 C132 264 145 250 160 250 C175 250 188 264 188 284 C188 300 182 312 160 338Z" stroke="var(--ink)"/><circle cx="160" cy="282" r="9" stroke="var(--ink)"/><path d="M122 244 L198 338" stroke="var(--alert)" stroke-width="3"/><path d="M134 350 H186" stroke="var(--ink-3)" stroke-dasharray="4 6"/></g>',
};

const LEAF_ACC: Partial<Record<HubCase, string>> = {
  empty:
    '<path d="M262 226 C262 196 304 194 304 222 C304 242 282 242 282 264 M282 284 V285" fill="none" stroke="var(--on-door)" stroke-width="4.5" transform="translate(-218 0)"/>',
};

const BIRDS =
  '<path class="ink" pathLength="1" style="--d:1700ms" d="M90 120 C96 112 102 112 106 120 C110 112 116 112 122 120"/><path class="ink" pathLength="1" style="--d:1800ms" d="M128 92 C132 87 136 87 139 92 C142 87 146 87 150 92"/>';

function doorSvg(acc: string, leafAcc: string): string {
  return (
    '<svg class="dd" viewBox="90 70 460 450" aria-hidden="true">' +
    '<path class="f-sun glow" d="M222 472 L222 132 C280 129 330 129 380 131 L380 472 Z" stroke="none"/>' +
    '<g stroke-width="2"><path class="ink" pathLength="1" style="--d:900ms" d="M252 196 L300 194 L301 252 L251 253 Z M276 195 L276 252 M252 224 L300 223"/>' +
    '<path class="ink" pathLength="1" style="--d:1000ms" d="M338 300 L338 432 M326 432 L350 432"/>' +
    '<path class="ink f-paper" pathLength="1" style="--d:1050ms" d="M318 300 L358 300 L349 272 L327 272 Z"/></g>' +
    '<path class="f-sun" stroke="none" opacity=".7" d="M222 472 L380 472 L478 514 L136 514 Z"/>' +
    '<path class="ink" pathLength="1" style="--d:100ms" d="M18 472 C150 468 430 475 584 469"/>' +
    '<g transform="translate(222 0)"><g class="leaf">' +
    '<path class="f-door" stroke="none" d="M0 472 L0 132 C58 129 108 129 158 131 L158 472 Z"/>' +
    '<path d="M0 472 L0 132 C58 129 108 129 158 131 L158 472" stroke="var(--ink)"/>' +
    '<path d="M22 160 L136 160 L136 250 L22 250 Z M22 280 L136 280 L136 430 L22 430 Z" stroke="var(--on-door)" opacity=".35" stroke-width="2"/>' +
    '<circle cx="136" cy="318" r="6" fill="var(--brass)" stroke="none"/>' +
    leafAcc +
    "</g></g>" +
    '<path class="ink" pathLength="1" style="--d:250ms" stroke-width="2.8" d="M206 472 C205 380 207 220 208 118 C262 113 338 113 394 116 C394 230 393 380 395 472"/>' +
    '<path class="ink" pathLength="1" style="--d:500ms" d="M196 112 C260 104 344 106 404 110"/>' +
    '<path class="ink" pathLength="1" style="--d:1200ms" d="M414 196 L414 212"/>' +
    '<path class="ink f-sun" pathLength="1" style="--d:1250ms" d="M406 212 L422 212 L428 234 L400 234 Z"/>' +
    '<path class="ink" pathLength="1" style="--d:1500ms" d="M436 214 L446 208 M438 230 L450 232 M392 214 L382 208"/>' +
    '<path class="ink f-wash" pathLength="1" style="--d:700ms" d="M238 480 L366 480 L378 497 L226 497 Z"/>' +
    '<path class="ink f-ink" pathLength="1" style="--d:1300ms" d="M136 471 C126 446 132 420 150 414 C168 418 176 444 170 471 Z"/>' +
    '<path class="ink f-ink" pathLength="1" style="--d:1400ms" d="M141 420 C137 402 146 392 156 394 C168 396 170 410 162 420 Z M142 404 L139 386 L150 395 M158 394 L166 384 L166 400"/>' +
    '<path class="ink" pathLength="1" style="--d:1550ms" d="M168 466 C192 472 202 452 188 442"/>' +
    '<path class="ink f-wash" pathLength="1" style="--d:600ms" d="M456 472 L446 420 L510 420 L500 472 Z"/>' +
    '<path class="ink" pathLength="1" style="--d:800ms" d="M478 420 C474 380 456 360 432 350 M478 420 C482 372 502 352 528 344 M478 420 C478 380 480 340 476 302"/>' +
    '<path class="ink f-door" pathLength="1" style="--d:950ms" d="M432 350 C444 334 462 344 458 364 C444 368 434 362 432 350 Z"/>' +
    '<path class="ink f-door" pathLength="1" style="--d:1000ms" d="M528 344 C530 362 514 372 500 362 C502 346 514 338 528 344 Z"/>' +
    '<path class="ink f-door" pathLength="1" style="--d:1050ms" d="M476 302 C464 290 470 270 484 268 C492 282 490 296 476 302 Z"/>' +
    (acc || BIRDS) +
    "</svg>"
  );
}

/** The ink only changes with the case; `open` moves the leaf. */
const Ink = memo(function Ink({ which }: { which: HubCase }) {
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: doorSvg(ACC[which] ?? "", LEAF_ACC[which] ?? "") }} />;
});

export function DoorScene({ which, open }: { which: HubCase; open: number }) {
  return (
    <div className="scene" aria-hidden="true" data-case={which} style={{ "--open": open.toFixed(3) } as CSSProperties}>
      <Ink key={which} which={which} />
    </div>
  );
}
