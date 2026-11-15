// Decorative SVG art for Behind the scenes, copied verbatim from the "OpenDoor
// Onboarding" design mock. Static markup only, rendered with dangerouslySetInnerHTML.

/** The loop diagram: coordinator in the middle, four helpers around it, you below (inner markup of a 760x500 svg). */
export const LOOP_MAP = `<g class="pen">
<path class="ag-edge" id="agEL" d="M380 222 C300 210 190 160 118 96"/>
<path class="ag-edge" id="agEF" d="M380 222 C460 210 570 160 642 96"/>
<path class="ag-edge" id="agEC" d="M380 222 C460 236 570 290 642 350"/>
<path class="ag-edge" id="agEP" d="M380 222 C300 236 190 290 118 350"/>
<path class="ag-edge" id="agEY" d="M380 222 C384 300 376 380 380 446"/>
</g>
<g id="agTok" style="opacity:0" transform="translate(380 222)"><path class="note f-paper" stroke-width="1.8" d="M-12 -9 L7 -9 L12 -4 L12 9 L-12 9Z"/><path stroke-width="1.5" d="M-7 -3 L5 -3 M-7 2 L3 2"/></g>

<g class="ag-hub" id="agHub">
<circle class="halo f-wash pen" cx="380" cy="222" r="76" stroke-width="1.6"/>
<g class="pen">
<path class="f-sun" stroke="none" d="M350 268 L350 180 C370 177 390 177 410 179 L410 268Z"/>
<g class="leaf"><path class="f-door" stroke-width="1.8" d="M350 180 L386 187 L386 263 L350 268Z"/><circle cx="378" cy="228" r="2.6" fill="var(--brass)" stroke="none"/></g>
<path stroke-width="2.6" d="M342 268 L343 174 C368 169 393 169 418 173 L417 268"/>
<path d="M322 268 C360 266 400 269 438 267"/>
</g>
<text class="ag-name" x="380" y="116" text-anchor="middle">Coordinator</text>
<text class="ag-sub" x="380" y="133" text-anchor="middle">picks who goes next</text>
</g>

<g class="ag-node" id="agNL" transform="translate(118 96)">
<circle class="ring" r="50"/>
<g class="core pen"><circle class="f-sun" r="46"/><svg x="-34" y="-28" width="68" height="57" viewBox="0 0 120 100" overflow="visible"><path class="f-paper" d="M24 22 L78 16 L84 86 L30 90Z"/><path d="M38 38 L70 35 M39 52 L72 49 M40 66 L62 64"/><path class="f-wash" d="M90 24 L100 29 L76 84 L66 89 L66 78Z"/></svg></g>
<text class="ag-name" y="72" text-anchor="middle">Listener</text>
<text class="ag-sub" y="89" text-anchor="middle">files your answer</text>
</g>
<g class="ag-node" id="agNF" transform="translate(642 96)">
<circle class="ring" r="50"/>
<g class="core pen"><circle class="f-wash" r="46"/><svg x="-34" y="-28" width="68" height="57" viewBox="0 0 120 100" overflow="visible"><path class="f-paper" d="M16 32 L60 28 L62 82 L18 86Z"/><path class="f-sun" d="M30 20 L74 18 L76 72 L32 76Z"/><path d="M40 36 L64 35 M41 48 L58 47"/><circle class="f-paper" cx="76" cy="54" r="17"/><path d="M88 66 L104 84" stroke-width="4"/></svg></g>
<text class="ag-name" y="72" text-anchor="middle">Finder</text>
<text class="ag-sub" y="89" text-anchor="middle">looks nearby</text>
</g>
<g class="ag-node" id="agNC" transform="translate(642 350)">
<circle class="ring" r="50"/>
<g class="core pen"><circle class="f-sun" r="46"/><svg x="-34" y="-28" width="68" height="57" viewBox="0 0 120 100" overflow="visible"><path class="f-wash" d="M50 60 C50 47 44 43 44 34 C44 22 76 22 76 34 C76 43 70 47 70 60Z"/><path class="f-paper" d="M36 60 L84 60 L88 74 L32 74Z"/><path d="M26 86 L94 86"/><path d="M38 80 L82 80" stroke-dasharray="3 5"/></svg></g>
<text class="ag-name" y="72" text-anchor="middle">Checker</text>
<text class="ag-sub" y="89" text-anchor="middle">sorts by fit</text>
</g>
<g class="ag-node" id="agNP" transform="translate(118 350)">
<circle class="ring" r="50"/>
<g class="core pen"><circle class="f-wash" r="46"/><svg x="-34" y="-28" width="68" height="57" viewBox="0 0 120 100" overflow="visible"><path class="f-paper" d="M18 66 L44 66 L44 90 L18 90Z"/><path class="f-sun" d="M47 46 L73 46 L73 90 L47 90Z"/><path class="f-paper" d="M76 24 L102 24 L102 90 L76 90Z"/><path d="M28 80 L34 80 M57 80 L63 80 M86 80 L92 80"/></svg></g>
<text class="ag-name" y="72" text-anchor="middle">Planner</text>
<text class="ag-sub" y="89" text-anchor="middle">orders the steps</text>
</g>

<g class="ag-node" id="agYou" transform="translate(380 452)">
<circle class="ring" cy="-4" r="30"/>
<g class="core pen"><path class="f-sun" d="M-18 22 C-18 0 -10 -6 0 -6 C10 -6 18 0 18 22Z"/><circle class="f-paper" cy="-20" r="11"/></g>
</g>
<text class="ag-name" x="380" y="496" text-anchor="middle">You</text>

<g transform="translate(118 30)"><g class="ag-tag" id="agTL"><path class="f-paper" stroke-width="1.6" d="M-82 -18 L82 -18 L82 12 L-82 12Z"/><text y="2" text-anchor="middle">ZIP 01002 · Amherst ✓</text></g></g>
<g transform="translate(642 30)"><g class="ag-tag" id="agTF"><path class="f-paper" stroke-width="1.6" d="M-74 -18 L74 -18 L74 12 L-74 12Z"/><text y="2" text-anchor="middle">9 places nearby</text></g></g>
<g transform="translate(652 478)"><g class="ag-tag" id="agTC"><path class="f-paper" stroke-width="1.6" d="M-94 -18 L94 -18 L94 12 L-94 12Z"/><text y="2" text-anchor="middle">likely · possibly · need info</text></g></g>
<g transform="translate(108 478)"><g class="ag-tag" id="agTP"><path class="f-paper" stroke-width="1.6" d="M-84 -18 L84 -18 L84 12 L-84 12Z"/><text y="2" text-anchor="middle">next steps: 1 · 2 · 3</text></g></g>
<g transform="translate(274 446)"><g class="ag-tag" id="agTA"><path class="f-paper" stroke-width="1.6" d="M-62 -20 L62 -20 L62 -3 L74 3 L62 7 L62 12 L-62 12Z"/><text y="1" text-anchor="middle">my ZIP is 01002</text></g></g>
<g transform="translate(492 446)"><g class="ag-tag" id="agTQ"><path class="f-sun" stroke-width="1.6" d="M-72 -20 L72 -20 L72 12 L-72 12 L-72 7 L-84 3 L-72 -3Z"/><text y="1" text-anchor="middle">Who lives with you?</text></g></g>`;

/** Team cards, in order: Coordinator, Listener, Finder, Checker, Planner, Form Helper (inner markup of 120x100 svgs). */
export const TEAM_ART = [
  `<path class="f-paper" d="M34 18 L86 18 L86 90 L34 90Z" style="color:var(--ink)"/><path class="f-sun" d="M48 11 L72 11 L72 25 L48 25Z" style="color:var(--ink)"/><path d="M44 42 L50 48 L58 37 M64 43 L78 43 M44 62 L50 68 L58 57 M64 63 L78 63 M45 80 L56 80 M64 80 L76 80" style="color:var(--ink)"/>`,
  `<path class="f-sun" d="M24 22 L78 16 L84 86 L30 90Z"/><path d="M38 38 L70 35 M39 52 L72 49 M40 66 L62 64"/><path class="f-paper" d="M90 24 L100 29 L76 84 L66 89 L66 78Z"/>`,
  `<path class="f-paper" d="M16 32 L60 28 L62 82 L18 86Z"/><path class="f-wash" d="M30 20 L74 18 L76 72 L32 76Z"/><path d="M40 36 L64 35 M41 48 L58 47"/><circle class="f-paper" cx="76" cy="54" r="17"/><path d="M88 66 L104 84" stroke-width="4"/>`,
  `<path class="f-wash" d="M50 60 C50 47 44 43 44 34 C44 22 76 22 76 34 C76 43 70 47 70 60Z"/><path class="f-sun" d="M36 60 L84 60 L88 74 L32 74Z"/><path d="M26 86 L94 86"/><path d="M38 80 L82 80" stroke-dasharray="3 5"/>`,
  `<path class="f-wash" d="M18 66 L44 66 L44 90 L18 90Z"/><path class="f-sun" d="M47 46 L73 46 L73 90 L47 90Z"/><path class="f-paper" d="M76 24 L102 24 L102 90 L76 90Z"/><text x="26" y="84" font-size="16">1</text><text x="55" y="84" font-size="16">2</text><text x="84" y="84" font-size="16">3</text>`,
  `<path class="f-paper" d="M18 14 L92 14 L92 88 L18 88Z"/><path d="M28 32 L66 32 M28 48 L80 48 M28 64 L56 64"/><path class="f-sun" d="M64 56 L64 94 L73 85 L80 98 L87 95 L80 82 L92 82Z"/>`,
];

/** The form helper's three points (inner markup of 120x100 svgs). */
export const FORM_POINT_ART = [
  `<path class="f-wash" d="M10 28 L110 28 L110 72 L10 72Z"/><text x="20" y="60" font-size="28">{{ }}</text>`,
  `<path class="f-sun" d="M44 12 L76 12 L98 34 L98 66 L76 88 L44 88 L22 66 L22 34Z"/><path d="M48 60 L48 40 M58 58 L58 32 M68 58 L68 34 M78 60 L78 42 M46 60 C48 76 76 78 80 60"/>`,
  `<path class="f-paper" d="M14 26 L106 26 L106 82 L14 82Z"/><path d="M14 26 L60 60 L106 26"/>`,
];

/** Rules every helper follows (inner markup of 120x100 svgs). */
export const RULE_ART = [
  `<path class="f-paper" d="M24 20 L96 20 L96 84 L24 84Z"/><path d="M36 38 L48 50 L66 30" style="color:var(--door)" stroke-width="3"/><path d="M36 66 L84 66 M74 40 L84 40"/>`,
  `<path class="f-paper" d="M16 20 L104 20 L104 72 L58 72 L40 88 L44 72 L16 72Z"/><text x="34" y="55" font-size="24">$400</text><path d="M28 50 L92 40" stroke-width="3" style="color:var(--alert)"/>`,
  `<path d="M60 18 L60 88 M40 88 L80 88 M26 30 L94 30"/><path class="f-wash" d="M14 58 C18 72 38 72 42 58 Z"/><path d="M26 30 L14 58 M26 30 L42 58"/><path class="f-sun" d="M78 58 C82 72 102 72 106 58 Z"/><path d="M94 30 L78 58 M94 30 L106 58"/>`,
  `<path class="f-door" d="M22 26 L98 26 C104 26 106 30 106 36 L106 48 C106 54 104 56 98 56 L22 56 C16 56 14 52 14 46 L14 36 C14 30 16 26 22 26Z"/><text x="40" y="47" font-size="18" style="fill:var(--on-door)">Send</text><path class="f-paper" d="M66 96 L62 62 C62 56 70 56 71 62 L73 72 L82 70 C88 69 92 74 91 80 L88 96Z"/>`,
];

/** The form helper demo: a form window, a wire, and the plan updating. aria-hidden. */
export const FORM_DEMO = `<div class="ag-win">
<div class="ag-win-bar"><i></i><i></i><i></i><span>Fuel Assistance · application</span></div>
<div class="ag-win-body">
<div class="ag-f p1"><span>Phone number</span><b class="box"><i class="ag-ph">{{phone}}</i><i class="ag-val">(413) •••-••42</i></b></div>
<div class="ag-f p2"><span>People in your household</span><b class="box"><i class="ag-ph">{{household_size}}</i><i class="ag-val">2</i></b></div>
<div class="ag-f sign"><span>Signature</span><b class="box"><i class="ag-you">you sign this part</i></b></div>
<div class="ag-send-row"><i class="ag-you send-note">you press Send</i><span class="ag-send">Send</span></div>
</div>
</div>
<div class="ag-wire"><svg class="ag-svg" viewBox="0 0 56 20"><path d="M2 10 C18 7 36 13 54 10" stroke="currentColor" stroke-dasharray="2 5"/></svg><svg class="ag-env ag-svg" viewBox="0 0 30 22"><path class="f-sun" stroke="currentColor" d="M2 2 L28 2 L28 20 L2 20Z"/><path stroke="currentColor" d="M2 2 L15 12 L28 2"/></svg></div>
<div class="ag-plan">
<p class="mono">Your plan</p>
<div class="it">Fuel Assistance<span class="ag-stat"><i class="fit info todo">To do</i><i class="fit sent">Sent ✓</i></span><span class="when">Sent today. Watch for a reply from the provider.</span></div>
<div class="it dim">SNAP application help<span class="ag-stat"><i class="fit info">To do</i></span></div>
</div>`;
