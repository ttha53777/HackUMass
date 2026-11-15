// The hub's hand-drawn icons (symbols in hub-defs.tsx).

/** A doodle icon: `id` is the symbol name without "i-". */
export function Doodle({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ? `dd ${className}` : "dd"} viewBox="0 0 48 48" aria-hidden="true">
      <use href={`#i-${id}`} />
    </svg>
  );
}

/** A small stroked icon for pips and buttons. */
export function Mini({ id }: { id: string }) {
  return (
    <svg className="mi" viewBox="0 0 48 48" aria-hidden="true">
      <use href={`#i-${id}`} />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg viewBox="0 0 28 20" aria-hidden="true">
      <use href="#i-arrow" />
    </svg>
  );
}

export function Tick({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <use href="#i-check" />
    </svg>
  );
}

/** The hand-drawn underline under the headline's emphasis. */
export function Underline() {
  return (
    <svg className="dd ul" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength={1} d="M1 5 C20 2 45 6 70 3 C82 2 92 4 99 3" />
    </svg>
  );
}
