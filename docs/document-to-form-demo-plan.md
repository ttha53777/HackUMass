# Papers to forms: demo plan

Status: plan, written 2026-11-15 against `main` at `e3e2b9f`. Nothing in here is built yet.

Built on `claude/papers-to-forms` (2026-11-15), with these changes from the plan: the main demo form is the Fuel Assistance renewal (`/practice/fuel-renewal/`, Form C's fields) plus the food form (`/practice/food-application/`); the electric discount and rental forms are deferred; the default engine is `manifest` (offline), with `gemini_map` optional; the shut-off notice became a past-due notice (pay by 12/01/2026) because of Massachusetts winter shut-off protection; the heating-fuel radio is the person's choice, on the signing step (no confirmed-choice rule). See docs/demo-script.md, "Papers to forms".

Goal for the judges: one fictional household drops its papers in, the agents read them, settle a conflict, re-plan, and then a form agent fills a realistic application from what the papers said, asks for the one thing no paper covers, and hands the signature and the Send button back to the person. Every value on the form can be traced to the paper it came from.

The bar is "visibly works, every time, in under four minutes", not "handles any form on the internet".

---

## 1. What we already have, and what is missing

Already built and tested:

| Piece | Where | State |
|---|---|---|
| Fictional household (Maya Rivera) and 10 papers as text PDFs | `backend/tests/fixtures/demo_person.json`, `frontend/scripts/make-demo-papers.mjs`, `frontend/public/demo-papers/maya/` | Works. Papers are labelled-line PDFs. |
| Document Agent: kind check, SSN line drop, placeholder guard | `services/documents.py`, `services/document_patterns.py`, `agents/document_analysis.py` | Reads income, household size, a few eligibility facts, and name/DOB/address/phone/email. |
| Identity details go to the device, never to graph state | `KIND_IDENTITY`, `DocumentReading.identity` | Works. "My details" card confirms them. |
| Fill sheet with placeholders (`{{phone}}`), values typed by the server | `execution/fields.py` | 12 keys only. |
| Gemini Computer Use loop, gate, handoff, verify | `execution/agent.py`, `gate.py`, `manager.py`, `verify.py` | Works with a scripted model and headless Chrome. Not rehearsed with real Gemini. |
| One practice form | `execution/practice.html`, served at `/practice/` | Generic 3-step form, 12 fields. All four practice programs point at it. |

The gaps that matter for the demo:

1. **Papers only feed 12 form keys.** A realistic food or fuel application asks for 25 to 35 things: household members, employer, rent, utility account, landlord, amounts owed. Today most of those would become questions, which makes the agent look like it read nothing.
2. **One form for every program.** Four programs open the same generic page, so the demo can't show that the agent adapts to different layouts.
3. **No provenance on the form.** The step log says "Typed your phone number". It doesn't say "from your electric bill", which is the sentence that proves document parsing fed the form.
4. **Speed and reliability.** `config.py` records Gemini Computer Use at 5 to 135 seconds per screenshot turn, and a field costs two actions. A 30-field form could take 10+ minutes or time out. That is not demo-safe as the only path.
5. **Story holes in the mock data** (section 3.3), for example Maya has already applied for Fuel Assistance, so filling a Fuel Assistance form for her makes no sense as written.

---

## 2. The judge demo, beat by beat

About 3.5 minutes for this segment. It slots in after the intake (demo-script steps 1 to 5), or replaces steps 10 and 11.

| # | Time | Screen | What the judges see | Agent shown working |
|---|---|---|---|---|
| 1 | 0:00 | Chat | Maya types: "I'm a single mom with a little boy. I work part time at a grocery store and I'm behind on my electric bill." | User Intelligence maps it to needs (food, utilities), household 2. |
| 2 | 0:20 | Papers | **Add all demo papers** drops 10 files at once. Each card flips from "Reading" to a list of what was found, with the paper name on every chip. | Document Agent, one trace row per paper, kind detected. |
| 3 | 0:50 | One quick question | "You said 2 people live with you. Your household paper lists 3 (Maya, Leo, Rosa). Which is right?" Tap **3**. | Profile Agent conflict, one targeted `pending_question`. |
| 4 | 1:05 | Toast + plan | "Household income is $2,290 a month: Maya's wages $1,240 plus Rosa's Social Security $1,050." Cards move. | Profile Agent combines two papers; Eligibility re-checks only the dirty programs. |
| 5 | 1:20 | Plan | The landlord notice added **Housing**: "We saw a notice about $1,800 in back rent. Add housing help to your plan?" **Yes**. Emergency rental help appears. The shutoff date (Dec 1) moves the electric step to the top. | Discovery re-runs, Action Planning re-ranks by deadline. |
| 6 | 1:45 | Program card → **Fill my form** | Readiness card for the electric discount form: "11 of 13 ready from your papers and answers. 1 we'll ask. 1 is yours (signature)." Each ready row names its source. | Form Agent readiness (`fields.readiness`). |
| 7 | 2:00 | Live form | The practice form fills itself, field by field, at a visible typing speed. Step log: "Typed account number (from electric bill)", "Typed household size (from your answer)". | Form Agent fill. |
| 8 | 2:30 | Question in panel | "What's the best time to reach you?" Maya types "Weekday mornings". It goes straight into the form. | Form Agent `ask_user`. |
| 9 | 2:45 | Takeover | "This page asks you to sign." The person ticks the box, types the name, presses **Submit**. | Gate handoff. The agent never clicks Submit. |
| 10 | 3:05 | Plan | "Sent. Confirmation PRACTICE-EDR-4821. Watch for a reply." The step drops to "Applications you sent". | Verify reads the page; Action Planning updates. |
| 11 | 3:15 | Optional | Open the food assistance form run: same papers, different layout, 4 steps, household table filled. Stop at the SSN field: "We never fill Social Security numbers." | Gate refusal. |

Talking points to land: deterministic routing, every program fact from curated records, eligibility is potential, values never enter the model's prompt (it types `{{phone}}`), and the person always sends.

---

## 3. The household: one coherent data set

All fictional. Phone numbers stay in the 555-01xx range, emails on `example.com`, account numbers start with `SAMPLE-`, and street names keep "Example" or "Sample". The ZIP and town are real because coverage depends on them.

### 3.1 People

| Person | Relation | Born | Age on 2026-11-15 | Why it matters |
|---|---|---|---|---|
| Maya Rivera | applicant | 03/14/1994 | 32 | Works part time |
| Leo Rivera | son | 06/02/2023 | 3 | Child under 5 (WIC, Head Start) |
| Rosa Rivera | mother | 09/21/1962 | 64 | 60+ (senior programs), Social Security income |

Change from today: Rosa's birth date moves from 06/02/1962 to 09/21/1962, so she doesn't share Leo's birthday. Age bands stay the same.

Contact: 12 Example Street, Apt 3, Amherst, MA 01002. Phone 413-555-0142. Email maya.rivera@example.com.

### 3.2 Money and housing, checked against each other

| Fact | Value | Where it's stated | Check |
|---|---|---|---|
| Maya's pay | $15.50/hr, 80 hours in October, gross $1,240, net $1,052 | Pay stub | 15.50 × 80 = 1,240. Net is 85% of gross. At or above MA minimum wage ($15.00, **VERIFY** for 2026). |
| Scheduled hours | 18.5 per week | Pay stub | 80 ÷ 4.33 ≈ 18.5. Stated so the agent never computes it. |
| Rosa's income | $1,050/month Social Security | Benefit letter | Read as `member_income`, added, not compared. |
| Household income | $2,290/month | Derived by Profile Agent | 1,240 + 1,050. |
| Rent | $900/month, due the 1st, heat not included | Lease | 39% of income. |
| Heating | Electric baseboard, tenant pays | Lease (new line) | Explains why the electric bill is the heating bill. |
| Rent owed | $1,800 (October and November) | Landlord notice | 2 × 900. Lease began Sep 1, so Sep was paid. |
| Electric, previous balance | $142.60, unpaid | Electric bill (new lines) | |
| Electric, current charges | $171.25 (Oct 8 to Nov 6) | Electric bill | Plausible for electric heat in an apartment. |
| Electric, total due | $313.85 | Electric bill | 142.60 + 171.25. |
| Shutoff past due | $142.60 | Shutoff notice | Equals the unpaid previous balance. |
| Shutoff date | December 1, 2026 | Shutoff notice | **VERIFY**: Massachusetts has winter shutoff protection for heating customers in hardship. If it covers this case, either date the notice before Nov 15 or say plainly in the demo that the notice is fictional. Don't let a judge catch it. |
| Fuel Assistance | Approved for the 2025-2026 season, number SAMPLE-LIHEAP-0001 | Fuel Assistance letter | She is a returning client, so the 2026-2027 form is a **recertification**. |

### 3.3 Story fixes against today's `demo_person.json`

| Today | Problem | Change |
|---|---|---|
| Pay stub says 96 hours for $1,240 | $12.92/hr, below minimum wage | 80 hours at $15.50; add rate, frequency, weekly hours |
| Electric bill: "Amount due $78.40", shutoff says "$156.80 past due" | Works only if the reader assumes two equal months; and $78 is low for electric heat in November | Previous balance / current / total lines from 3.2 |
| Fuel Assistance letter: "Application received, not yet decided" (Nov 3) | Then why does the agent fill a Fuel Assistance application? | Prior-season approval letter; the form becomes "2026-2027 renewal" and pre-fills the number |
| Lease has no heating type or landlord contact | The fuel and rental forms need them | Add heating line, landlord address and phone |
| Landlord notice has no date | The rental form asks for the notice date | Add "Date of notice: November 10, 2026" |
| Electric bill has no account number or utility name line | Every utility form asks for both | Add "Utility: Sample Electric Co." and "Account number: SAMPLE-5512-0093" |

The deliberate conflict stays: in chat Maya says 2 people, the household paper lists 3. Rosa is the reveal.

Keep the utility fictional ("Sample Electric Co."). Don't print a real utility's name on a fake bill. The Eversource discount program is matched through the chat question `eversource_customer`, which Maya answers "Yes" in the script.

### 3.4 The papers, line by line

Rules that make papers easy to extract, and that the generator should enforce:

- Title on line one, and it must match the kind's `_TITLES` pattern.
- One fact per line, `Label: value`, label at the start of the line. No tables, no two-column layouts.
- A fixed label vocabulary (below). The extractor matches labels, so a new synonym is a code change.
- State totals; never make the reader add. ("Total due", "Household size", "Gross monthly pay".)
- US formats: `MM/DD/YYYY` for birth dates, `$1,234.56` for money, `413-555-0142` for phones.
- Every paper repeats name and address, so the Profile Agent can cross-check.
- First line of the PDF is the existing `SAMPLE DOCUMENT - FICTIONAL - FOR A DEMO ONLY` banner. No SSN anywhere, not even a fake one.

New lines are marked **(new)**. Everything else is already in `demo_person.json`.

**1. pay-stub** (kind `income`)
```
Pay stub - Valley Grocers (fictional)
Employee: Maya Rivera
Employer: Valley Grocers, 1 Sample Way, Amherst, MA 01002
Employer phone: 413-555-0110                (new)
Pay period: October 1 - October 31, 2026
Pay frequency: Monthly                      (new)
Hourly rate: $15.50                         (new)
Hours worked: 80                            (changed from 96)
Scheduled hours per week: 18.5              (new)
Gross monthly pay: $1,240
Net pay: $1,052
```

**2. household-members** (kind `dob`)
```
Household members and birth dates (fictional)
Household size: 3
Maya Rivera - self - born 03/14/1994
Leo Rivera - son - born 06/02/2023
Rosa Rivera - mother - born 09/21/1962       (changed)
Address: 12 Example Street, Apt 3, Amherst, MA 01002
```

**3. lease** (kind `lease`)
```
Residential lease (fictional)
Tenant: Maya Rivera
Unit: 12 Example Street, Apt 3, Amherst, MA 01002
Monthly rent: $900, due on the 1st
Heat included: No
Heating type: Electric baseboard, paid by tenant           (new)
Lease term: September 1, 2026 - August 31, 2027
Landlord: Sample Property Management
Landlord address: 40 Sample Road, Amherst, MA 01002       (new)
Landlord phone: 413-555-0177                               (new)
```

**4. electric-bill** (kind `heat`)
```
Electric bill - Sample Electric Co. (fictional)
Utility: Sample Electric Co.                 (new)
Account holder: Maya Rivera
Account number: SAMPLE-5512-0093             (new)
Service address: 12 Example Street, Apt 3, Amherst, MA 01002
Phone: 413-555-0142
Email: maya.rivera@example.com
Billing period: October 8 - November 6, 2026 (changed)
Previous balance: $142.60                    (new)
Current charges: $171.25                     (new)
Total due: $313.85                           (changed from "Amount due: $78.40")
Status: Past due
```

**5. shutoff-notice** (kind `shutoff`)
```
Notice of service disconnection (fictional)
Account holder: Maya Rivera
Account number: SAMPLE-5512-0093             (new)
Service address: 12 Example Street, Apt 3, Amherst, MA 01002
Date of notice: November 9, 2026             (new)
Amount past due: $142.60                     (changed)
Disconnection scheduled: December 1, 2026
Call to set up a payment plan before that date.
```

**6. proof-of-address** (kind `address`): unchanged.

**7. photo-id** (kind `id`): unchanged. Its `ID number: SAMPLE-0000` is never read into the fill sheet. ID numbers are the person's to type.

**8. landlord-notice** (kind `notices`, becomes readable)
```
Notice from landlord (fictional)
To: Maya Rivera, 12 Example Street, Apt 3, Amherst, MA 01002
Date of notice: November 10, 2026            (new)
Rent owed: $1,800
Months owed: October 2026, November 2026     (new)
Please contact the office by December 5, 2026 to arrange payment.
From: Sample Property Management
```

**9. fuel-assistance-letter** (kind `liheap`, becomes readable)
```
Fuel Assistance benefit notice, 2025-2026 season (fictional)      (changed)
Applicant: Maya Rivera
Fuel Assistance number: SAMPLE-LIHEAP-0001
Status: Approved for the 2025-2026 season                          (changed)
Date: December 2, 2025                                             (changed)
To continue next season, renew your application.                   (new)
```

**10. benefit-letter** (kind `member_income`): unchanged.

### 3.5 Golden fill sheet

This is the oracle for tests and for rehearsal: after a run, the form's DOM values must equal this column for every key the form has.

| Key | Value | Source | Owner |
|---|---|---|---|
| `first_name` / `last_name` / `full_name` | Maya / Rivera / Maya Rivera | pay stub, ID | device |
| `date_of_birth` | 03/14/1994 | ID, household paper | device |
| `street_address` | 12 Example Street, Apt 3 | lease, bill, ID | device |
| `city` / `state` / `zip` | Amherst / MA / 01002 | ZIP answer + regions file | profile |
| `phone` | 413-555-0142 | electric bill | device |
| `email` | maya.rivera@example.com | electric bill | device |
| `household_size` | 3 | household paper, confirmed in the conflict question | profile |
| `monthly_income` | 2,290 | pay stub + benefit letter, confirmed | profile |
| `member_2_name` / `_relation` / `_dob` | Leo Rivera / son / 06/02/2023 | household paper | device |
| `member_3_name` / `_relation` / `_dob` | Rosa Rivera / mother / 09/21/1962 | household paper | device |
| `employer_name` | Valley Grocers | pay stub | device |
| `employer_address` | 1 Sample Way, Amherst, MA 01002 | pay stub | device |
| `employer_phone` | 413-555-0110 | pay stub | device |
| `earned_income_monthly` | 1,240 | pay stub | device |
| `hours_per_week` | 18.5 | pay stub | device |
| `other_income_source` | Social Security | benefit letter | device |
| `other_income_amount` | 1,050 | benefit letter | device |
| `other_income_person` | Rosa Rivera | benefit letter | device |
| `monthly_rent` | 900 | lease | device |
| `heat_included` | No | lease | device |
| `heating_fuel` | Electric | lease | device |
| `landlord_name` | Sample Property Management | lease | device |
| `landlord_address` | 40 Sample Road, Amherst, MA 01002 | lease | device |
| `landlord_phone` | 413-555-0177 | lease | device |
| `lease_start` / `lease_end` | 09/01/2026 / 08/31/2027 | lease | device |
| `utility_company` | Sample Electric Co. | electric bill | device |
| `utility_account_number` | SAMPLE-5512-0093 | electric bill, shutoff notice | device |
| `amount_past_due` | 142.60 | shutoff notice | device |
| `shutoff_date` | 12/01/2026 | shutoff notice | device |
| `rent_owed` | 1,800 | landlord notice | device |
| `notice_date` | 11/10/2026 | landlord notice | device |
| `liheap_number` | SAMPLE-LIHEAP-0001 | fuel letter | device |
| `best_time_to_call` | (asked) | no paper: the agent must ask | run only |

"device" means the same path identity details take today: returned by the upload call, confirmed on the "My details" card, sent with the run start, held in `FieldStore` for one run, never in graph state, never logged.

---

## 4. The mock forms

Four practice forms, one per program that already has an automation record. Each looks like a different kind of agency form, so the demo shows the agent coping with layout changes, not a single memorised page.

### 4.1 Rules for every form (agent-friendly by construction)

- Served by us at `/practice/<form_id>/`, same CSP and headers as today's `/practice/`, no network requests, nothing kept.
- Banner on every step: "Practice copy. Nothing is sent to any agency." Fictional agency names only (no state seal, no real logo, no real agency name).
- Every input has a visible `<label for>`, and the label text reads like the catalogue label. Each input also carries `data-key="<catalogue key>"` so the fast executor and the tests don't depend on wording.
- Native controls only: `<input>`, `<select>`, `<textarea>`, real checkboxes and radios. No custom dropdowns, no date pickers, no iframes.
- Household members as a fixed table of 3 extra rows with their own labels ("Person 2 name"), never an "Add another" button.
- One column, at most 4 steps, a "Next" button per step, "Submit" only on the last.
- Each form contains exactly one field no paper covers ("Best time to reach you"), so `ask_user` happens once on stage.
- The last step always has a certify checkbox and a typed signature. The gate hands these off.
- On submit: a confirmation page with `Confirmation number: PRACTICE-<FORM>-<4 digits>`, which `verify.py` already reads.
- A small manifest beside each page (4.6) lists every field's key and step.

### 4.2 Form A: Electric discount enrollment (the main demo form)

Program `eversource-ma-discount-rate`. Fictional title "Low-Income Discount Rate Enrollment". One page plus a review page. Looks like a short utility web form.

| Label | Key | Filled from |
|---|---|---|
| Name on the account | `full_name` | electric bill |
| Account number | `utility_account_number` | electric bill |
| Service street address | `street_address` | electric bill |
| City / State / ZIP | `city` / `state` / `zip` | profile |
| Phone number | `phone` | electric bill |
| Email address | `email` | electric bill |
| Best time to reach you | `best_time_to_call` | **asked** |
| People in your household | `household_size` | profile (3) |
| Total monthly household income ($) | `monthly_income` | profile (2,290) |
| Fuel Assistance number, if you have one | `liheap_number` | fuel letter |
| I certify this is true (checkbox) | none | **handoff** |
| Signature (type your full name) | none | **handoff** |

13 inputs: 10 from papers or profile, 1 asked, 2 the person's. About 60 seconds with the fast executor.

### 4.3 Form B: Food assistance application (the "it reads a long form" moment)

Program `fbwm-snap-application-assistance`. Fictional title "Food Assistance Application". Four steps, looks like a state benefits form.

| Step | Fields (key) | Sources |
|---|---|---|
| 1. About you | `first_name`, `last_name`, `date_of_birth`, `phone`, `email`, `street_address`, `city`, `state`, `zip`, `best_time_to_call` | ID, bill, profile; 1 asked |
| 2. Your household | `household_size`; table rows `member_2_*`, `member_3_*` (name, relationship, date of birth); a third empty row | household paper |
| 3. Income and costs | `employer_name`, `employer_address`, `earned_income_monthly`, `hours_per_week`, `other_income_source`, `other_income_amount`, `other_income_person`, `monthly_rent`, `heat_included`, `utility_company` | pay stub, benefit letter, lease, bill |
| 4. Review and sign | "Social Security number (optional)", certify, signature, Submit | **gate refuses SSN**, then handoff |

About 31 inputs. This is the form for the optional beat 11. The SSN field sits on the same step as the signature, so the refusal and the handoff land together and cost one takeover, not two.

### 4.4 Form C: Home energy assistance renewal

Program `capv-fuel-assistance`. Fictional title "Home Energy Assistance 2026-2027 Renewal". Two steps.

| Fields | Sources |
|---|---|
| `liheap_number` (labelled "Last season's application number") | fuel letter |
| `full_name`, `date_of_birth`, `street_address`, `city`, `state`, `zip`, `phone` | ID, bill, profile |
| `household_size`, `member_2_*`, `member_3_*` | household paper |
| Primary heating fuel (radio: Oil, Natural gas, Electric, Propane, Wood, Other) → `heating_fuel` | lease; see 5.3 |
| `utility_company`, `utility_account_number` | electric bill |
| `monthly_rent`, `heat_included` | lease |
| `monthly_income` | profile |
| certify, signature | handoff |

This is the one form with a radio group that a paper answers, so it is where the confirmed-choice rule (5.3) shows up. Without that rule, the radio is handed to the person, which still works.

### 4.5 Form D: Emergency rental assistance

Program `raft-way-finders`. Fictional title "Emergency Housing Assistance Request". Only offered after the landlord notice adds Housing (beat 5).

| Fields | Sources |
|---|---|
| `full_name`, `street_address`, `city`, `state`, `zip`, `phone`, `email` | bill, lease |
| `household_size`, `monthly_income` | profile |
| `monthly_rent`, `lease_start`, `lease_end` | lease |
| `rent_owed`, `notice_date` | landlord notice |
| `landlord_name`, `landlord_address`, `landlord_phone` | lease |
| "What happened that made it hard to pay rent?" (textarea) | **handoff**: the person's own words, never written by the agent |
| certify, signature | handoff |

A raft-way-finders automation record has to be added (`mode: "practice"`).

### 4.6 Form manifest

`backend/app/data/automation/forms/<form_id>.json`, curated by hand:

```json
{
  "form_id": "electric-discount",
  "title": "Low-Income Discount Rate Enrollment",
  "steps": [
    {
      "fields": [
        {"selector": "#acct_name", "key": "full_name", "required": true},
        {"selector": "#acct_no", "key": "utility_account_number", "required": true},
        {"selector": "#best_time", "key": "best_time_to_call", "required": false}
      ],
      "next": "#next"
    },
    {"fields": [], "handoff": ["#certify", "#signature"], "submit": "#submit"}
  ]
}
```

The automation record gains `form_id`, and its `fields` / `fields_optional` lists are derived from the manifest so the readiness card and the form can never disagree.

---

## 5. How the agent fills the form

### 5.1 Three ways to fill, one gate

| Engine | What decides which field gets which value | Speed | Network | Use |
|---|---|---|---|---|
| `manifest` | The curated manifest (4.6) | ~2 s per field, typing visibly | none | Offline fallback; tests |
| `gemini_map` | One Gemini call: the page's field labels in, a catalogue key per field out (enum-constrained). Code then fills by selector. | ~5 s for the call, then as `manifest` | one call per step | **Stage default** |
| `computer_use` | The existing screenshot loop | 5 to 135 s per action | many calls | Showpiece clip, or live on Form A if rehearsed under 3 minutes |

`gemini_map` is the pitch for the Gemini track: Gemini reads and understands the form, code executes it. It also covers a form we have no manifest for. Its output is validated: every key must exist in the catalogue, each label maps to at most one key, and a key the run doesn't hold becomes an `ask_user`. On a failed or slow call (over 8 s), the run falls back to the manifest and logs "Used the saved map for this form".

Values never go to Gemini in any engine. Labels are page text and are treated as data: the response schema only allows catalogue keys or `null`.

Every engine sends each action through `gate.evaluate` as a synthesized `Action` (click at the element's centre, then `type` with the placeholder). That keeps the claim "code, not a prompt, enforces the rules" true for the fast engines too. The SSN refusal, the certify handoff and the submit block all come from the same gate.

Setting: `FORM_AGENT_ENGINE=gemini_map|manifest|computer_use`, default `gemini_map`, forced to `manifest` when `GEMINI_API_KEY` is missing.

### 5.2 Visible typing

`page.type(selector, value, delay=25)` instead of `fill`, plus a 300 ms pause and a brief highlight on each field before typing. Judges must see it happen; an instant fill reads as a page refresh.

### 5.3 Confirmed-choice rule (stretch)

Today every radio, checkbox and option is handed to the person. Proposed narrow exception: the agent may select an option only when (a) the field's key is in the manifest or `gemini_map` result, (b) the run holds a confirmed value for that key, and (c) the option's visible text equals that value after normalising case and spaces. The step log says "Chose Electric (from your lease)". Certify boxes, consent boxes and anything matching the gate's sign/agree/attest words stay handed off with no exception.

Without this rule, Form C's heating radio is a handoff. That is acceptable for v1.

### 5.4 Provenance in the step log

The run start request already carries `details`. Add `detail_sources: {key: paper_kind}` (paper kind only, never text or values). The step log then reads "Typed your account number (from your electric bill)". Profile-owned keys say "(from your answer)" or "(from your answers and papers)". Asked keys say "(you told us)".

A "Where this came from" toggle on the live view overlays a small source chip next to each filled field, from the same map. This is the single clearest proof of "document parsing fed the form", so it ranks high in the build order.

---

## 6. Document Agent changes

### 6.1 New readable kinds

| Kind | Profile facts it may set (unconfirmed) | Form details it may give the device |
|---|---|---|
| `notices` | proposes `housing` added to `needs`; `housing_urgency = "behind_on_rent"` (**coordinate**: new option id) | `rent_owed`, `notice_date`, `landlord_name` |
| `liheap` | `benefits_received` includes Fuel Assistance, labelled "last season" (**check** how eligibility treats last season) | `liheap_number` |

The `needs` change is the one with the most reach: it must go through the normal unconfirmed-fact path and a one-tap confirm, then Discovery re-runs. Check how `needs` merges before building it; if it's risky, show the housing suggestion as a card with a button that edits the `needs` answer, which is a path that already exists.

### 6.2 More form details from existing kinds

Extend `KIND_IDENTITY` (rename it `KIND_DETAILS`, since most of these aren't identity) and add the line patterns:

| Kind | New keys | Labels read |
|---|---|---|
| `income` | `employer_name`, `employer_address`, `employer_phone`, `earned_income_monthly`, `hours_per_week` | Employer, Employer phone, Gross monthly pay, Scheduled hours per week |
| `member_income` | `other_income_source`, `other_income_amount`, `other_income_person` | Beneficiary, Benefit amount each month; source from the title ("Social Security") |
| `dob` | `member_N_name`, `member_N_relation`, `member_N_dob` for every row that isn't `self` | existing `_MEMBER_ROW` |
| `lease` | `monthly_rent`, `heat_included`, `heating_fuel`, `landlord_name`, `landlord_address`, `landlord_phone`, `lease_start`, `lease_end` | Monthly rent, Heat included, Heating type, Landlord, Landlord address, Landlord phone, Lease term |
| `heat` | `utility_company`, `utility_account_number` | Utility, Account number |
| `shutoff` | `utility_account_number`, `amount_past_due`, `shutoff_date` | Account number, Amount past due, Disconnection scheduled |

Every new key gets a `FieldSpec` with a pattern (money, date, phone, short text), so a value read from a paper is checked exactly like a typed answer. `DEVICE_KEYS` grows to match. `household_size` and `monthly_income` stay profile-owned.

Normalising: "Lease term: September 1, 2026 - August 31, 2027" becomes `09/01/2026` and `08/31/2027`; "$1,240" becomes `1,240`; "Electric baseboard, paid by tenant" becomes `Electric` (first word, matched against a fixed fuel list). All deterministic. No model reads identity or form details, in any mode.

### 6.3 Batch upload

**Add all demo papers** in the Demo kit posts the 10 files one after another (not in parallel, so the trace reads in order), each with its kind from `manifest.json`. One graph run per paper, as today. If 10 runs take too long on stage, add `POST /documents/batch` that reads all papers and queues one evidence run; measure first.

---

## 7. Making orchestration visible

The judges score orchestration, so every agent hand-off needs a visible row. The "Agents at work" panel (`?demo=1`) already replays trace steps; these are the rows to add or reword:

| Agent | Row text (template) |
|---|---|
| Document Agent | "Read your pay stub: income $1,240 a month, employer Valley Grocers." |
| Document Agent | "Read your household paper: 3 people. That's different from what you told us." |
| Profile Agent | "Household size: you said 2, the paper lists 3. Asking you." |
| Profile Agent | "Household income: $1,240 wages + $1,050 Social Security = $2,290." |
| Discovery | "Housing added from the landlord notice: 3 more programs to check." |
| Eligibility | "Re-checked 6 programs. 2 moved to likely fit, 1 moved out." |
| Action Planning | "Shutoff on Dec 1 moved the electric step to first." |
| Form Agent | "Electric discount form: 10 of 13 fields ready from your papers." |
| Form Agent | "Typed account number (from your electric bill)." |
| Form Agent | "This form asks for a Social Security number. We never fill that." |
| Form Agent | "Stopped before Submit. Your turn." |
| Verify | "Confirmation PRACTICE-EDR-4821 found. Plan updated." |

Values on these rows come from the session's own state and the run's step log. Nothing from the trace is logged server-side (existing `log_safety` rules). Dollar amounts on the Document Agent rows are the person's own facts shown to the person, which is already the case on the confirm card.

A small architecture card in the panel, a static diagram: Papers → Document Agent → Profile Agent → (Discovery, Eligibility, Action Planning) → Form Agent → Verify → back to Action Planning. The active node lights up from the trace. This is what a judge photographs.

---

## 8. Build order

The hackathon ends today, so this is tiered by what the demo can't live without. Hours are rough, for one person each.

### Tier 1: the demo works (about 6 hours across 3 people)

| # | Ticket | Workstream | Files | Hours |
|---|---|---|---|---|
| T1 | Data fixes from 3.3 and new lines from 3.4; regenerate papers; update expected | Data | `demo_person.json`, `make-demo-papers.mjs` | 0.75 |
| T2 | Form A page + manifest + automation record `form_id`; serve `/practice/<form_id>/` | Execution | `execution/forms/`, `practice_routes.py`, `data/automation/` | 1.5 |
| T3 | New catalogue keys with patterns; `DEVICE_KEYS` | Execution | `execution/fields.py` | 0.5 |
| T4 | Extract the new details for `heat`, `shutoff`, `lease`, `income`, `liheap` (Form A needs `utility_account_number`, `liheap_number`) | Documents | `document_patterns.py` | 1.5 |
| T5 | `manifest` engine through the gate, visible typing, provenance in step log | Execution | new `execution/fill.py`, `manager.py`, `execution_routes.py` (`detail_sources`) | 2 |
| T6 | "Add all demo papers" button | Frontend | Demo kit component | 0.5 |
| T7 | Rehearsal test: upload all 10 papers, confirm, run Form A with `manifest`, compare DOM to the golden fill sheet | Tests | `tests/test_paper_to_form.py` | 1 |

After T7, the demo in section 2 runs end to end with no network, beats 1 to 10.

### Tier 2: it looks smart (about 5 hours)

| # | Ticket | Hours |
|---|---|---|
| T8 | `gemini_map` engine with manifest fallback | 1.5 |
| T9 | "Where this came from" overlay on the live view | 1 |
| T10 | Form B page + manifest; `dob` member rows, `member_income` details | 1.5 |
| T11 | Trace row wording (section 7) and the architecture card | 1 |

### Tier 3: only if Tier 2 is green and rehearsed

| # | Ticket | Hours |
|---|---|---|
| T12 | `notices` kind suggests Housing; Form D; raft automation record | 2 |
| T13 | Form C and the confirmed-choice rule | 2 |
| T14 | Time a live `computer_use` run on Form A; record a 30 s clip as backup | 1 |

### Contract files to coordinate first

Per `CLAUDE.md`, raise these in the team channel before editing:

- `api/schemas.py` and `frontend/src/lib/types.ts`: `detail_sources` on the run start request; new device detail keys on the upload response; `form_id` if the snapshot exposes it.
- `graph/state.py`: only if T12 adds a `housing_urgency` option or a `needs` suggestion field.
- After any snapshot change: regenerate `tests/fixtures/snapshot.json`, then `npm run sync:fixture` in `frontend/`.
- `README.md` and `docs/demo-script.md`: new route `/practice/<form_id>/`, `FORM_AGENT_ENGINE`, and the new demo beats.

---

## 9. Acceptance checks

| Check | How |
|---|---|
| Every paper extracts exactly its expected facts and details | Extend `test_demo_papers.py` and `demo_papers_expected.json` with the details per paper |
| Golden fill sheet matches the form | `test_paper_to_form.py`: headless Chrome, `manifest` engine, read every `[data-key]` value, compare to 3.5 |
| The agent never sends | Same test: the run ends in `needs_you` at the certify step; the confirmation page appears only after the test clicks Submit as the person |
| SSN is never typed | Form B run: the SSN input is empty after the run; the step log has the refusal row |
| No value in logs | `caplog` over the whole run: no golden value appears (existing pattern in `test_execution_hardening.py`) |
| Works offline | Whole test with `LLM_MODE=off`, no `GEMINI_API_KEY` |
| Under 4 minutes | `rehearse.py` timing on Form A with `gemini_map`, 5 runs, report the slowest |
| Demo smoke stays green | `test_demo_smoke.py` five times before every demo |

---

## 10. Risks and the cut line

| Risk | Plan |
|---|---|
| Gemini slow or down on stage | `manifest` engine is the automatic fallback; the run never waits more than 8 s on the mapping call |
| 10 sequential uploads too slow | Measure in T6. If over 20 s, show 5 papers live and preload the rest |
| Changing `needs` from a paper breaks discovery | Use the suggestion card that edits the `needs` answer instead (6.1) |
| A judge spots a real-world inaccuracy in the fiction | Resolve the **VERIFY** items in 3.2 before the demo, or cut those lines |
| Mock form looks like a real agency | Fictional names only, practice banner on every step, no seals or logos |
| Forms and readiness card disagree | Automation `fields` are derived from the manifest, never typed twice |

If time runs out, cut from the bottom of section 8 up. Tier 1 alone still shows the full chain: papers read, conflict settled, plan changed, form filled with sources, one question asked, person signs and sends, plan updated.

---

## 11. Open questions for the team

1. Does the stage run use `gemini_map` or `manifest`? It depends on whether a `GEMINI_API_KEY` is on the demo laptop and was rehearsed.
2. Is the confirmed-choice rule (5.3) acceptable, or do we keep "every choice is the person's" with no exception? It's a product call about consent, not a technical one.
3. Should Form A be the Eversource discount program, given that the bill is from a fictional utility? The alternative is to run Form A against `capv-fuel-assistance` with Form C's layout cut down to one page.
4. Who owns the Documents workstream for T4? It touches the same file as any ongoing work on `document_patterns.py`.
