// GENERATED from the "OpenDoor Onboarding" design mock (scratchpad/genchat.sh), then typed.
// Decorative, aria-hidden drawings for the conversation, as SVG markup strings.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The name screen: a door, a waving figure and a "hi!" bubble (#helloHi holds the word). */
export const HELLO = `<svg class="dd hello-art" viewBox="0 0 320 204" aria-hidden="true">
  <path class="ink f-sun" pathLength="1" style="--d:250ms" stroke="none" d="M112 184 L112 50 C132 48 156 48 174 49 L174 184 Z"/>
  <path class="ink" pathLength="1" style="--d:100ms" d="M24 185 C110 182 210 187 296 184"/>
  <path class="ink" pathLength="1" style="--d:200ms" stroke-width="2.8" d="M102 185 C101 140 103 80 104 40 C130 36 160 36 184 39 C184 90 183 140 185 185"/>
  <path class="ink f-door" pathLength="1" style="--d:450ms" d="M112 50 L84 62 L84 194 L112 184 Z"/>
  <circle class="late" style="--d:1000ms" cx="92" cy="126" r="3" fill="var(--brass)" stroke="none"/>
  <path class="ink f-wash" pathLength="1" style="--d:600ms" d="M120 190 L168 190 L174 197 L114 197 Z"/>
  <path class="ink f-wash" pathLength="1" style="--d:700ms" d="M206 185 C204 152 210 130 224 128 C238 130 244 152 242 185 Z"/>
  <path class="ink" pathLength="1" style="--d:800ms" d="M210 146 C202 158 202 168 205 176"/>
  <g class="wave"><path class="ink" pathLength="1" style="--d:850ms" d="M238 142 C248 132 254 120 256 107"/><circle class="ink f-paper" pathLength="1" style="--d:950ms" cx="257" cy="101" r="6"/></g>
  <path class="ink f-paper" pathLength="1" style="--d:750ms" d="M224 124 C213 124 208 116 208 107 C208 97 214 91 224 91 C234 91 240 97 240 107 C240 116 235 124 224 124Z"/>
  <path class="ink f-ink" pathLength="1" style="--d:900ms" d="M208 104 C206 90 216 84 226 85 C238 86 243 95 240 106 C234 98 222 96 208 104Z"/>
  <circle class="f-ink late" style="--d:1100ms" cx="219" cy="110" r="1.7" stroke="none"/><circle class="f-ink late" style="--d:1100ms" cx="231" cy="110" r="1.7" stroke="none"/>
  <path class="ink" pathLength="1" style="--d:1150ms" stroke-width="2" d="M220 116 C223 119.5 227 119.5 230 116"/>
  <path class="ink" pathLength="1" style="--d:1400ms" stroke-width="2" d="M268 96 C271 92 273 88 273 83 M271 108 C277 107 281 105 284 101"/>
  <path class="ink f-paper" pathLength="1" style="--d:1200ms" d="M258 30 C258 20 266 16 276 16 L298 16 C308 16 314 22 314 32 L314 44 C314 54 308 58 298 58 L284 58 L270 71 L273 58 C264 57 258 52 258 44 Z"/>
  <g id="helloHiG"><text id="helloHi" class="hand late" style="--d:1500ms" x="286" y="45" text-anchor="middle" font-size="23">hi!</text></g>
  <g style="color:var(--brass)" stroke-width="2">
    <path class="ink" pathLength="1" style="--d:1500ms" d="M50 66 C51 75 52 77 61 78 C52 79 51 81 50 90 C49 81 48 79 39 78 C48 77 49 75 50 66Z"/>
    <path class="ink" pathLength="1" style="--d:1650ms" d="M286 128 C286.6 133 287.4 134 292 134.6 C287.4 135.2 286.6 136 286 141 C285.4 136 284.6 135.2 280 134.6 C284.6 134 285.4 133 286 128Z"/>
    <path class="ink" pathLength="1" style="--d:1750ms" d="M70 120 C68 124 72 126 70 130 M62 150 L64 150"/>
  </g>
</svg>`;

/** One hair style per person, in turn. */
const HAIR = [
  `<path class="f-ink" d="M-10 -34 C-8 -46 9 -46 10 -33 C4 -38 -4 -39 -10 -34Z"/>`,
  `<path class="f-ink" d="M-10 -32 C-12 -46 12 -46 10 -32 L12 -18 C8 -24 9 -32 6 -36 C0 -34 -6 -36 -8 -33 C-10 -28 -8 -22 -12 -18Z"/>`,
  `<circle class="f-ink" cx="0" cy="-45" r="5"/><path class="f-ink" d="M-10 -33 C-9 -42 9 -42 10 -33 C4 -37 -4 -37 -10 -33Z"/>`,
  `<path d="M-9 -36 C-6 -40 -2 -36 0 -40 C2 -36 6 -40 9 -36"/>`,
];

/** A person for the household counter: body colours and hair styles cycle. */
export function person(i: number): string {
  const fill = i % 3 === 0 ? "f-sun" : i % 3 === 1 ? "f-wash" : "f-paper";
  return `<svg class="dd" viewBox="-27 -60 54 92" aria-hidden="true" style="animation-delay:${i*40}ms"><path class="${fill}" d="M-15 30 C-16 6 -12 -12 0 -13 C12 -12 16 6 15 30 Z"/><path class="f-paper" d="M0 -16 C-7 -16 -10 -22 -10 -29 C-10 -36 -6 -40 0 -40 C6 -40 10 -36 10 -29 C10 -22 7 -16 0 -16Z"/>${HAIR[i % HAIR.length]}</svg>`;
}


/** Rough town positions on the county sketch (not to scale). */
export const TOWNS: Record<string, [number, number]> = {Amherst:[196,96],Northampton:[146,118],Easthampton:[132,152],Hadley:[172,112],Belchertown:[228,120],Ware:[254,144],"South Hadley":[180,166],Granby:[208,158],Hatfield:[150,84],Williamsburg:[110,92],Florence:[134,110],Leeds:[128,100],Haydenville:[116,98],Goshen:[90,72],Cummington:[62,78],Worthington:[60,110],Chesterfield:[88,102],"West Chesterfield":[78,96],Huntington:[70,152],Southampton:[110,164],Plainfield:[54,62],"Smith College":[148,122],"North Hatfield":[152,72],"West Hatfield":[140,86]};

/** The places panel map: the county, the river, every town, and a pin on yours. */
export function mapSvg(town: string): string {
  const at = TOWNS[town] as [number, number] | undefined;
  const dots = Object.values(TOWNS).map(([x, y]) => `<circle class="town" cx="${x}" cy="${y}" r="1.8"/>`).join("");
  return `<svg class="dd" viewBox="0 0 300 214" aria-hidden="true">
    <path class="f-wash" stroke-width="1.8" d="M40 58 C70 30 128 34 160 40 C200 30 250 40 268 70 C284 110 270 150 250 176 C220 196 170 190 140 196 C100 200 60 186 46 160 C30 130 24 90 40 58Z"/>
    <path stroke-width="2.2" stroke-dasharray="1 5" d="M162 34 C150 80 170 110 158 140 C148 166 160 184 154 200" style="color:var(--door)"/>
    ${dots}
    ${at ? `<g class="here" style="transform:translate(${at[0]}px,${at[1]}px)"><path class="f-door" stroke-width="1.6" d="M0 0 C-9 -12 -10 -24 0 -26 C10 -24 9 -12 0 0Z" style="animation:od-popin .7s var(--e-spring) both"/><circle class="f-paper" cy="-17" r="3.4" stroke="none"/><text class="tlabel" x="10" y="-14">${esc(town)}</text></g>` : ""}
    <text class="cap" x="16" y="208">Hampshire County · not to scale</text>
  </svg>`;
}


/** The ZIP question's map: a folded paper sheet, scaled up from the county sketch, with room for a pin. */
const ZP = (t: string) => TOWNS[t].map(n => +(n * 1.4).toFixed(1));
export function zipMap(): string {
  const county = "M40 58 C70 30 128 34 160 40 C200 30 250 40 268 70 C284 110 270 150 250 176 C220 196 170 190 140 196 C100 200 60 186 46 160 C30 130 24 90 40 58Z";
  const river = "M227 48 C210 112 238 154 221 196 C207 232 224 258 216 280";
  const sheet = "M12 14 L408 8 L412 288 L8 294 Z";
  const road = (ts: string[]) => "M" + ts.map(t => ZP(t).join(" ")).join(" L");
  const dots = Object.keys(TOWNS).map((t, i) => { const [x, y] = ZP(t); return `<g class="tw zf" data-t="${esc(t)}" style="--d:${650 + i * 22}ms"><circle cx="${x}" cy="${y}" r="2.6"/></g>`; }).join("");
  const labs = ["Northampton","Amherst","Easthampton","Belchertown","Ware","Worthington"].map(t => { const [x, y] = ZP(t); return `<text class="tl zf" style="--d:1150ms" x="${x + 7}" y="${y + 14}">${t}</text>`; }).join("");
  const trees = [[132,252],[143,258],[296,98],[307,104],[338,252],[112,162]].map(([x, y]) => `<path d="M${x} ${y} V${y - 7}" stroke-width="1.6"/><circle class="f-door" cx="${x}" cy="${y - 11}" r="4.5" stroke-width="1.4"/>`).join("");
  return `<svg class="dd" viewBox="0 0 420 300">
    <path class="zf f-paper" stroke="none" style="--d:0ms" d="${sheet}"/>
    <path class="zd" pathLength="1" stroke-width="1.6" style="--d:40ms" d="${sheet}"/>
    <path class="zf fold" style="--d:300ms" d="M144 12 L142 291 M278 10 L280 290"/>
    <g transform="scale(1.4)"><path class="zf f-wash" stroke="none" style="--d:300ms" d="${county}"/><path class="zd" pathLength="1" stroke-width="1.45" style="--d:180ms" d="${county}"/></g>
    <path class="zf" stroke-width="8" style="--d:550ms;color:color-mix(in srgb,var(--door) 22%,transparent)" d="${river}"/>
    <path class="zd" id="zriver" pathLength="1" stroke-width="1.7" style="--d:480ms;color:var(--door)" d="${river}"/>
    <text class="riv zf" style="--d:1000ms"><textPath href="#zriver" startOffset="6%">Connecticut River</textPath></text>
    <g class="zf" style="--d:850ms"><path class="road" d="${road(["Worthington","Chesterfield","Williamsburg","Northampton","Hadley","Amherst","Belchertown","Ware"])}"/><path class="road" d="${road(["Huntington","Southampton","Easthampton","Northampton"])}"/><path class="road" d="${road(["Easthampton","South Hadley","Granby","Belchertown"])}"/></g>
    <path class="zd" pathLength="1" stroke-width="1.6" style="--d:800ms" d="M60 138 l9 -13 l9 13 M76 148 l8 -11 l8 11 M96 198 l9 -13 l9 13 M110 206 l7 -10 l7 10"/>
    <g class="zf" style="--d:950ms">${trees}</g>
    ${dots}
    ${labs}
    <g class="zf" style="--d:1250ms"><circle class="f-paper" cx="380" cy="50" r="15" stroke-width="1.4"/><path class="f-ink" stroke="none" d="M380 38 L384.5 52 L380 48.5 L375.5 52Z"/><text class="cmp" x="380" y="30" text-anchor="middle">N</text></g>
    <text class="cap zf" style="--d:1300ms" x="24" y="280">Hampshire County · not to scale</text>
    <g class="zout"><path d="M318 150 C342 146 366 152 400 147 M391 140 L401 147 L391 154" stroke-width="2.2" style="color:var(--alert)"/><text class="hand" x="352" y="134" text-anchor="middle" font-size="21">somewhere past here</text></g>
    <g id="zpin"></g>
  </svg>`;
}

/** The pin that drops on a town once the fifth digit is in. */
export function pinSvg(t: string): string {
  const [x, y] = ZP(t), right = x > 300;
  return `<g style="transform:translate(${x}px,${y}px)"><ellipse class="zp-shadow" rx="9" ry="3"/><circle class="zp-ring" r="6"/><g class="zp-drop"><path class="f-door" stroke-width="2" d="M0 0 C-11 -14 -13 -30 0 -33 C13 -30 11 -14 0 0Z"/><circle class="f-sun" cy="-21" r="5" stroke-width="1.6"/></g><text class="zp-tag hand" x="${right ? -16 : 16}" y="-24" text-anchor="${right ? "end" : "start"}" font-size="25" style="fill:var(--door);stroke:var(--raised);stroke-width:5px;paint-order:stroke;stroke-linejoin:round">${esc(t)}</text></g>`;
}
