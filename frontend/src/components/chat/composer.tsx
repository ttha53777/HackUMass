"use client";

import { motion } from "motion/react";
import { ArrowUp } from "lucide-react";
import { forwardRef, useState } from "react";

import { cn } from "@/lib/utils";

/** The one text box at the bottom. Works for every question; Enter sends. */
export const Composer = forwardRef<
  HTMLInputElement,
  {
    placeholder: string;
    disabled: boolean;
    numeric?: boolean;
    hint: string | null;
    /** Text typed by "Try a sample", shown as if the person typed it. */
    ghost?: string;
    onSend: (text: string) => void;
  }
>(function Composer({ placeholder, disabled, numeric, hint, ghost, onSend }, ref) {
  const [text, setText] = useState("");
  const value = ghost ?? text;
  const send = () => {
    if (disabled || !value.trim()) return;
    onSend(value);
    setText("");
  };
  return (
    <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-paper via-paper to-transparent px-4 pb-4 pt-3">
      {hint ? (
        <motion.p
          key={hint}
          role="status"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 pl-1 text-[13px] font-semibold text-amber-ink"
        >
          {hint}
        </motion.p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className={cn(
          "flex items-center gap-2 rounded-[20px] border border-line bg-surface py-1.5 pl-5 pr-1.5 shadow-card transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_4px_var(--brand-soft)]",
          disabled && "opacity-70",
        )}
      >
        <label htmlFor="chat-box" className="sr-only">
          Your reply
        </label>
        <input
          id="chat-box"
          ref={ref}
          value={value}
          onChange={(e) => setText(e.target.value)}
          readOnly={ghost !== undefined}
          disabled={disabled && ghost === undefined}
          placeholder={placeholder}
          inputMode={numeric ? "numeric" : "text"}
          autoComplete={numeric ? "postal-code" : "off"}
          maxLength={500}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[16px] outline-none placeholder:text-faint"
        />
        <motion.button
          type="submit"
          aria-label="Send"
          disabled={disabled || !value.trim()}
          whileTap={{ scale: 0.92 }}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-on-brand transition-opacity hover:bg-brand-hover disabled:bg-line disabled:text-faint"
        >
          <ArrowUp aria-hidden className="size-5" />
        </motion.button>
      </form>
    </div>
  );
});
