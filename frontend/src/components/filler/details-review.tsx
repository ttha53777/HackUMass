"use client";

import { useState } from "react";

import { Tick } from "@/components/hub/icons";
import type { FillerDetail } from "@/lib/filler";

import { useFiller } from "./filler-context";

function Row({ d }: { d: FillerDetail }) {
  const filler = useFiller();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.value);
  const [problem, setProblem] = useState<string | null>(null);
  const where = d.source === "typed" ? "typed by you" : [d.source_label && `from ${d.source_label}`, d.page && `page ${d.page}`].filter(Boolean).join(", ");

  const save = async () => {
    const error = await filler.editDetail(d.key, draft);
    setProblem(error);
    if (!error) setEditing(false);
  };

  return (
    <div className="logrow fl-row">
      <div>
        <small className="fl-label">{d.label}</small>
        {editing ? (
          <form
            className="fl-edit"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input aria-label={d.label} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <button className="btn sm" type="submit">
              Save
            </button>
            <button className="txt-btn" type="button" onClick={() => (setEditing(false), setDraft(d.value), setProblem(null))}>
              Cancel
            </button>
          </form>
        ) : (
          <b>{d.value}</b>
        )}
        <small>
          {where}
          {d.snippet && d.source !== "typed" ? <q className="fl-snippet">{d.snippet}</q> : null}
        </small>
        {problem ? <small className="fl-error" role="alert">{problem}</small> : null}
      </div>
      <span className="fl-row-actions">
        {d.status === "confirmed" ? (
          <span className="pip ok">
            <Tick className="mi" />
            Confirmed
          </span>
        ) : (
          <span className="pip">To check</span>
        )}
        {!editing ? (
          <button className="txt-btn" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : null}
        <button className="txt-btn" type="button" onClick={() => void filler.forget(d.key)}>
          Remove
        </button>
      </span>
    </div>
  );
}

/** The review card: details found on the person's papers, confirmed with one tap. */
export function DetailsReview() {
  const filler = useFiller();
  const details = filler.state?.details ?? [];
  const unconfirmed = filler.state?.unconfirmed ?? 0;
  if (!details.length) return null;

  return (
    <section className="pv-s">
      <div className="panel2">
        <div className="fl-head">
          <div>
            <h3>Details found on your papers</h3>
            <p className="sub">
              {unconfirmed
                ? `${unconfirmed} to check. Nothing is typed into a form until you confirm it.`
                : "All confirmed. The Filler can use these for your forms during this visit."}
            </p>
          </div>
          {unconfirmed ? (
            <button className="btn sm" type="button" onClick={() => void filler.confirmAll()}>
              <Tick className="mi" /> All correct
            </button>
          ) : null}
        </div>
        {details.map((d) => (
          <Row key={d.key} d={d} />
        ))}
      </div>
    </section>
  );
}
