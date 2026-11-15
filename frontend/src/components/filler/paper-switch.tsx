"use client";

import { useState } from "react";

import type { Paper } from "@/components/documents/paper-store";
import { Switch } from "@/components/hub/paper-sheets";

import { ConsentDialog } from "./consent-dialog";
import { useFiller } from "./filler-context";

const STATUS: Record<string, string> = {
  queued: "Waiting to read…",
  reading: "Reading…",
  failed: "Couldn't read",
};

/** What the Filler is doing with this paper: reading, found N, or couldn't read (with Try again). */
export function FillerPaperStatus({ paper }: { paper: Paper }) {
  const filler = useFiller();
  const mine = filler.paperFor(paper);
  if (!mine || !mine.can_read) return null;
  if (mine.status === "failed") {
    return (
      <p className="used fl-status" aria-live="polite">
        {mine.message ?? "Couldn't read this paper."}{" "}
        <button className="txt-btn" type="button" onClick={() => void filler.setPaperRead(paper, true, mine.scopes)}>
          Try again
        </button>
      </p>
    );
  }
  const note =
    STATUS[mine.status] ?? (mine.status === "done" ? `${mine.found} detail${mine.found === 1 ? "" : "s"} found` : null);
  return note ? <p className="used fl-status" aria-live="polite">{note}</p> : null;
}

/** A paper card's "Filler reads" switch. */
export function FillerPaperSwitch({ paper, label }: { paper: Paper; label: string }) {
  const filler = useFiller();
  const [asking, setAsking] = useState(false);
  const mine = filler.paperFor(paper);
  if (!mine) {
    return <span className="fl-note">{paper.type.startsWith("text/") ? "Filler reads PDFs and photos" : "Sending…"}</span>;
  }
  return (
    <>
      <label>
      <Switch
        small
        on={mine.can_read}
        label={`Filler can read ${label}`}
        onChange={(on) => (on ? setAsking(true) : void filler.setPaperRead(paper, false))}
      />
      Filler reads
      </label>
      {/* Outside the label, so clicks in the dialog never reach the switch. */}
      <ConsentDialog
        open={asking}
        title={`Let the Filler read your ${label.toLowerCase()}?`}
        lead="It reads this paper once for the details below. You check them before any form is filled."
        confirmLabel="Read this paper"
        onCancel={() => setAsking(false)}
        onConfirm={(scopes) => {
          setAsking(false);
          void filler.setPaperRead(paper, true, scopes);
        }}
      />
    </>
  );
}
