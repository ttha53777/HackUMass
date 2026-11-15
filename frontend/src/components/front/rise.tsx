import { Fragment, type CSSProperties } from "react";

/**
 * A sentence whose words rise in one by one. |Pipes| mark the italic phrase,
 * which gets a hand-drawn brass underline. `base` and `step` are milliseconds.
 */
export function Rise({ text, base = 0, step = 55 }: { text: string; base?: number; step?: number }) {
  let i = 0;
  const words = (chunk: string) =>
    chunk
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w, n, all) => (
        <Fragment key={n}>
          <span className="w">
            <span style={{ "--d": `${base + i++ * step}ms` } as CSSProperties}>{w}</span>
          </span>
          {n < all.length - 1 ? " " : null}
        </Fragment>
      ));

  const chunks = text.split(/(\|[^|]+\|)/).filter(Boolean);
  return (
    <>
      {chunks.map((chunk, n) => {
        const italic = chunk.startsWith("|");
        const space = n < chunks.length - 1 ? " " : null;
        if (!italic) {
          return (
            <Fragment key={n}>
              {words(chunk)}
              {chunk.trim() && space}
            </Fragment>
          );
        }
        return (
          <Fragment key={n}>
            <em>
              {words(chunk.replace(/\|/g, ""))}
              <svg className="dd ul" viewBox="0 0 240 24" preserveAspectRatio="none" aria-hidden="true">
                <path pathLength={1} d="M4 15 C60 7 150 6 236 10 C170 13 90 16 26 21" />
              </svg>
            </em>
            {space}
          </Fragment>
        );
      })}
    </>
  );
}
