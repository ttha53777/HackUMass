"use client";

import { FileText } from "lucide-react";
import { useId, useRef, useState, type SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = ".pdf,.txt,application/pdf,text/plain";

type Props = {
  disabled: boolean;
  onUpload: (file: File) => Promise<string | null>;
};

/**
 * Optional: read household size and income from a pay stub or benefit letter.
 * Nothing is uploaded until a file is chosen and the consent box is ticked.
 */
export function DocumentPanel({ disabled, onUpload }: Props) {
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function choose(next: File | null) {
    setDone(null);
    setError(null);
    if (next && next.size > MAX_BYTES) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("That file is larger than 2 MB. Try a smaller file.");
      return;
    }
    if (next && !/\.(pdf|txt)$/i.test(next.name)) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("We can only read PDF or plain text (.txt) files.");
      return;
    }
    setFile(next);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (disabled || uploading) return;
    if (!file) return setError("Choose a file first.");
    if (!consent) return setError("Tick the box to let us read this document.");
    setError(null);
    setUploading(true);
    const problem = await onUpload(file);
    setUploading(false);
    if (problem) {
      setError(problem);
      return;
    }
    setDone(`We read ${file.name}. If we found a number, we’ll ask you to check it above.`);
    setFile(null);
    setConsent(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <details className="rounded-xl border border-border print:hidden">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-semibold outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <FileText aria-hidden className="size-5" />
        Add a document (optional)
      </summary>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 border-t border-border p-4">
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>
            A pay stub or benefit letter can fill in your household income or size. We look only for
            those two numbers, and we ask you to check them before using them.
          </p>
          <p>
            PDF or plain text, up to 2 MB. The file is deleted as soon as it’s read, and we never
            keep its text. Don’t upload anything with a Social Security number.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-file`} className="font-medium">
            Choose a file
          </label>
          <input
            ref={inputRef}
            id={`${ids}-file`}
            type="file"
            accept={ACCEPT}
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
            className="block w-full text-base file:mr-3 file:h-11 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-background file:px-4 file:text-base file:font-medium hover:file:bg-muted"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => {
              setConsent(event.target.checked);
              setError(null);
            }}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span>Read this document to find my household income or size.</span>
        </label>

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <p role="status" aria-live="polite" className="text-sm">
          {uploading ? "Reading your document…" : done}
        </p>

        <div>
          <Button
            type="submit"
            disabled={disabled || uploading}
            focusableWhenDisabled
            className="h-11 px-5 text-base"
          >
            {uploading ? "Reading…" : "Read this document"}
          </Button>
        </div>
      </form>
    </details>
  );
}
