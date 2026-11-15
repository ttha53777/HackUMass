import { STORY_STAGES } from "./art";

const BEATS = [
  {
    k: "First",
    h: "You tell us what's going on, in your own words.",
    p: "Tap what fits or type a sentence. We ask one thing at a time, and you can skip anything you'd rather not answer.",
  },
  {
    k: "Then",
    h: "We look at what's actually near you.",
    p: "Your ZIP code narrows a hand-checked list of food, heat, housing and health programs to the ones that serve your town.",
  },
  {
    k: "Finally",
    h: "You leave with a plan you can start today.",
    p: "What to do first, who to call, what to say, and which papers to bring. Every program links to its source.",
  },
];

/** How it works: a pinned section; scroll steps through three beats while each drawing inks in. */
export function Story() {
  return (
    <section className="story" id="how" aria-label="How it works">
      <div className="wrap story-pin">
        <div className="story-copy">
          <p className="mono">How it works</p>
          <div className="beats">
            {BEATS.map((b, i) => (
              <article key={b.k} className={i === 0 ? "beat on" : "beat"} data-b={i}>
                <span className="k">{b.k}</span>
                <h3>{b.h}</h3>
                <p>{b.p}</p>
              </article>
            ))}
          </div>
          <div className="beat-rail" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="stage" aria-hidden="true" dangerouslySetInnerHTML={{ __html: STORY_STAGES }} />
      </div>
    </section>
  );
}
