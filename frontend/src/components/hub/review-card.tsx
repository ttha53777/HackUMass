"use client";

import { useState } from "react";

import { useApp } from "@/components/session/session-provider";
import { useToast } from "@/components/shell/toast";
import type { PendingReview, ReviewRow } from "@/lib/types";

import { Arrow, Tick } from "./icons";

const editable = (row: ReviewRow) => typeof row.value === "number";

/**
 * "Does this look right?" for one paper the Document Agent read, or the simulated bank profile.
 * Nothing on it is used until the person confirms. Ticked rows are confirmed, a typed
 * correction becomes their own answer, unticked rows are dropped. A row that disagrees with an
 * answer they gave starts unticked: ticking it replaces that answer.
 */
export function ReviewCard({ review, onDone }: { review: PendingReview; onDone?: (used: number) => void }) {
  const { submitReview, whenIdle, working } = useApp();
  const toast = useToast();
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(review.rows.filter((r) => !r.in_conflict).map((r) => r.field)));
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const toggle = (field: string) =>
    setTicked((cur) => {
      const next = new Set(cur);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });

  const send = async (useNone = false) => {
    const parsed: Record<string, number> = {};
    if (!useNone) {
      for (const [field, text] of Object.entries(edits)) {
        if (!ticked.has(field)) continue;
        const n = Number(text.replace(/[$,\s]/g, ""));
        if (text.trim() === "" || !Number.isFinite(n) || n < 0) return toast("Enter a number, or untick that row.");
        parsed[field] = n;
      }
    }
    const accept = useNone ? [] : [...ticked].filter((f) => !(f in parsed));
    setSending(true);
    try {
      await whenIdle();
      const error = await submitReview({ document_id: review.document_id, accept, edits: parsed });
      await whenIdle();
      const used = accept.length + Object.keys(parsed).length;
      toast(error ?? (used ? "Thanks. We'll use what you confirmed." : `Okay, we won't use anything from ${review.title}.`));
      if (!error) onDone?.(used);
    } finally {
      setSending(false);
    }
  };

  const busy = sending || working;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="found" role="group" aria-label={review.simulated ? `What ${review.title} suggests` : `What we read from ${review.title}`}>
        {review.rows.map((row) => {
          const on = ticked.has(row.field);
          return (
            <div key={row.field} style={{ alignItems: "center" }}>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  className="qchk"
                  type="button"
                  aria-pressed={on}
                  aria-label={`Use ${row.label}`}
                  onClick={() => toggle(row.field)}
                  style={{ padding: 0, boxShadow: "none", background: "transparent" }}
                >
                  <span className="sq">
                    <Tick />
                  </span>
                </button>
                <span>
                  {row.label}
                  {row.in_conflict ? (
                    <small style={{ display: "block", color: "var(--alert)", fontWeight: 700, fontSize: ".78rem" }}>Differs from your answer</small>
                  ) : null}
                </span>
              </span>
              {editing === row.field ? (
                <input
                  className="qtxt"
                  style={{ minHeight: 0, width: 130, padding: ".4em .6em" }}
                  inputMode="decimal"
                  aria-label={`Correct ${row.label}`}
                  value={edits[row.field] ?? String(row.value ?? "")}
                  onChange={(e) => setEdits({ ...edits, [row.field]: e.target.value })}
                />
              ) : (
                <b className={row.in_conflict ? "hl" : undefined}>
                  {row.field in edits ? edits[row.field] : row.display}
                  {editable(row) ? (
                    <>
                      {" "}
                      <button className="txt-btn" type="button" style={{ fontSize: ".8rem" }} onClick={() => setEditing(row.field)}>
                        fix
                      </button>
                    </>
                  ) : null}
                </b>
              )}
            </div>
          );
        })}
      </div>
      {review.notes.map((n) => (
        <p key={n} className="sp-n">
          {n}
        </p>
      ))}
      <div className="drow">
        <button className={`btn${busy ? " dis" : ""}`} type="button" data-tour="looks-right" disabled={busy} onClick={() => void send()}>
          {ticked.size ? "Looks right" : "Use none of it"} <Arrow />
        </button>
        {ticked.size ? (
          <button className="txt-btn" type="button" disabled={busy} onClick={() => void send(true)}>
            Not right, use none of it
          </button>
        ) : null}
      </div>
    </div>
  );
}
