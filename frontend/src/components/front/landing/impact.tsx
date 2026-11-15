import { vars } from "../css-vars";
import { PROGRAM_COUNT } from "./program-count";

/** A pen circle drawn around each number as it arrives. */
function Circle({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength={1} d={d} />
    </svg>
  );
}

/** Why it matters: three numbers, each circled in pen as it arrives. */
export function Impact() {
  return (
    <section className="wrap impact" id="impact" aria-labelledby="im-h">
      <div className="sec-head">
        <h2 id="im-h" className="rv">
          Why this <em>matters.</em>
        </h2>
        <p className="rv" style={vars({ "--rd": "120ms" })}>
          A lot of help goes unclaimed, often because people never learn it&apos;s there. Each statistic links to its source.
        </p>
      </div>
      <ul className="im-grid">
        <li className="rv">
          <b className="im-n">
            1 in 5
            <Circle d="M108 8 C160 6 196 28 194 52 C192 80 150 94 98 93 C46 92 6 78 6 50 C6 24 44 8 96 10 C120 11 140 14 150 18" />
          </b>
          <p>eligible workers don&apos;t claim the Earned Income Tax Credit, money they&apos;ve already earned.</p>
          <a href="https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/eitc-fast-facts" target="_blank" rel="noopener noreferrer">
            Source: IRS ↗
          </a>
        </li>
        <li className="rv" style={vars({ "--rd": "120ms" })}>
          <b className="im-n">
            1 in 8
            <Circle d="M92 9 C146 5 194 24 193 50 C192 79 148 94 96 92 C44 90 7 76 8 49 C9 22 50 7 104 9 C126 10 146 15 156 20" />
          </b>
          <p>people eligible for SNAP food benefits don&apos;t receive them.</p>
          <a href="https://www.fns.usda.gov/research/snap/state-participation-rates/2022" target="_blank" rel="noopener noreferrer">
            Source: USDA, FY2022 ↗
          </a>
        </li>
        <li className="rv us" style={vars({ "--rd": "240ms" })}>
          <b className="im-n">
            <span id="imCount">{PROGRAM_COUNT}</span>
            <Circle d="M100 7 C152 6 195 26 194 51 C193 78 152 93 100 93 C48 93 6 79 6 50 C6 23 46 8 98 9 C122 10 142 13 152 17" />
          </b>
          <p>programs serving Hampshire County, checked by hand and gathered in one place.</p>
          <span className="src">OpenDoor&apos;s list</span>
        </li>
      </ul>
    </section>
  );
}
