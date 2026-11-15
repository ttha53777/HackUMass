// The pen doodles from the design mock, one per need (and an idea bulb). Static,
// aria-hidden markup copied verbatim; hover animations hang off the class names
// (steam, flame, wheel, arc, wig, tilt, topple, pop, lite) in front.css.

function radiator(): string {
  let s = "";
  for (let i = 0; i < 5; i++) {
    const x = 28 + i * 13;
    s += `<path class="f-wash" d="M${x} 44 C${x} 38 ${x + 10} 38 ${x + 10} 44 L${x + 10} 80 C${x + 10} 86 ${x} 86 ${x} 80Z"/>`;
  }
  return s;
}

export const DOODLES: Record<string, string> = {
  food: `<path class="steam" d="M46 34 C42 28 50 22 46 14"/><path class="steam" d="M60 32 C56 24 64 18 60 10"/><path class="steam" d="M74 34 C70 28 78 22 74 14"/><path class="f-wash" d="M22 48 C26 80 94 80 98 48 Z"/><path d="M14 48 L106 48"/><path d="M44 88 L76 88"/>`,
  utilities:
    radiator() +
    `<path d="M22 56 L28 56 M93 56 L100 56 M30 86 L30 92 M86 86 L86 92"/><path class="flame f-sun" d="M60 32 C50 24 54 14 60 8 C62 16 70 18 66 28 C64 32 62 33 60 32Z"/>`,
  housing: `<path class="f-wash" d="M28 50 L60 24 L92 50 L92 88 L28 88 Z"/><path d="M20 56 L60 20 L100 56"/><path class="lite f-paper" d="M52 88 L52 62 L68 62 L68 88"/><path d="M34 58 L46 58 L46 70 L34 70 Z M74 58 L86 58 L86 70 L74 70Z"/><path d="M80 34 L80 22 L88 22 L88 40"/>`,
  healthcare: `<g class="wig"><path class="f-sun" d="M28 72 L70 30 C78 22 92 36 84 44 L42 86 C34 94 20 80 28 72Z"/><path class="f-paper" d="M46 56 L56 46 L68 58 L58 68Z"/><circle cx="36" cy="74" r="1.4" class="f-ink"/><circle cx="42" cy="80" r="1.4" class="f-ink"/><circle cx="76" cy="36" r="1.4" class="f-ink"/><circle cx="82" cy="42" r="1.4" class="f-ink"/></g>`,
  transportation: `<path class="f-wash" d="M16 30 C16 24 20 20 26 20 L94 20 C100 20 104 24 104 30 L104 74 L16 74 Z"/><path d="M24 30 L46 30 L46 48 L24 48Z M52 30 L72 30 L72 48 L52 48Z M78 30 L96 30 L96 48 L78 48Z M16 58 L104 58"/><g class="wheel" style="transform-origin:38px 76px"><circle class="f-paper" cx="38" cy="76" r="9"/><path d="M38 70 L38 82 M32 76 L44 76"/></g><g class="wheel" style="transform-origin:84px 76px"><circle class="f-paper" cx="84" cy="76" r="9"/><path d="M84 70 L84 82 M78 76 L90 76"/></g><path d="M6 88 L114 88"/>`,
  phone_internet: `<path class="f-wash" d="M42 16 L72 16 C76 16 78 18 78 22 L78 84 C78 88 76 90 72 90 L42 90 C38 90 36 88 36 84 L36 22 C36 18 38 16 42 16Z"/><path d="M50 80 L64 80 M50 24 L64 24"/><path class="arc a1" d="M86 38 C92 44 92 54 86 60"/><path class="arc a2" d="M95 30 C106 41 106 57 95 68"/>`,
  childcare: `<g class="topple"><path class="f-sun" d="M22 58 L52 58 L52 88 L22 88Z"/><path class="f-wash" d="M58 58 L88 58 L88 88 L58 88Z"/><path class="f-paper" d="M38 26 L70 26 L70 58 L38 58Z"/><text x="31" y="80" font-size="20">a</text><text x="67" y="80" font-size="20">b</text><text x="48" y="49" font-size="20">c</text></g>`,
  mental_health: `<path d="M20 40 L20 88 M20 66 L44 66 M44 66 L44 88"/><path d="M100 40 L100 88 M100 66 L76 66 M76 66 L76 88"/><path class="f-wash" d="M52 72 L68 72 L66 88 L54 88Z"/><path class="pop f-sun" d="M44 22 C44 12 76 12 76 22 C76 32 62 34 56 32 L48 40 L50 31 C46 30 44 27 44 22Z"/>`,
  legal: `<g class="tilt"><path d="M60 18 L60 88 M40 88 L80 88 M26 30 L94 30"/><path class="f-wash" d="M14 58 C18 72 38 72 42 58 Z"/><path d="M26 30 L14 58 M26 30 L42 58"/><path class="f-sun" d="M78 58 C82 72 102 72 106 58 Z"/><path d="M94 30 L78 58 M94 30 L106 58"/></g>`,
  employment: `<path class="f-wash" d="M16 44 L104 44 L104 86 L16 86Z"/><path d="M44 44 L44 34 C44 30 46 28 50 28 L70 28 C74 28 76 30 76 34 L76 44 M16 62 L104 62"/><path class="f-sun wig" d="M52 56 L68 56 L68 68 L52 68Z"/>`,
  taxes: `<path class="f-paper" d="M32 14 L88 14 L88 92 L80 86 L72 92 L64 86 L56 92 L48 86 L40 92 L32 86Z"/><path d="M44 30 L76 30 M44 42 L76 42 M44 54 L64 54"/><path class="f-sun wig" d="M44 68 L76 68 L76 76 L44 76Z"/>`,
  safety: `<path d="M44 48 L44 36 C44 20 76 20 76 36 L76 48"/><path class="f-wash" d="M34 48 L86 48 L86 88 L34 88Z"/><circle class="f-ink" cx="60" cy="64" r="5"/><path d="M60 68 L60 78"/>`,
  seniors: `<path class="f-wash" d="M24 50 C24 32 56 32 56 50 L56 88 L24 88Z"/><circle class="f-paper" cx="40" cy="24" r="10"/><path class="wig" d="M66 40 L66 88 M66 40 C66 30 82 30 82 40"/><path class="pop f-sun" d="M90 78 C80 70 76 64 76 58 C76 52 84 50 90 57 C96 50 104 52 104 58 C104 64 100 70 90 78Z"/><path d="M14 88 L106 88"/>`,
  pregnancy_baby: `<g class="wig"><path class="f-wash" d="M46 34 L74 34 L78 46 L78 86 C78 90 76 92 72 92 L48 92 C44 92 42 90 42 86 L42 46Z"/><path class="f-paper" d="M50 22 L70 22 L70 34 L50 34Z"/><path class="f-sun" d="M56 22 C56 10 64 10 64 22"/><path d="M50 56 L60 56 M50 68 L60 68 M50 80 L60 80"/></g>`,
  disability: `<circle class="f-sun" cx="58" cy="18" r="8"/><path d="M56 30 L54 60 L82 60 L92 84"/><path d="M54 44 L76 44"/><g class="wheel" style="transform-origin:50px 72px"><circle class="f-wash" cx="50" cy="72" r="18"/><path d="M50 60 L50 84 M38 72 L62 72"/></g><path d="M86 84 L100 84"/>`,
  idea: `<path class="f-sun" d="M60 14 C78 14 88 28 86 42 C84 54 74 58 72 70 L48 70 C46 58 36 54 34 42 C32 28 42 14 60 14Z"/><path d="M48 78 L72 78 M50 86 L70 86 M60 4 L60 0 M22 22 L18 18 M98 22 L102 18"/>`,
};

/** One doodle in the mock's 120x100 frame. `sm` thickens the pen for small sizes. */
export function Doodle({ kind, className = "" }: { kind: string; className?: string }) {
  return (
    <svg
      className={`dd ${className}`.trim()}
      viewBox="0 0 120 100"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: DOODLES[kind] ?? "" }}
    />
  );
}

/** Raw markup, for inline use inside a larger static drawing. */
export const doodleMarkup = (kind: string) => DOODLES[kind] ?? "";
