"use client";

import { useId, useState, type FormEvent, type ReactNode, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AnswerIn, Question } from "@/lib/types";

const OTHER = "other";

type Period = "week" | "month" | "year";

type Props = {
  question: Question;
  /** "edit" re-opens an earlier answer; it adds Cancel and shows the current value. */
  mode: "pending" | "edit";
  currentValue?: string;
  /**
   * An answer is being processed. Controls stay focusable (so keyboard focus is
   * never lost) but ignore input: they are marked aria-disabled or read-only.
   */
  disabled: boolean;
  /** Server-side problem with the last submission. */
  error: string | null;
  headingRef?: Ref<HTMLHeadingElement>;
  onSubmit: (answer: AnswerIn) => void;
  onCancelEdit?: () => void;
};

// Large enough to tap comfortably on a phone.
const controlClass = "h-12 text-base md:text-base";
const optionClass =
  "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-4 py-2 text-left text-base transition-colors hover:bg-muted";

/**
 * One guided question with the control that fits its type. Give it
 * `key={question.id}` so local input state resets between questions.
 */
export function QuestionCard({
  question,
  mode,
  currentValue,
  disabled,
  error,
  headingRef,
  onSubmit,
  onCancelEdit,
}: Props) {
  const ids = useId();
  const headingId = `${ids}-prompt`;
  const reasonId = `${ids}-reason`;
  const errorId = `${ids}-error`;

  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [value, setValue] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [localError, setLocalError] = useState<string | null>(null);

  const shownError = localError ?? error;
  const describedBy =
    [question.reason ? reasonId : null, shownError ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  const options = question.allow_other
    ? [...question.options, { id: OTHER, label: "Other" }]
    : question.options;
  const otherChosen = selected.includes(OTHER);
  const isSingle = question.type === "single_select";
  const isChoice = isSingle || question.type === "multi_select";
  // A single choice submits on click, so Continue is only needed for "Other".
  const needsContinue = !isSingle || otherChosen;

  function send(answer: Omit<AnswerIn, "question_id">) {
    setLocalError(null);
    onSubmit({ question_id: question.id, ...answer });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;

    if (isChoice) {
      if (selected.length === 0) {
        setLocalError(isSingle ? "Choose one option." : "Choose at least one option.");
        return;
      }
      if (otherChosen && !otherText.trim()) {
        setLocalError("Tell us a little more about “Other”.");
        return;
      }
      send({ selected_option_ids: selected, text: otherChosen ? otherText.trim() : null });
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      setLocalError(
        question.skippable ? "Enter an answer, or skip this question." : "Enter an answer.",
      );
      return;
    }
    if (question.type === "text") send({ text: trimmed });
    else if (question.type === "currency") send({ value: trimmed, period });
    else send({ value: trimmed });
  }

  function chooseSingle(optionId: string) {
    if (disabled) return;
    setLocalError(null);
    if (optionId === OTHER) {
      setSelected([OTHER]);
      return;
    }
    send({ selected_option_ids: [optionId] });
  }

  function toggleMulti(optionId: string, checked: boolean) {
    if (disabled) return;
    setLocalError(null);
    setSelected((current) =>
      checked ? [...current, optionId] : current.filter((id) => id !== optionId),
    );
  }

  let control: ReactNode;
  if (isSingle) {
    control = (
      <div role="group" aria-labelledby={headingId} aria-describedby={describedBy} className="grid gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-disabled={disabled || undefined}
            aria-pressed={option.id === OTHER ? otherChosen : undefined}
            onClick={() => chooseSingle(option.id)}
            className={cn(
              optionClass,
              "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
              option.id === OTHER && otherChosen && "border-primary bg-primary/5",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  } else if (question.type === "multi_select") {
    control = (
      <fieldset aria-labelledby={headingId} aria-describedby={describedBy} aria-disabled={disabled || undefined} className="grid gap-2 aria-disabled:opacity-50">
        {options.map((option) => (
          <label
            key={option.id}
            className={cn(
              optionClass,
              "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
            )}
          >
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-primary outline-none"
              checked={selected.includes(option.id)}
              onChange={(event) => toggleMulti(option.id, event.target.checked)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    );
  } else if (question.type === "text") {
    control = (
      <textarea
        aria-labelledby={headingId}
        aria-describedby={describedBy}
        aria-invalid={shownError ? true : undefined}
        readOnly={disabled}
        maxLength={500}
        rows={3}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 read-only:opacity-60 aria-invalid:border-destructive"
      />
    );
  } else {
    const isCurrency = question.type === "currency";
    const isZip = question.type === "zip";
    const field = (
      <Input
        aria-labelledby={headingId}
        aria-describedby={describedBy}
        aria-invalid={shownError ? true : undefined}
        readOnly={disabled}
        type="text"
        inputMode={isCurrency ? "decimal" : "numeric"}
        autoComplete={isZip ? "postal-code" : "off"}
        maxLength={isZip ? 5 : 12}
        placeholder={isZip ? "5-digit ZIP code" : undefined}
        value={value}
        onChange={(event) => {
          setLocalError(null);
          setValue(event.target.value);
        }}
        className={cn(controlClass, "read-only:opacity-60", isCurrency && "pl-7")}
      />
    );
    control = isCurrency ? (
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
            $
          </span>
          {field}
        </div>
        <select
          aria-label="How often you receive this amount"
          aria-disabled={disabled || undefined}
          value={period}
          onChange={(event) => !disabled && setPeriod(event.target.value as Period)}
          className="h-12 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:opacity-50"
        >
          <option value="week">per week</option>
          <option value="month">per month</option>
          <option value="year">per year</option>
        </select>
      </div>
    ) : (
      field
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight outline-none sm:text-2xl"
        >
          {question.prompt}
        </h2>
        {question.reason && (
          <p id={reasonId} className="text-muted-foreground">
            {question.reason}
          </p>
        )}
        {mode === "edit" && currentValue && (
          <p className="text-sm text-muted-foreground">Your current answer: {currentValue}</p>
        )}
      </div>

      {control}

      {isChoice && otherChosen && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-other`} className="text-sm font-medium">
            Tell us a little more
          </label>
          <Input
            id={`${ids}-other`}
            readOnly={disabled}
            maxLength={500}
            value={otherText}
            onChange={(event) => {
              setLocalError(null);
              setOtherText(event.target.value);
            }}
            className={controlClass}
          />
        </div>
      )}

      {shownError && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {shownError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {needsContinue && (
          <Button type="submit" disabled={disabled} focusableWhenDisabled className="h-11 px-5 text-base">
            {mode === "edit" ? "Save" : "Continue"}
          </Button>
        )}
        {question.skippable && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            focusableWhenDisabled
            onClick={() => send({ skipped: true })}
            className="h-11 px-4 text-base"
          >
            Skip / I’m not sure
          </Button>
        )}
        {mode === "edit" && onCancelEdit && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            focusableWhenDisabled
            onClick={onCancelEdit}
            className="h-11 px-4 text-base"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
