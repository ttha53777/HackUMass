import { ExternalLink as ExternalIcon } from "lucide-react";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  children: ReactNode;
  /** "button" for the main call to action, "text" for inline links. */
  variant?: "button" | "outline" | "text";
  className?: string;
};

/**
 * A link to a provider's site. URLs only ever come from program records. It opens
 * in a new tab, so the person keeps their results; the icon and the hidden text
 * say so. In print, the address is written out.
 */
export function ExternalLink({ href, children, variant = "text", className }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        variant === "text"
          ? "inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-4 hover:text-foreground/80"
          : cn(
              buttonVariants({ variant: variant === "button" ? "default" : "outline" }),
              "h-11 gap-2 px-4 text-base print:h-auto print:whitespace-normal",
            ),
        className,
      )}
    >
      {children}
      <ExternalIcon aria-hidden className="size-4 shrink-0" />
      <span className="sr-only"> (opens in a new tab)</span>
      <span className="hidden break-all font-normal print:inline"> ({href})</span>
    </a>
  );
}
