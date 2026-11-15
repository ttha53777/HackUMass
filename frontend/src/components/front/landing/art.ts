// Decorative, aria-hidden SVG art for the landing page, copied verbatim from the
// "OpenDoor Onboarding" design mock. Static markup only: nothing here is built from
// user input. Rendered with dangerouslySetInnerHTML so it stays a 1:1 copy.

/** The hero: a doorway, a cat, a plant and birds, drawn in. The door swings open as you scroll. */
export const SCENE = `<svg class="dd boil" viewBox="90 70 460 450">
<!-- inside the doorway -->
<path class="f-sun" d="M222 472 L222 132 C280 129 330 129 380 131 L380 472 Z" stroke="none"/>
<g stroke-width="2">
<path class="ink" pathLength="1" style="--d:900ms" d="M252 196 L300 194 L301 252 L251 253 Z M276 195 L276 252 M252 224 L300 223"/>
<path class="ink" pathLength="1" style="--d:1000ms" d="M338 300 L338 432 M326 432 L350 432"/>
<path class="ink f-paper" pathLength="1" style="--d:1050ms" d="M318 300 L358 300 L349 272 L327 272 Z"/>
</g>
<!-- light spill on the floor -->
<path class="spill f-sun" stroke="none" d="M222 472 L380 472 L478 514 L136 514 Z"/>
<!-- floor -->
<path class="ink" pathLength="1" style="--d:100ms" d="M18 472 C150 468 430 475 584 469"/>
<!-- frame -->
<path class="ink" pathLength="1" style="--d:250ms" stroke-width="2.8" d="M206 472 C205 380 207 220 208 118 C262 113 338 113 394 116 C394 230 393 380 395 472"/>
<path class="ink" pathLength="1" style="--d:420ms" d="M222 472 L222 132 C280 129 330 129 380 131 L380 472"/>
<path class="ink" pathLength="1" style="--d:500ms" d="M196 112 C260 104 344 106 404 110"/>
<!-- sconce -->
<path class="ink" pathLength="1" style="--d:1200ms" d="M414 196 L414 212"/>
<path class="ink f-sun" pathLength="1" style="--d:1250ms" d="M406 212 L422 212 L428 234 L400 234 Z"/>
<path class="ink" pathLength="1" style="--d:1500ms" d="M436 214 L446 208 M438 230 L450 232 M392 214 L382 208"/>
<!-- mat -->
<path class="ink f-wash" pathLength="1" style="--d:700ms" d="M238 480 L366 480 L378 497 L226 497 Z"/>
<g class="lay lay-cat">
<path class="ink f-ink" pathLength="1" style="--d:1300ms" d="M136 471 C126 446 132 420 150 414 C168 418 176 444 170 471 Z"/>
<path class="ink f-ink" pathLength="1" style="--d:1400ms" d="M141 420 C137 402 146 392 156 394 C168 396 170 410 162 420 Z M142 404 L139 386 L150 395 M158 394 L166 384 L166 400"/>
<path class="ink" pathLength="1" style="--d:1550ms" d="M168 466 C192 472 202 452 188 442"/>
</g>
<g class="lay lay-plant">
<path class="ink f-wash" pathLength="1" style="--d:600ms" d="M456 472 L446 420 L510 420 L500 472 Z"/>
<path class="ink" pathLength="1" style="--d:650ms" d="M440 420 L516 420"/>
<path class="ink" pathLength="1" style="--d:800ms" d="M478 420 C474 380 456 360 432 350 M478 420 C482 372 502 352 528 344 M478 420 C478 380 480 340 476 302"/>
<path class="ink f-door" pathLength="1" style="--d:950ms" d="M432 350 C444 334 462 344 458 364 C444 368 434 362 432 350 Z"/>
<path class="ink f-door" pathLength="1" style="--d:1000ms" d="M528 344 C530 362 514 372 500 362 C502 346 514 338 528 344 Z"/>
<path class="ink f-door" pathLength="1" style="--d:1050ms" d="M476 302 C464 290 470 270 484 268 C492 282 490 296 476 302 Z"/>
<path class="ink f-door" pathLength="1" style="--d:1100ms" d="M479 372 C466 366 460 350 468 340 C480 344 484 360 479 372 Z"/>
</g>
<g class="lay lay-bird">
<path class="ink" pathLength="1" style="--d:1700ms" d="M90 120 C96 112 102 112 106 120 C110 112 116 112 122 120"/>
<path class="ink" pathLength="1" style="--d:1800ms" d="M128 92 C132 87 136 87 139 92 C142 87 146 87 150 92"/>
</g>
</svg>
<div class="door-wrap">
<div class="door" id="door">
<svg class="dd boil" viewBox="0 0 158 342" preserveAspectRatio="none">
<path class="ink f-door" pathLength="1" style="--d:450ms" d="M2 2 C50 0 110 1 156 3 L155 340 C100 341 50 341 3 339 Z"/>
<g stroke="var(--on-door)" stroke-opacity=".38" stroke-width="2">
<path class="ink" pathLength="1" style="--d:900ms" d="M24 30 L134 31 L133 150 L25 149 Z"/>
<path class="ink" pathLength="1" style="--d:1000ms" d="M24 180 L134 181 L133 314 L25 313 Z"/>
</g>
<circle cx="136" cy="176" r="6.5" fill="var(--brass)" stroke="none"/>
<g class="sign">
<path class="ink" pathLength="1" style="--d:1300ms" d="M50 96 L79 64 L108 96"/>
<circle cx="79" cy="63" r="2.5" class="f-ink" stroke="none"/>
<path class="ink f-paper" pathLength="1" style="--d:1400ms" d="M38 96 L120 95 L118 132 L40 133 Z"/>
<text x="79" y="120" text-anchor="middle" font-size="19">Come in</text>
</g>
</svg>
</div>
</div>
<p class="scene-note">it opens as you scroll<svg class="dd" viewBox="0 0 60 40"><path d="M50 4 C40 18 26 28 8 32 M8 32 L18 24 M8 32 L18 37"/></svg></p>`;

/** How it works: one drawing per beat (a chat, a map with pins, a checklist). */
export const STORY_STAGES = `<svg class="dd" viewBox="0 0 400 360" data-s="0">
<path class="dr fl f-paper" pathLength="1" d="M54 70 Q54 44 82 44 L262 44 Q290 44 290 72 L290 136 Q290 162 262 162 L130 162 L92 196 L102 162 L82 162 Q54 162 54 134 Z"/>
<path class="dr" pathLength="1" d="M88 84 C140 82 200 86 252 82"/>
<path class="dr" pathLength="1" d="M88 108 C130 106 180 110 226 106"/>
<path class="dr" pathLength="1" d="M88 132 C116 131 150 133 176 131"/>
<path class="dr fl f-wash" pathLength="1" d="M168 214 Q168 192 192 192 L322 192 Q346 192 346 216 L346 256 Q346 280 322 280 L304 280 L312 312 L282 280 L192 280 Q168 280 168 256 Z"/>
<circle class="fl f-ink" cx="226" cy="236" r="6" stroke="none"/><circle class="fl f-ink" cx="257" cy="236" r="6" stroke="none"/><circle class="fl f-ink" cx="288" cy="236" r="6" stroke="none"/>
</svg>
<svg class="dd" viewBox="0 0 400 360" data-s="1" style="opacity:0">
<path class="dr fl f-paper" pathLength="1" d="M58 92 L150 68 L246 96 L342 72 L342 284 L246 308 L150 280 L58 304 Z"/>
<path class="dr" pathLength="1" d="M150 68 L150 280 M246 96 L246 308"/>
<path class="dr fl f-wash" pathLength="1" d="M82 150 C110 128 130 170 160 150 C190 130 200 180 230 170 L230 230 C200 250 170 210 140 236 C110 256 96 220 82 230 Z"/>
<path class="dr" pathLength="1" stroke-dasharray="1" d="M96 262 C140 230 170 270 206 214 C230 176 270 196 300 140"/>
<g class="pin" style="--pi:.6"><path class="f-door" d="M300 140 C288 124 287 106 300 103 C313 106 312 124 300 140 Z"/><circle class="f-paper" cx="300" cy="117" r="4" stroke="none"/></g>
<g class="pin" style="--pi:1.2"><path class="f-sun" d="M206 214 C198 202 198 190 206 188 C214 190 214 202 206 214 Z"/></g>
<g class="pin" style="--pi:1.8"><path class="f-sun" d="M110 252 C102 240 102 228 110 226 C118 228 118 240 110 252 Z"/></g>
</svg>
<svg class="dd" viewBox="0 0 400 360" data-s="2" style="opacity:0">
<path class="dr fl f-paper" pathLength="1" d="M92 56 L308 58 L306 326 L94 324 Z"/>
<path class="dr fl f-wash" pathLength="1" d="M160 40 L240 40 L242 72 L158 72 Z"/>
<path class="dr" pathLength="1" d="M126 118 L150 118 L150 142 L126 142 Z M170 130 C210 128 240 132 276 129"/>
<path class="dr" pathLength="1" d="M126 180 L150 180 L150 204 L126 204 Z M170 192 C200 190 230 194 262 191"/>
<path class="dr" pathLength="1" d="M126 242 L150 242 L150 266 L126 266 Z M170 254 C206 252 236 256 270 253"/>
<path class="chk" style="--ci:.25;color:var(--door)" stroke-width="4" pathLength="1" d="M122 126 L136 140 L160 106"/>
<path class="chk" style="--ci:.45;color:var(--door)" stroke-width="4" pathLength="1" d="M122 188 L136 202 L160 168"/>
<path class="chk" style="--ci:.65;color:var(--door)" stroke-width="4" pathLength="1" d="M122 250 L136 264 L160 230"/>
</svg>`;

/** Extras: a form filling itself in, then waiting for you to press Send. */
export const EXTRA_FORM = `<div class="sheet">
<div class="mf" style="--n:4;--td:.5s;--dur:.3s"><span>First name</span><b class="box"><i>Maya</i></b></div>
<div class="mf" style="--n:13;--td:1s;--dur:.9s"><span>Street address</span><b class="box"><i>12 Elm Street</i></b></div>
<div class="mf" style="--n:7;--td:2.1s;--dur:.5s"><span>Town</span><b class="box"><i>Amherst</i></b></div>
<div class="mf-foot"><span class="mf-note">you check it,<br>you press send</span><span class="mf-send">Send</span></div>
</div>`;

/** Extras: a read-only bank summary turning "need more info" into "possibly a fit". */
export const EXTRA_BANK = `<div class="bank">
<div class="bk-head"><svg class="dd" viewBox="0 0 24 24" style="filter:none"><path d="M3 9.5 L12 4 L21 9.5 M5 10 V18 M9.7 10 V18 M14.3 10 V18 M19 10 V18 M3 20 H21"/></svg><b>Your bank</b><span class="bk-ok mono">Read-only</span></div>
<div class="bk-row" style="--i:0"><span>Money in</span><b>$2,140 / mo</b></div>
<div class="bk-row" style="--i:1"><span>Rent</span><b>$1,150 / mo</b></div>
<div class="bk-row" style="--i:2"><span>Electric bill</span><b class="due">Behind</b></div>
<div class="bk-confirm"><span>Use $2,140 a month?</span><em>Yes, that's right</em></div>
</div>
<svg class="bk-arrow dd" viewBox="0 0 40 24"><path d="M3 13 C14 10 24 14 35 11 M28 5 L36 11 L29 18"/></svg>
<div class="fits">
<div class="fitrow">Fuel Assistance<span class="flip" style="--fd:2.4s"><i class="fit info">Need more info</i><i class="fit possibly">Possibly a fit</i></span></div>
<div class="fitrow">SNAP<span class="flip" style="--fd:2.65s"><i class="fit info">Need more info</i><i class="fit possibly">Possibly a fit</i></span></div>
</div>`;

/** The final call to action's open door (inner markup of a 240x300 svg). */
export const FIN_FRAME = `<path class="fl f-sun" stroke="none" d="M56 286 L56 40 C100 36 140 36 184 40 L184 286 Z"/>
<path class="dr" pathLength="1" stroke-width="2.6" d="M40 288 C39 200 41 100 42 26 C96 21 146 21 198 24 C198 120 197 220 199 288"/>
<path class="dr" pathLength="1" d="M56 288 L56 40 C100 36 140 36 184 40 L184 288"/>
<path class="dr" pathLength="1" d="M10 288 C80 285 160 290 232 286"/>
<path class="fl f-door" d="M56 40 L104 52 L104 300 L56 288 Z"/>
<circle class="fl" cx="96" cy="170" r="3.5" fill="var(--brass)" stroke="none"/>`;

/** Promises: one doodle per promise (inner markup of a 120x100 svg). */
export const PROMISE_ART = [
  `<path class="f-paper" d="M30 14 L82 14 L92 26 L92 88 L30 88 Z"/><path d="M42 36 L80 36 M42 50 L80 50 M42 64 L66 64"/><path stroke-width="3" d="M18 82 C46 54 76 34 104 16" style="color:var(--alert)"/>`,
  `<path d="M44 48 L44 36 C44 20 76 20 76 36 L76 48"/><path class="f-wash" d="M34 48 L86 48 L86 88 L34 88 Z"/><circle class="f-ink" cx="60" cy="64" r="5" stroke="none"/><path d="M60 68 L60 78"/>`,
  `<path d="M60 18 L60 88 M40 88 L80 88 M26 30 L94 30"/><path class="f-wash" d="M14 58 C18 72 38 72 42 58 Z"/><path d="M26 30 L14 58 M26 30 L42 58"/><path class="f-sun" d="M78 58 C82 72 102 72 106 58 Z"/><path d="M94 30 L78 58 M94 30 L106 58"/>`,
  `<path class="f-paper" d="M24 20 L96 20 L96 84 L24 84 Z"/><path d="M36 38 L48 50 L66 30" style="color:var(--door)" stroke-width="3"/><path d="M36 66 L84 66 M74 40 L84 40"/>`,
];
