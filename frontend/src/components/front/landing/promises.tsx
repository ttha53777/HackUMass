import { PROMISE_ART } from "./art";

const PROMISES = [
  { b: "No account, nothing to remember.", p: "No sign-up, no password. Close the page and your answers go with it." },
  { b: "We never ask for your Social Security number.", p: "A ZIP code and a few rough answers are enough to point you the right way." },
  { b: "Straight about what's possible.", p: "We'll tell you a program might fit. Only the program itself can say yes, so we'll tell you how to ask." },
  {
    b: "Every listing is checked by a person.",
    p: "Programs come from a list our team checked by hand, each with a link to its source. Anything found on the open web is marked unchecked.",
  },
];

export function Promises() {
  return (
    <section className="wrap prom" id="promises" aria-labelledby="prom-h">
      <h2 id="prom-h" className="rv">
        A few promises, in <em>plain words.</em>
      </h2>
      <ul>
        {PROMISES.map((x, i) => (
          <li key={x.b} className="rv">
            <svg className="dd" viewBox="0 0 120 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PROMISE_ART[i] }} />
            <div>
              <b>{x.b}</b>
              <p>{x.p}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
