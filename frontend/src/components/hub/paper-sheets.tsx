"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { DETAIL_LABEL, DETAIL_ORDER } from "@/components/documents/details-store";
import { ACCEPT, helperReads, MAX_BYTES, type DemoPaper, type Paper } from "@/components/documents/paper-store";
import { docLabel } from "@/components/od/doc-kinds";
import { usePlan } from "@/components/session/plan-state";
import { useToast } from "@/components/shell/toast";
import { answerFor, walletKinds, walletTexts } from "@/lib/derive";
import { readName } from "@/lib/device-state";
import { hubSteps, usedIn, type HubStep } from "@/lib/hub-derive";
import type { SessionSnapshot } from "@/lib/types";

import { DrawerHead, ReadingPaper, Stepper } from "./drawer";
import { useHub } from "./hub-state";
import { Arrow, Doodle, Tick } from "./icons";
import { usePapersHub, type ReadOutcome } from "./papers-context";
import { ReviewCard } from "./review-card";

const kindLabel = (s: SessionSnapshot, kind: string, plan: ReturnType<typeof usePlan>["plan"]) =>
  docLabel(kind, walletTexts(walletKinds(s, plan).find((d) => d.kind === kind) ?? { kind, uses: [] }));

/** An on/off switch in the design's style. */
export function Switch({ on, label, onChange, disabled, small }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean; small?: boolean }) {
  return (
    <button
      className={`sw${small ? " sm" : ""}${disabled ? " dis" : ""}`}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  );
}

/** "Now counts in N steps", with the first few named. */
function Reuse({ label, steps }: { label: string; steps: HubStep[] }) {
  return (
    <div className="reuse">
      {label} now counts in {steps.length} step{steps.length === 1 ? "" : "s"}
      {steps.length ? (
        <ul>
          {steps.slice(0, 3).map((st) => (
            <li key={st.id}>
              <Tick />
              {st.title}
            </li>
          ))}
          {steps.length > 3 ? <li>and {steps.length - 3} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** A saved paper, shown from this device: a PDF in a frame, an image as an image. */
export function PaperPreview({ paper, tall }: { paper: Paper; tall?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(paper.blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an object URL exists only after mount
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [paper.blob]);
  if (!url) return null;
  const h = tall ? 520 : 300;
  if (paper.type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- a local blob, not an optimizable asset
    return <img src={url} alt={paper.name} style={{ width: "100%", maxHeight: h, objectFit: "contain", borderRadius: 12, background: "#fff" }} />;
  }
  if (paper.type === "application/pdf") {
    // Hide the viewer's toolbar and thumbnails: just the page, fitted to the width.
    return <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={paper.name} style={{ width: "100%", height: h, border: 0, borderRadius: 12, background: "#fff" }} />;
  }
  return <p className="sp-n">{paper.name}</p>;
}

type Stage = "pick" | "reading" | "check" | "done";

/** Add a paper: pick a file (or a fictional sample), have it read, check what we read, done. */
export function UploadSheet({ s, kind: askedKind }: { s: SessionSnapshot; kind: string | null }) {
  const { closeSheet, openSheet } = useHub();
  const { plan } = usePlan();
  const papers = usePapersHub();
  const toast = useToast();
  const [kind, setKind] = useState<string | null>(askedKind);
  const [stage, setStage] = useState<Stage>("pick");
  const [samples, setSamples] = useState<DemoPaper[]>([]);
  const [outcome, setOutcome] = useState<(ReadOutcome & { readable: boolean }) | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const steps = useMemo(() => hubSteps(s, plan), [s, plan]);

  useEffect(() => {
    let live = true;
    void papers.demos(kind).then((list) => live && setSamples(list));
    return () => {
      live = false;
    };
  }, [kind, papers]);

  const kinds = walletKinds(s, plan);
  const label = kind ? kindLabel(s, kind, plan) : "a paper";

  const take = async (file: Blob, opts: { demo?: boolean; name?: string; kinds?: string[] } = {}) => {
    if (!kind) return;
    if (file.size > MAX_BYTES) return toast("That file is bigger than 10 MB. Try a smaller photo or PDF.");
    const paper = await papers.keep(file, kind, opts);
    if (!paper) return toast("We couldn't keep that file on this device.");
    if (!papers.canRead(paper, kind)) {
      setOutcome({ error: null, reviewId: null, identity: 0, otherPerson: null, readable: false });
      setStage("done");
      return;
    }
    setStage("reading");
    const result = await papers.read(paper, kind);
    setOutcome({ ...result, readable: true });
    if (result.error) toast(result.error);
    setStage(result.reviewId ? "check" : "done");
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void take(f);
  };

  const review = outcome?.reviewId ? s.pending_reviews.find((r) => r.document_id === outcome.reviewId) : undefined;
  const L = ["Pick", "Check", "Done"];

  if (!kind) {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={1} labels={L} />} title="Add a paper" onClose={closeSheet} />
        <div className="dbody">
          <p>Which one? Each paper counts in every step that asks for it.</p>
          <div className="samples">
            {kinds.map((d) => {
              const have = plan.docs.includes(d.kind);
              return (
                <button key={d.kind} className={`smp${have ? " have" : ""}`} type="button" onClick={() => setKind(d.kind)}>
                  <span>
                    {docLabel(d.kind, walletTexts(d))}
                    <small>{have ? "Ready" : `Asked for in ${d.uses.length} step${d.uses.length === 1 ? "" : "s"}`}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  if (stage === "reading") {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={2} labels={L} />} title="Reading it" onClose={closeSheet} />
        <div className="dbody">
          <ReadingPaper />
          <p className="mono">Sent once to be read, then deleted from our server.</p>
        </div>
      </>
    );
  }

  if (stage === "check" && review) {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={2} labels={L} />} title="Does this look right?" onClose={closeSheet} />
        <div className="dbody">
          <p>Here&apos;s what we read from {review.title}. Nothing is used until you say so.</p>
          <ReviewCard review={review} onDone={() => setStage("done")} />
        </div>
      </>
    );
  }

  if (stage === "done" || stage === "check") {
    return (
      <>
        <DrawerHead eyebrow={<Stepper at={3} labels={L} />} title="Added to your papers" onClose={closeSheet} />
        <div className="dbody">
          <Reuse label={label.charAt(0).toUpperCase() + label.slice(1)} steps={usedIn(kind, steps)} />
          {outcome && !outcome.readable ? <p>Kept on this device. We read PDFs of pay stubs, leases, bills, IDs and household lists; this one is kept as it is.</p> : null}
          {outcome?.identity ? <p>We also read your name and address from it. They stay on this device, and you confirm them on Papers before any form uses them.</p> : null}
          {outcome?.otherPerson ? <p>This paper is for {outcome.otherPerson}, not you, so we didn&apos;t keep its name or address.</p> : null}
          <div className="drow">
            <button className="btn" type="button" onClick={closeSheet}>
              Done <Arrow />
            </button>
            <button className="txt-btn" type="button" onClick={() => openSheet({ type: "upload", kind: null })}>
              Add another
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DrawerHead eyebrow={<Stepper at={1} labels={L} />} title={`Add ${label.charAt(0).toLowerCase()}${label.slice(1)}`} onClose={closeSheet} />
      <div className="dbody">
        <label
          className="drop"
          style={drag ? { borderColor: "var(--door)", color: "var(--door)" } : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <Doodle id="docs" />
          <b>Drop a file, or tap to choose</b>
          <span>A PDF or a photo, up to 10 MB. It stays on this device.</span>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void take(f);
              e.target.value = "";
            }}
          />
        </label>
        {samples.length ? (
          <>
            <p className="mono">Or use a sample paper (fictional)</p>
            <div className="samples">
              {samples.map((d) => (
                <button
                  key={d.file}
                  className="smp"
                  type="button"
                  onClick={async () => {
                    const blob = await papers.demoBlob(d);
                    if (blob) void take(blob, { demo: true, name: (blob as File).name, kinds: d.kinds.includes(kind) ? d.kinds : [kind] });
                  }}
                >
                  <span>
                    {d.title.replace(/\s*\(fictional\)\s*$/i, "")}
                    <small>Sample, for trying it out</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {!askedKind ? (
          <button className="txt-btn" type="button" style={{ justifySelf: "start" }} onClick={() => setKind(null)}>
            Pick a different paper
          </button>
        ) : null}
      </div>
    </>
  );
}

/** One kind of paper: the saved copy, what it counts in, and what to do with it. */
export function PaperSheet({ s, kind }: { s: SessionSnapshot; kind: string }) {
  const { closeSheet, openSheet, openSpot } = useHub();
  const { plan, toggleDoc } = usePlan();
  const papers = usePapersHub();
  const toast = useToast();
  const [reading, setReading] = useState(false);
  const steps = useMemo(() => hubSteps(s, plan), [s, plan]);
  const paper = papers.paperFor(kind);
  const label = kindLabel(s, kind, plan);
  const used = usedIn(kind, steps);

  const readIt = async () => {
    if (!paper) return;
    setReading(true);
    const r = await papers.read(paper, kind);
    setReading(false);
    if (r.error) return toast(r.error);
    if (r.reviewId) openSheet({ type: "review" });
    else toast("Read. Nothing new to check from this one.");
  };

  return (
    <>
      <DrawerHead eyebrow={paper ? "Saved paper" : "Marked as ready"} title={label} onClose={closeSheet} />
      <div className="dbody">
        {paper ? (
          <>
            <div className="pp">
              <div className="pph">
                <span>{paper.name}</span>
                <span>Added {new Date(paper.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
              <PaperPreview paper={paper} />
            </div>
            <p className="mono">On this device. Sent to be read only when you ask.</p>
            <div className="hrw">
              <div>
                <b>Form helper can read this</b>
                <small>
                  {!helperReads(paper, kind)
                    ? "Off. Details read from this paper won't be used to fill forms."
                    : papers.helper
                      ? "Used when the helper fills a form. You check every line."
                      : "Allowed. Used once you turn the form helper on from the Papers page."}
                </small>
              </div>
              <Switch on={helperReads(paper, kind)} label="Form helper can read this paper" onChange={(on) => void papers.setHelperRead(paper, kind, on)} />
            </div>
          </>
        ) : (
          <p>You said you have this. No copy is saved on this device, so bring the paper itself.</p>
        )}
        {used.length ? (
          <div className="sc">
            <h4>Used in</h4>
            <div className="unl">
              {used.slice(0, 6).map((st) => (
                <button key={st.id} type="button" onClick={() => openSpot(st.id)}>
                  <span className={`kmini ${st.kind}`}>{st.kind === "gov" ? "Government" : "Local"}</span>
                  {st.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="drow">
          {paper ? (
            <>
              <button className="btn" type="button" onClick={() => openSheet({ type: "counter", kinds: [kind] })}>
                Show at the counter <Arrow />
              </button>
              {papers.canRead(paper, kind) ? (
                <button className="txt-btn" type="button" disabled={reading} onClick={() => void readIt()}>
                  {reading ? "Reading…" : "Read it for me"}
                </button>
              ) : null}
              <button className="txt-btn" type="button" onClick={() => openSheet({ type: "upload", kind })}>
                Replace
              </button>
            </>
          ) : (
            <button className="btn" type="button" onClick={() => openSheet({ type: "upload", kind })}>
              Add a copy <Arrow />
            </button>
          )}
          <button
            className="txt-btn"
            type="button"
            style={{ color: "var(--alert)" }}
            onClick={async () => {
              if (paper) await papers.removeKind(kind);
              else toggleDoc(kind);
              closeSheet();
              toast(paper ? `${label} removed from this device.` : `${label}: marked as not ready.`);
            }}
          >
            {paper ? "Remove" : "Mark as not ready"}
          </button>
        </div>
      </div>
    </>
  );
}

/** Full screen, large type: the person's confirmed details and the papers for one visit. */
export function CounterSheet({ s, kinds }: { s: SessionSnapshot; kinds: string[] }) {
  const { closeSheet } = useHub();
  const { plan } = usePlan();
  const papers = usePapersHub();
  const confirmed = papers.details.filter((d) => d.confirmed);
  const fullName = confirmed.find((d) => d.key === "full_name")?.value ?? readName();
  const zip = answerFor(s, "zip")?.display_value ?? "";
  const rows = DETAIL_ORDER.filter((k) => k !== "full_name")
    .map((k) => confirmed.find((d) => d.key === k))
    .filter((d): d is NonNullable<typeof d> => !!d);
  return (
    <>
      <div className="dh">
        <div>
          <p className="mono">Show this at the counter</p>
        </div>
        <button className="xbtn" type="button" aria-label="Close" onClick={closeSheet}>
          ×
        </button>
      </div>
      <div className="ctr">
        <div className="ctr-h">
          <h3>{fullName || "Your papers"}</h3>
          <p className="mono" style={{ marginTop: 8 }}>
            {zip ? `${zip} · ` : ""}papers for this visit
          </p>
        </div>
        {rows.length ? (
          <section className="ctr-p">
            <h4>Your details</h4>
            {rows.map((d) => (
              <div key={d.key}>
                <span>{DETAIL_LABEL[d.key]}</span>
                <b>{d.value}</b>
              </div>
            ))}
          </section>
        ) : null}
        {kinds.length ? (
          kinds.map((k) => {
            const paper = papers.paperFor(k);
            return (
              <section className="ctr-p" key={k}>
                <h4>{kindLabel(s, k, plan)}</h4>
                {paper ? <PaperPreview paper={paper} tall /> : <p style={{ fontSize: "1.1rem" }}>Bring the paper itself.</p>}
              </section>
            );
          })
        ) : (
          <p>No saved papers to show yet.</p>
        )}
        <button className="btn wide" type="button" onClick={closeSheet}>
          Done <Arrow />
        </button>
      </div>
    </>
  );
}

/** Everything read from papers or the bank that still needs a yes. */
export function ReviewSheet({ s }: { s: SessionSnapshot }) {
  const { closeSheet } = useHub();
  const reviews = s.pending_reviews;
  return (
    <>
      <DrawerHead eyebrow="Check what we read" title={reviews.length ? "Does this look right?" : "All checked"} onClose={closeSheet} />
      <div className="dbody">
        {reviews.length ? (
          reviews.map((r) => (
            <div key={r.document_id} style={{ display: "grid", gap: 10 }}>
              <p>
                <b>{r.simulated ? `What ${r.title} suggests` : `From ${r.title}`}</b>
                {r.simulated ? <span className="src">Simulated</span> : null}
              </p>
              <ReviewCard review={r} />
            </div>
          ))
        ) : (
          <>
            <p>Nothing is waiting for a yes. Everything you confirmed is in your answers.</p>
            <div className="drow">
              <button className="btn" type="button" onClick={closeSheet}>
                Done <Arrow />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
