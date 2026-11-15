import Link from "next/link";

/**
 * The OpenDoor mark: a door that draws itself in and opens, and opens wider on hover.
 * `conversation` uses the variant whose door opens with progress (--p on an ancestor).
 */
export function Mark({ href = "/", label = "OpenDoor home", conversation = false }: { href?: string; label?: string; conversation?: boolean }) {
  return (
    <Link className="mark" href={href} aria-label={label}>
      <svg className={conversation ? "mk c-mk" : "mk"} viewBox="0 0 22 28" aria-hidden="true">
        <path className="mk-light" d="M4 27 V4.4 C9 3.8 13 3.8 18 4.3 V27 Z" />
        <path className="mk-frame" pathLength={1} d="M2 27 V2.5 C8 1.6 14 1.6 20 2.4 V27" />
        <path className="mk-leaf" d="M5 27 V5 L15 7 V25.5 Z" />
        <circle className="mk-knob" cx="12.6" cy="16.5" r="1.1" />
      </svg>
      <span className="mk-word">
        <span>OpenDoor</span>
      </span>
    </Link>
  );
}
