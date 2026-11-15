"use client";

import { useRef, useState } from "react";

import { useApp } from "@/components/session/session-provider";
import { addPdfForm } from "@/lib/filler";

import { useHub } from "@/components/hub/hub-state";
import { Arrow, Doodle } from "@/components/hub/icons";
import { Switch } from "@/components/hub/paper-sheets";

import { ConsentDialog } from "./consent-dialog";
import { useFiller } from "./filler-context";

/** "Read my papers automatically": off by default; turning it on shows the notice first. */
export function AutoReadSetting() {
  const filler = useFiller();
  const { openSheet } = useHub();
  const [asking, setAsking] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const sessionId = useApp().snapshot?.session_id ?? null;
  const on = !!filler.state?.auto_read.on;
  const papers = filler.state?.papers ?? [];
  const reading = papers.filter((p) => p.status === "queued" || p.status === "reading").length;
  const found = filler.state?.details.length ?? 0;

  return (
    <div className={on ? "helper on" : "helper"}>
      <div className="hh">
        <span className="hi">
          <Doodle id="bot" />
        </span>
        <div>
          <h3>Read my papers automatically</h3>
          <p>
            {on ? (
              <>
                <b>On.</b> Each paper you add is read right away, so forms are ready to fill.
                {reading ? ` Reading ${reading} now.` : found ? ` ${found} details found so far.` : ""}
              </>
            ) : (
              <>
                <b>Off.</b> Nothing is read unless you switch on a single paper below. Turning this on reads the papers you already saved too.
              </>
            )}
          </p>
        </div>
        <Switch
          on={on}
          label="Read my papers automatically"
          onChange={(next) => (next ? setAsking(true) : void filler.setAutoRead(false, []))}
        />
      </div>
      <div className="nevers">
        <span>
          <Doodle id="lock" />
          Never reads an ID number or Social Security number
        </span>
        <span>Kept for this visit only</span>
      </div>
      <div className="fl-tries">
        <button className="txt-btn fl-try" type="button" onClick={() => openSheet({ type: "filler" })}>
          Watch it fill a practice form <Arrow />
        </button>
        <button className="txt-btn fl-try" type="button" onClick={() => pdfInput.current?.click()}>
          Fill a PDF form <Arrow />
        </button>
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || !sessionId) return;
            setPdfError(null);
            try {
              const form = await addPdfForm(sessionId, file);
              openSheet({ type: "filler", pdfFormId: form.pdf_form_id });
            } catch (err) {
              setPdfError(err instanceof Error ? err.message : "We couldn't open that PDF.");
            }
          }}
        />
      </div>
      {pdfError ? <p className="fl-error" role="alert">{pdfError}</p> : null}
      {filler.error ? <p className="fl-error" role="alert">{filler.error}</p> : null}
      <ConsentDialog
        open={asking}
        title="Read your papers automatically?"
        lead="Your saved papers, and each one you add, will be read straight away for the details below, so the Filler is ready when you start a form."
        confirmLabel="Read my papers"
        onCancel={() => setAsking(false)}
        onConfirm={(scopes) => {
          setAsking(false);
          void filler.setAutoRead(true, scopes);
        }}
      />
    </div>
  );
}
