import { Check, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** A big selectable answer. aria-pressed carries the state; the check mark is only a cue. */
export function OptionButton({
  icon: Icon,
  label,
  pressed,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex min-h-[58px] items-center gap-3 rounded-2xl border bg-surface px-[15px] py-3.5 text-left font-bold transition-all hover:-translate-y-px hover:border-brand-line",
        pressed ? "border-brand bg-brand-soft shadow-[inset_0_0_0_1px_var(--brand)]" : "border-line",
      )}
    >
      <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-surface-2 text-brand-text">
        <Icon aria-hidden className="size-[18px]" />
      </span>
      <span>{label}</span>
      <span
        aria-hidden
        className={cn(
          "ml-auto grid size-[21px] shrink-0 place-items-center rounded-[7px] border-[1.5px]",
          pressed ? "border-brand bg-brand text-on-brand" : "border-line text-transparent",
        )}
      >
        <Check className="size-[13px]" />
      </span>
    </button>
  );
}
