import type { CSSProperties } from "react";

/** Inline CSS custom properties (`--i`, `--rd`, ...), typed for React's style prop. */
export const vars = (v: Record<`--${string}`, string | number>) => v as CSSProperties;
