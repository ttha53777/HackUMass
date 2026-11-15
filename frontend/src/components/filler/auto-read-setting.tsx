"use client";

import { useState } from "react";

import { Doodle } from "@/components/hub/icons";
import { Switch } from "@/components/hub/paper-sheets";

import { ConsentDialog } from "./consent-dialog";
import { useFiller } from "./filler-context";

/** "Read my papers automatically": off by default; turning it on shows the notice first. */
export function AutoReadSetting() {
  const filler = useFiller();
  const [asking, setAsking] = useState(false);
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
                <b>Off.</b> Nothing is read unless you switch on a single paper below.
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
      {filler.error ? <p className="fl-error" role="alert">{filler.error}</p> : null}
      <ConsentDialog
        open={asking}
        title="Read your papers automatically?"
        lead="Each paper you add will be read straight away for the details below, so the Filler is ready when you start a form."
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
