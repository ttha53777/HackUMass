import { vars } from "../css-vars";
import { EXTRA_BANK, EXTRA_FORM } from "./art";

/** Two optional extras, each with a one-shot demo that plays when it scrolls into view (.ex.in). */
export function Extras() {
  return (
    <section className="extras" id="extras" aria-labelledby="ex-h">
      <div className="wrap">
        <div className="sec-head">
          <h2 id="ex-h" className="rv">
            Two extras, <em>only if you want them.</em>
          </h2>
          <p className="rv" style={vars({ "--rd": "120ms" })}>
            Both stay off until you say yes. Skip them and your plan works just the same.
          </p>
        </div>
        <div className="ex-grid">
          <article className="ex rv">
            <div className="ex-demo ex-form" aria-hidden="true" dangerouslySetInnerHTML={{ __html: EXTRA_FORM }} />
            <div className="ex-copy">
              <p className="ex-tag mono">Optional</p>
              <h3>We can fill in the application.</h3>
              <p>Ask, and we&apos;ll type in what you&apos;ve already told us. You check it, make any choices, and press Send yourself.</p>
            </div>
          </article>
          <article className="ex rv" style={vars({ "--rd": "120ms" })}>
            <div className="ex-demo ex-bank" aria-hidden="true" dangerouslySetInnerHTML={{ __html: EXTRA_BANK }} />
            <div className="ex-copy">
              <p className="ex-tag mono">Optional</p>
              <h3>Connect your bank for a clearer answer.</h3>
              <p>
                We read your monthly income and bills, so programs marked “need more info” can tell you more. You confirm every
                number first, and you can disconnect any time.
              </p>
              <small>Read-only. Nothing from your bank is used until you say it&apos;s right. For now this uses demo accounts only.</small>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
