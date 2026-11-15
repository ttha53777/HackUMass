/**
 * Shared SVG filters and icons for the front pages, rendered once per page.
 * #pen gives every doodle the same hand-drawn wobble; #boil's seed is cycled by
 * the landing hero to keep the still drawing alive. Icons are used as <use href="#i-…">.
 */
export function FrontDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="pen" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="0.032" numOctaves={2} seed={4} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={2.6} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="boil" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence id="boilT" type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={1} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={2.8} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <symbol id="i-door" viewBox="0 0 22 28">
          <path d="M2 27 V2.5 C8 1.6 14 1.6 20 2.4 V27" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          <path d="M5 27 V5 L15 7 V25.5 Z" fill="currentColor" />
          <circle cx="12.6" cy="16.5" r="1.1" fill="var(--paper)" />
        </symbol>
        <symbol id="i-arrow" viewBox="0 0 28 20">
          <path
            d="M2 10.5 C9 9.5 17 10.2 25 10 M18 3 C20 6 22 8.4 25.5 10 C22 11.6 20 14 18.5 17"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="i-check" viewBox="0 0 16 16">
          <path pathLength={1} d="M2.5 8.5 L6.3 12 L13.5 3.8" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-star" viewBox="0 0 26 26">
          <path
            d="M13 2 C13.5 9 14 11 24 13 C14 14.5 13.6 17 13 24 C12.4 17 11.6 14.5 2 13 C11.6 11.5 12.4 9 13 2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="i-restart" viewBox="0 0 20 20">
          <path
            d="M4.5 7.5 C6 4.6 9 3.2 12 3.9 C15.4 4.7 17.4 8 16.7 11.4 C16 14.8 12.7 17 9.3 16.4 C6.6 15.9 4.6 13.8 4.2 11.2 M4.4 3.6 L4.5 7.6 L8.4 7.3"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
        <symbol id="i-why" viewBox="0 0 20 20">
          <path
            d="M10 2.5 C14.5 2.3 17.6 5.6 17.5 10 C17.4 14.3 14.2 17.6 9.8 17.5 C5.4 17.4 2.4 14.2 2.5 9.9 C2.6 5.8 5.6 2.7 10 2.5Z M10 9 V14 M10 6 V6.4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </symbol>
      </defs>
    </svg>
  );
}
