# Plan Hub integration plan

Goal: after onboarding, the app looks and behaves like the **OpenDoor Plan Hub** artifact,
backed entirely by the real session (FastAPI + LangGraph). Flow:

```
/  (landing)  →  /start  (conversation + Building)  →  /home  (Plan Hub: "Your plan")
                                                         └→ /papers (Plan Hub: "Papers")
```

The artifact's third tab, **Assets & states**, is not ported. It is used here only as the
acceptance checklist for states (Phase 9).

---

## Progress

- **Phases 0–3 done** on branch `c/plan-hub` (not committed). Design reference saved to
  `docs/ui-reference/opendoor-plan-hub.html`. Old pages archived to
  `frontend/src/app/(opendoor)/_archive/legacy-dashboard/`, redirects in `next.config.ts`.
- B1 shipped with two refinements found while testing on curated data: `deadline` is set on
  **one program per urgent need** (the best-ranked one whose category the urgent answer is about),
  and urgent programs that still need more information go to **"week"**, not "today". Without this,
  a shutoff answer put seven red "do this today" cards on the plan.
- B3 test added (`test_editing_needs_after_intake_adds_and_removes_programs`).
- **Phases 4–6 done.** Spotlight (`components/hub/spotlight.tsx`) from the program record, its
  assessment checks and guide; programs without a guide get a first-step / contact fallback.
  `if_denied` / `unlocks` are program ids in the data, so "If they say no" shows one fixed line of
  advice plus those programs. Papers: `papers-context.tsx` (IndexedDB files, identity details,
  form-helper switch), upload drawer on the real Document Agent with in-drawer review, paper and
  counter drawers, full Papers page, "Check what we read" prompt for leftover reviews. Bank:
  simulated profiles only, review card + bills summary, Disconnect; `/money` opens the bank drawer.
- Still to come: "Fill the form for me" tile and form pip actions (Phase 7), chat (Phase 8),
  Watch demo (Phase 9). The "What the helper did" log on Papers arrives with Phase 7.

## 1. What the artifact is

A single-file mock (`OpenDoor Plan Hub`, 2,433 lines). Everything runs off one hard-coded state
object `S` and hard-coded tables. Nothing touches a server.

| Artifact area | What it does | Hard-coded source |
|---|---|---|
| Pill nav | "Your plan" · "Papers" · ~~"Assets & states"~~ · "Watch demo" | — |
| Hero | Case-driven eyebrow/headline/lede/CTA + hand-drawn door that opens as steps get done (`--open`) | `CASES`, `heroSVG`, `ACC` |
| "What you told us" | Need chips with step counts (×removes), zip · household chip, "+ Add a problem", "My answers" | `S.needs`, `S.ans` |
| Shortcuts · optional | 3 tiles: Add a paper once / Connect a bank / Fill the form for me | derived |
| Plan | Banner (urgent / no-match / offline) · Gov/Local filter chips · "Show what helps with" need chips · green **Do this first** card · lanes **Today / This week / When you are ready** (Today = full cards, others = slim rows) · progress meter | `STEPS`, `active()`, `caseOf()` |
| Step card | Gov/Local pill, fit badge, title, "For <need>", why, readiness **pips** (papers / income / form), primary button, "More about this", Mark done | `STEPS`, `pips()`, `primary()` |
| Aside | **One quick question** (one input per QuestionType) · **Your papers** wallet | `QS`, `DOCS` |
| Spotlight (modal) | Cost / Decision / Your time / Papers glance; Why it may fit you; How to get it (ways, phone); Bring; What to say on the phone; Ask them; If they say no; One yes can open more | `PROG` |
| Drawers | Needs picker (search, groups) · My answers (edit any) · Upload (pick → reading → check → done) · Bank (consent → reading → check → done) · Form (helper gate → fill → send → sent) · Chat ("Talk it through") · Paper viewer · "Show at the counter" | `NEEDS`, `SAMPLES`, fake timers |
| Papers view | Hero + **Form helper** switch; saved paper cards (helper-reads switch, show at counter) and "needed" cards; "Going to an appointment?" pack; "What the helper did" log; privacy line | `DOCS`, `SAMPLES`, `S.log` |
| Chat | Keyword `understand()` → "Here is what I heard" (needs + facts, checkboxes, Add to my plan) · quick-reply follow-up question · safety card (911/988) · "Added N steps" | regexes |
| Cases | `start · empty · urgent · waiting · done · offline · nomatch · loading` | `caseOf()` |
| Tour | 70-second scripted cursor demo | `STEPS_DEMO` |
| Footer | Promises, 911/988, Leave quickly | — |

Visual system: Newsreader / Atkinson Hyperlegible Next / IBM Plex Mono / Caveat. Paper palette
`--paper #F1F3EE`, `--door #1E5843`, `--brass #B8862C`, `--sun #F2D58A`, `--alert #9C3F27`,
hand-drawn SVG icon symbols (`i-n-*`, `i-e-*`, …), pen filter. **This is the same type and palette
the `.od-front` pages (landing, `/start`, Building) already use.** The current dashboard does not
use it (DM Sans/Manrope, Tailwind tokens, sidebar, dark mode).

## 2. What the real app is today

- **Session**: `useSession` (`hooks/use-session.ts`) owns one session id in `localStorage`
  (`crn.session_id`), polls while `busy`, exposes `submit`, `submitEvidence`, `disconnectBank`,
  `readPaper`, `submitReview`, `refresh`, `restart`. `SessionProvider` wraps both `(front)` and `(app)`.
- **Snapshot** (`lib/types.ts`, contract with `api/schemas.py`): `programs[]` (ProgramCard =
  curated Program + AssessmentView), `action_plan[]` (rank, action_type, urgency, next_step,
  documents), `open_questions[]`, `answered[]`, `profile_summary[]` (with provenance),
  `coverage`/`region`, `financial_summary`, `bank_suggestions`, `pending_reviews`,
  `applications`, `automatable_program_ids`, `last_change`, `trace`.
- **Device-only state**: `PlanProvider` (`od.plan`: per-program stage, done ids, paper kinds held),
  `paper-store.ts` (IndexedDB blobs), `details-store.ts` (identity details read from papers,
  confirmed on device), name (`od.name`).
- **Dashboard** (`app/(opendoor)/(app)/*`): `Gate` (redirects to `/start` until `coreDone`),
  `AppShell` with a 6-item sidebar: `/home`, `/benefits`, `/benefits/[slug]` (guide),
  `/local`, `/documents`, `/money`, `/about`. `AnswerProvider` sends answers and toasts what
  moved (`last_change`). `DrawerProvider` opens a program drawer.
- **Onboarding exit**: `building.tsx:121` and `conversation.tsx:222` both `router.replace("/home")`.
  **No change needed** — `/home` simply becomes the hub.
- **Real capabilities the artifact fakes**: document reading (`POST .../evidence/document` +
  review cards), simulated bank (`/nessie/personas`, `.../evidence/nessie`, disconnect),
  browser form assistant (`/applications` runs with readiness, needs_answer, needs_you handoff,
  live view), message interpretation (`POST .../interpret` with safety contacts), unverified
  web resources, agent trace.

## 3. Mapping: artifact concept → real data

| Artifact | Real source | Notes |
|---|---|---|
| `NAME` ("Maya") | `readName()` (device) | Fallback: no name in headline ("Here is everything in one plan"). |
| `S.needs` | `answered` item `needs` → `selected_option_ids` (labels from `components/front/needs.ts`) | Add/remove = **re-submit `needs` as an edit** (`AnswerIn`, already supported). |
| `NEEDS` (20 problems) | backend `needs` options (15) | Artifact-only: `clothing`, `id`, `debt`, `education`, `immigration`. Map `immigration→legal`, `education→food` (+ `umass_affiliation` follow-up handles campus). **Drop** clothing / id / debt from the picker (no curated programs; never invent). Free-text in the picker search falls through to chat → `allow_other` → web resources. |
| `STEPS` (a step) | a live `ProgramCard` + its `ActionItem` | Live = `LIVE` statuses (`derive.ts`). `already_receiving` hidden (artifact's `held`), `likely_ineligible` hidden. |
| `room` benefits/local → Gov/Local pill | `program.track` (`benefit`/`local`) | Same rule the current `Tag` uses. |
| `fit` likely / possibly / need / opt | `toneOf(card)` + `asksFor` | fit→"Likely fit"; open→"Open to everyone" (likely style); maybe & asks>0→"Need more info" (dashed); maybe & asks=0→"Possibly a fit"; later→"Opens later" (opt style). |
| `when` today / week / later | **new** `ActionItem.horizon` (B1) | Decided in the backend, deterministic, tested. |
| `crit` / `urgent` | **new** `ActionItem.deadline` (B1) + `urgency === "high"` | Drives the urgent case + banner. |
| `title` | `shortName(program)` | |
| `why` | `reasonLine(card)` (first pass/have check) | Already backend wording. |
| "For <need>" | first of `program.categories` ∩ person's needs | |
| `time` ("About 20 minutes") | **not in data — do not port** | Replace "Your time" glance cell with "Best way" (`guide.ways.find(best).kind`). |
| `docs` / papers pip | `docsFor(program)` kinds vs `plan.docs` | Labels `docLabel(kind, texts)`. |
| income pip | program has an `income_max/min` requirement; ok when `monthly_income`/`income_band` is answered | Source badge from `profile_summary.provenance` ("You told us" / "From a paper" / "From bank, simulated"). |
| form pip | `automatable_program_ids` ∋ id; state from `applications[id].status` | Non-automatable programs get no form pip; primary becomes the guide's best way (link/phone). |
| `S.done` | `plan.done` (device) ∪ `applications` submitted | `isStepDone` already exists. |
| `S.sent` | `applications[id].status` ∈ submitted/unclear | Shown as "Sent by you". |
| `S.have` / `DOCS` | `walletKinds(snapshot, plan)` + `plan.docs` + `paper-store` | Wallet lists the kinds the person's live programs ask for (not a fixed 8). |
| `SAMPLES` (paper fields) | `pending_reviews[].rows` while reviewing; confirmed facts in `profile_summary` with `document_extracted`; identity in `details-store` | Demo papers already exist: `public/demo-papers/maya/*` + `manifest.json`. |
| `S.bank` / bank found rows | `financial_summary` (income_sources, bills with status overdue) + simulated `pending_reviews` card | Always labelled **Simulated**. |
| `S.income` source | `profile_summary` provenance for `monthly_income` | |
| `QS` + "One quick question" | `open_questions[0]` (+ "n of N" from `open_questions.length`) | Backend decides order. Renderers per `QuestionType` restyled to the artifact. |
| "My answers" | `answered[]` (each carries its full `question` for editing) | Same as current About view logic. |
| `PROG` (spotlight) | `program.guide` (`cost`, `when`, `decided_by`, `ways`, `ask_them`, `if_denied`, `unlocks`, `safety_note`, `conditional_notes` via `guideNotes`), `assessment.checks` (why), `documents_needed`, `contact`, `apply_url`, `first_step`, `source_url`, `verified_on` | Programs without a guide fall back to description / contact / apply_url / first_step. The artifact's invented phone numbers and copy are **not** ported. |
| "What to say on the phone" | UI template (name from device, zip from profile) | Interface copy, not program facts; label it as a suggestion. |
| "One yes can open more" | `guide.unlocks` + programs with status `opens_later` | |
| `caseOf()` | snapshot + plan (see §6) | `nomatch` = `coverage === "unsupported"`, `loading` = `busy` or phase not complete. |
| Toast + card flash | `AnswerProvider` (`changeMessage`, `moved`) | Already built from `last_change`. |
| Chat `understand()` | `POST .../interpret` with `question_id: "needs"` + **new** follow-up proposals (B2) | Safety comes from `safety`/`safety_contacts` (curated lines). |
| Form fill animation | real run: `getReadiness` → `startRun` → poll `getRun` (`steps`, `question`, `handoff`, `live_view_url`/frame) | "Only you press Send" = `handoff.reason === "submit"`. |
| Form helper switch / per-paper "helper reads" | device setting + per-paper flag; when off, `startRun` is sent without `details` | No backend change. |
| "What the helper did" | device log written from finished `RunView.steps` (counts + paper kinds, never values) | |
| Counter view | paper blob (IndexedDB) + confirmed `details-store` values | Never shows ID number / SSN. |

## 4. Backend changes

Small and contained. Contract files change together (`api/schemas.py`, `graph/state.py`,
`frontend/src/lib/types.ts`), then `scripts/make_snapshot.py` + `npm run sync:fixture`.
Coordinate before editing per CLAUDE.md.

### B1. `ActionItem.horizon` and `ActionItem.deadline` (Phase 2)

`agents/action_planning.py` already computes `urgency` from the person's answers. Add two
deterministic fields per item:

```python
horizon: Literal["today", "week", "later"]
deadline: bool   # a dated or safety-critical situation: drives the urgent banner
```

Rules (one table, like `URGENCY_RULES`, unit-tested):

| Condition | horizon | deadline |
|---|---|---|
| urgency `high` from `utility_urgency=shutoff`, `utility_issues∋shutoff`, `housing_status=no_stable_housing`, `housing_need=tonight` | today | **true** |
| need `safety` chosen and program category `safety` (add a rule row `("safety","needs","safety","high")`) | today | **true** |
| track `local`, access `walk_in`/`call`, tone fit/open, no documents listed | today | false |
| urgency `medium`, or action `apply_now` | week | false |
| action `confirm_eligibility` | week | false |
| action `get_more_information`, status `opens_later`, or program out of season (`program_period`) | later | false |

Order inside a lane stays `rank`. Tests in `tests/test_action_planning.py`: one per row, plus
"no answer → no deadline".

### B2. Interpret: follow-up proposals from one sentence (Phase 8)

The chat must turn "I got a shutoff notice, I have a toddler, we're almost out of groceries" into
needs **and** facts. Today `interpret("needs", text)` returns `answer` (needs) and `noted`
(zip/household only).

Add to `InterpretOut`:

```python
proposed: list[AnswerIn]   # validated answers to existing follow-up questions, never applied
```

- Built in `services/conversation.py` / `free_text.py` with keyword patterns first (shutoff,
  behind, eviction/notice, no place to stay, pregnant/baby/toddler → `household_who=child`,
  60+/grandma → `household_who=60`), each run through `validate_answer` so only real option ids
  survive. LLM mode may add matches; output still validated.
- Applied only when the person taps **Add to my plan** (frontend sends each through
  `POST .../answers`, needs first).
- Tests: `tests/test_interpret.py` cases for each pattern + an injection string producing nothing.

### B3. No other endpoints needed

- Add/remove a need = edit of `needs` (`POST .../answers`). Verify with a test that editing `needs`
  after core intake re-runs discovery and that removing a need drops its programs.
- Everything else (papers, bank, applications, web resources) already exists.

## 5. Frontend architecture

### Routes

```
app/(opendoor)/
  layout.tsx                 SessionProvider · ToastProvider · ThroughProvider   (unchanged)
  (front)/...                landing, /behind, /start                            (unchanged)
  (app)/layout.tsx           Gate · PlanProvider · AnswerProvider · HubProvider · HubShell
  (app)/home/page.tsx        <PlanHub/>        "Your plan"
  (app)/papers/page.tsx      <PapersView/>     "Papers"
```

**Old pages are kept, not deleted, but are no longer part of the live app.** Their page files move
from `app/(opendoor)/(app)/` into `app/(opendoor)/_archive/` (a `_`-prefixed folder is private in
the App Router: never routed, still type-checked and linted). Their components stay where they
are; nothing live imports them. Bringing one back is a `git mv` of its page file.

The old URLs redirect into the hub (in `next.config.ts` `redirects()`, plus a client hop for the
two that need snapshot data), so links and bookmarks keep working:

| Old | New |
|---|---|
| `/benefits`, `/local` | `/home` (filter preset: `?show=gov` / `?show=local`) |
| `/benefits/[slug]` | `/home?spot=<program id>` (resolve slug via `guide.slug` client-side) |
| `/documents` | `/papers` |
| `/about` | `/home?sheet=answers` |
| `/money` | `/home?sheet=bank` |

The hub reads `?spot=` and `?sheet=` on mount, opens the modal/drawer, then cleans the URL.

### Shared paper look

Lift the font + theme wrapper out of `(front)/layout.tsx` into `components/front/paper-scope.tsx`
(next/font variables, `FrontTheme`, `FrontDefs`) and use it in both `(front)` and `(app)` layouts.
The hub is **light only**, like the front pages (decision D1). The sidebar `ThemeToggle` goes away.

### New files (`components/hub/`)

| File | From artifact | Responsibility |
|---|---|---|
| `hub.css` | CSS lines 8–806 minus the library (`.lib-*`, `.lcard`, `.igrid`, `.itile`, `.lq`, `.chatdemo`, `.ltype`) | Scoped under `.od-hub`, keyframes prefixed `od-`, reuse `.od-front` tokens. Light only: no `prefers-color-scheme` rules. Tour styles (cursor, trail, annotations, tour bar) are kept. |
| `hub-defs.tsx` | `<defs>` lines 809–863 | Icon symbols `i-n-*`, `i-e-*`, `i-bot`, `i-lock`… merged with `FrontDefs` (dedupe `i-arrow`, `i-check`). |
| `hub-shell.tsx` | `.shell/.nav`, footer | Pill nav (Your plan / Papers) with **Watch demo** button and "see it work in 70 seconds" hint, Leave quickly (reuse top-bar leave behaviour), 911/988, toast dock, `AgentFlowPill` behind `?demo=1`. |
| `hub-state.tsx` | `S.sheet`, `S.spot`, `S.filter`, `S.fneed` | Context: open sheet `{type, id, stage}`, spotlight id, filters. Replaces `DrawerProvider`. Escape closes, scrim, focus trap, `aria-modal`. |
| `plan-hub.tsx` | `#homeView` | Composes everything below. |
| `door-scene.tsx` | `heroSVG`, `ACC`, `LEAFACC` | Door art; `open` prop animated from progress. |
| `hero.tsx` + `cases.ts` | `CASES`, `renderHero` | Copy per case, name/region in eyebrow. |
| `told.tsx` | `renderTold` | Need chips (counts = live programs in that category), zip · household chip, add/answers buttons. |
| `shortcuts.tsx` | `renderTiles` | Papers / bank / form tiles from real counts. |
| `step-card.tsx`, `step-slim.tsx`, `pips.tsx`, `next-card.tsx`, `lanes.tsx`, `filters.tsx`, `banner.tsx` | plan render | Pure presentational over `HubStep`. |
| `ask-box.tsx` + `question-input.tsx` | `qInput/qFoot` | One renderer per `QuestionType` (single = tap saves; multi with "none" exclusivity; number stepper with min/max; currency + week/month/year; zip 5 digits; text with counter). Sends via `useAnswer()`. Shared by ask box, answers sheet, chat. |
| `wallet-box.tsx` | `renderAside` wallet | Kinds from `walletKinds`, "in N steps". |
| `spotlight.tsx` | `spotHTML` | See §3 mapping. Footer: primary action + Mark done. Shows `verified_on` + "Only the agency can approve you." |
| `sheets/needs-sheet.tsx` | needs picker | 15 real needs grouped (Everyday / Home & safety / Health / Family / Money & work), search, "Tell us in your own words" → chat. |
| `sheets/answers-sheet.tsx` | answers | `answered[]` rows, source badge, inline edit, Start over (`restart()` + `clearDevice()`). |
| `sheets/upload-sheet.tsx` | upload | pick (file input or demo paper) → reading (`readPaper(file, kind)`) → check (that paper's `pending_review` rows, ticks/edits → `submitReview`) → done (reuse list). Saves blob in paper-store, marks `plan.docs`, stores identity in details-store. |
| `sheets/bank-sheet.tsx` | bank | consent (persona picker, default first persona, "Simulated") → reading (`submitEvidence`) → check (simulated review card + bills) → done. Disconnect from tile. |
| `sheets/form-sheet.tsx` | form | helper gate (device switch) → readiness (`ReadinessCard`) → run (`ApplyAssistant` restyled: steps feed the field list animation, `needs_answer` → `QuestionInput`, `needs_you` → hand-off panel / live view) → sent (`applications` updated → `refresh()`). |
| `sheets/chat-sheet.tsx` | chat | `interpretMessage` (question `needs`) → "Here is what I heard" from `answer` + `proposed` → Add to my plan → answers posted in order → "Added N steps" from programs diff; safety card from `safety_contacts`; "pick" fallback when nothing matched. |
| `sheets/paper-sheet.tsx`, `sheets/counter-sheet.tsx` | viewer, counter | Blob preview, used-in list, replace/remove; counter = full-screen large type, confirmed details only. |
| `papers-view.tsx` | `renderPap` | Replaces `wallet-view.tsx` UI; keeps its logic. |
| `lib/hub-derive.ts` | `active/pips/primary/caseOf/usedIn/missingDocs` | Pure selectors (below). |

### `lib/hub-derive.ts`

```ts
type HubStep = {
  card: ProgramCard; action: ActionItem | null;
  kind: "gov" | "local"; fit: "likely" | "open" | "possibly" | "need" | "later";
  lane: "today" | "week" | "later"; deadline: boolean; urgent: boolean;
  need: string | null; docs: string[]; pips: Pip[]; primary: Primary | null; done: boolean; sent: boolean;
};
hubSteps(s, plan, device): HubStep[]      // live programs, ordered by rank, laned by action.horizon
caseOf(s, plan, online): Case             // §6
usedIn(kind, steps): HubStep[]            // "counts in N steps"
missingKinds(steps, plan): string[]
nextUp(steps): HubStep | undefined        // first not-done by lane, deadline first
toldNeeds(s, steps): { id; label; count }[]
progress(steps): { done; total; open: number }   // drives meter + door
```

Keep existing `derive.ts` helpers; `hub-derive` builds on them. Delete `planItems`'s 6-item cap
use from the hub (the lanes show everything live).

### Archived, not deleted

No longer used by the live app, but left in the repo and kept compiling: the old page files (moved
to `_archive/`), `shell/app-shell.tsx`, `shell/nav.ts`, `shell/page-head.tsx`,
`shell/theme-toggle.tsx`, `home/home-view.tsx`, `benefits/benefits-view.tsx`,
`benefits/guide-view.tsx`, `local/local-view.tsx`, `about/about-view.tsx`, `bank/money-view.tsx`,
`documents/wallet-view.tsx`, `program/drawer.tsx`, `program/program-card.tsx`. Each gets a one-line
header comment: "Archived: not routed. The live UI is components/hub/." If a contract change (B1/B2)
breaks one, fix it minimally so lint and typecheck stay green. **Reused by the hub**: `apply-assistant` logic, `readiness-card`,
`paper-review`, `evidence-cards`, `paper-store`, `details-store`, `web-resources`,
`loop/agent-flow-mini`, `how-we-checked` (inside spotlight "How we checked this"), guide logic
from `guide-view` (`guideNotes`, `tailoring`).

## 6. Cases

| Case | Condition (first match wins) | Real signal |
|---|---|---|
| `loading` | building or re-running | `snapshot.busy` or `phase ∈ {discovering, evaluating, planning}` with no programs yet |
| `offline` | no connection | `navigator.onLine === false` or the last poll failed with a network error; the in-memory snapshot stays readable (nothing new is persisted — decision D4) |
| `nomatch` | outside covered area | `coverage === "unsupported"` → banner built from `regions.json` coverage (today: 25 Hampshire County ZIPs only — the artifact's "Franklin, Hampshire and Hampden" copy is wrong and must not be ported). "Change my zip" opens the zip answer. |
| `empty` | nothing to show | no needs answered or no live programs → "Talk it through" / "Pick from a list" |
| `done` | every step done | all `HubStep.done` |
| `urgent` | an open deadline step | any open step with `deadline` → urgent banner + "Do it now" |
| `waiting` | sent, nothing today | any `applications` submitted and no open `today` steps |
| `start` | default | |

The artifact's "preview this case" (`S.force`) is library-only and is not ported.

## 7. Phased execution

Each phase ends green on `.venv/bin/pytest` (backend) and `npm run lint && npm run typecheck`
(frontend), and is demoable on its own. Work on a branch (`c/plan-hub`).

### Phase 0 — Setup and decisions (½ day)
- Branch. Confirm decisions D1–D6 (§8).
- Save the artifact HTML to `docs/ui-reference/opendoor-plan-hub.html` as the visual reference
  (with the Assets & states view noted as out of scope).
- Agree contract changes B1/B2 with whoever owns `state.py`/`schemas.py`/`types.ts`.

**Done when:** reference file committed, decisions recorded at the top of this doc.

### Phase 1 — Shell, look and routes (1 day)
- `paper-scope.tsx` shared by both layouts; `hub.css`, `hub-defs.tsx`.
- `HubShell` (pill nav, footer, Leave quickly, toast dock) replaces `AppShell` in `(app)/layout.tsx`.
- `HubProvider` (sheet/spot/filter state, Escape, scrim, focus handling).
- `/home` → `PlanHub` skeleton, `/papers` page.
- Move the old page files to `app/(opendoor)/_archive/` (§5), add the redirects, add the
  "Archived" header to each retired component.
- Gate unchanged: no intake → `/start`; onboarding still lands on `/home`.

**Done when:** landing → onboarding → `/home` shows the paper look (light only, whatever the
system theme) with the hero, told chips and a plain list of live programs; old URLs redirect; no
sidebar anywhere; the archived files still pass lint and typecheck.

### Phase 2 — The plan, fully derived (1.5 days)
- **B1** backend `horizon`/`deadline` + tests + fixture regen + `types.ts`.
- `hub-derive.ts` (`hubSteps`, `caseOf`, `nextUp`, `progress`, `usedIn`).
- Step card, slim row, pips (papers/income/form states only — actions wired in later phases
  open their sheets), next card, lanes, Gov/Local filters, "Show what helps with" need filters,
  banners, empty filter state, cases + hero copy, meter + door opening with progress.
- Mark done (device `toggleDone`), "Sent by you" from `applications`.
- Programs moved by an answer flash (`useAnswer().moved`).

**Done when:** with the curated programs and the demo persona answers, the plan matches the
artifact's structure: a shutoff answer puts Fuel Assistance/shutoff help under **Today** with the
urgent banner; marking steps done fills the meter and swings the door.

### Phase 3 — Questions, answers and needs (1 day)
- `question-input.tsx` for all six types; `AskBox` from `open_questions[0]` ("n of N", Skip).
- Answers sheet: rows from `answered[]`, source badges, inline edit, Start over.
- Needs sheet: 15 real needs, search, add/remove = `needs` edit; told-chip × removes a need.
- Card link "Answer 1 question to settle this" → answers sheet at that question (`asksFor`).
- B3 test: editing `needs` after intake adds/removes programs.

**Done when:** every question the backend can ask renders and saves in the ask box and in My
answers; adding "Pregnancy or a baby" adds WIC with a toast built from `last_change`.

### Phase 4 — Spotlight (1 day)
- `spotlight.tsx` from `program.guide` + `assessment.checks` + documents (§3).
- Glance: Cost / Decision / Best way / Papers n of m. Ways with `tel:` and `apply_url` links.
- "Bring": missing kinds open the upload sheet. "If they say no", "One yes can open more",
  conditional notes, safety note, "How we checked this" (`how-we-checked.tsx`), source link +
  `verified_on`. Programs without a guide get the fallback layout.
- `?spot=` deep link; `/benefits/[slug]` redirect lands here.

**Done when:** every curated program opens a spotlight with no invented facts (spot-check against
`backend/app/data/programs/*.json`).

### Phase 5 — Papers (1.5 days)
- Wallet box in the aside; "Add a paper once" tile.
- Upload sheet on the real Document Agent: file or demo paper (`public/demo-papers/maya` via
  `manifest.json`) → `readPaper(file, kind)` → review rows → `submitReview` → done with the
  "now counts in N steps" list. Conflicts (`in_conflict`) shown and must be resolved.
- Papers view: Form helper switch, saved/needed cards, per-paper "helper reads" switch,
  "Going to an appointment?" pack, privacy line; paper viewer and counter sheets.
- Port behaviour from `wallet-view.tsx` into shared hooks; the old view stays archived.

**Done when:** adding the demo pay stub confirms income (income pips go green on every step that
needs it), the paper survives a reload (IndexedDB), and removing it clears it from the device.

### Phase 6 — Bank (½ day)
- Bank sheet: consent → `submitEvidence(persona)` → simulated review card (income, rent, overdue
  bills from `financial_summary`) → confirm → done. Lone `bank_suggestions` offered as one tap.
- Tile shows "Income confirmed · read-only · Simulated" and Disconnect (`disconnectBank`).

**Done when:** connecting the demo persona confirms income, and disconnecting removes everything
read from it (snapshot + tile state).

### Phase 7 — Fill the form for me (1.5 days)
- Form pip + primary only for `automatable_program_ids`; blockers first (papers/income), then
  "Fill my form", then "Review and send it yourself".
- Form sheet: helper gate → `ReadinessCard` (`getReadiness`) → `ApplyAssistant` restyled to the
  artifact's browser card (field rows tick from `RunView.steps`; "You do: sign" row on the
  `submit`/`attestation` hand-off; live view or frame) → sent. `refresh()` on `result_recorded`.
- "What the helper did" log on Papers (counts and paper kinds only).
- Programs that are not automatable: primary = best guide way (Apply online / Call).

**Done when:** in practice mode, Fuel Assistance fills end to end, stops for the person to press
Send, and the card shows "Sent by you" with the meter advanced.

### Phase 8 — Talk it through (1 day)
- **B2** backend `proposed` follow-ups + tests.
- Chat sheet on `interpretMessage` (question `needs`): heard card (needs + facts, checkboxes),
  quick-reply follow-up when a key fact is missing (renders that question's options), safety card
  from `safety_contacts` (shown first, independent of matches), "pick" fallback, off-topic reply.
- Add to my plan posts needs then each proposal; "Added N steps · Most urgent: …".
- Entry points: hero CTA (empty case), needs sheet link, "+ Add a problem".

**Done when:** the artifact's tour sentence produces Utilities + Food (+ Pregnancy & baby), a
shutoff fact and a child-under-5 fact; adding them puts the shutoff step first.

### Phase 9 — Watch demo (1.5 days)

The artifact's 70-second tour, kept and always visible in the nav. In the artifact it wipes the
state and fakes every step. In the app it drives the **real** UI and backend, so it must never touch
the person's own plan.

- **Throwaway session.** `useSession` gains `beginDemo()` / `endDemo()`: create a new session
  without writing it to `crn.session_id`, swap it in, and on Stop / finish / Escape / page leave swap
  the person's session back (`refresh()` it). Plan state, papers and details use the demo session id,
  so the person's device data is untouched; demo papers are cleared on exit.
- **Precondition:** the demo session is answered up to `coreDone` with the demo persona answers
  (ZIP 01002, household 1, the persona's needs left empty so chapter 1 adds them), posted through
  the normal answers endpoint before chapter 1 starts.
- **Port the tour engine** (`components/hub/tour/`): doodle cursor + trail, `moveTo`/`glide`/`tap`/
  `typeIn`, ink annotations, tour bar with chapter number and progress, Stop / Replay / Try it,
  reduced-motion timing. Targets use stable `data-tour="…"` attributes instead of class selectors.
  A shield blocks the person's clicks while touring.
- **Chapters on real data:**
  1. Say it in words → chat sheet, types the sentence, sends (`interpret`).
  2. It listens → heard card (needs + proposed facts from B2), Add to my plan.
  3. One plan, in order → hero, told chips, the deadline step first (B1 `deadline`).
  4. Know what to do → spotlight of that step: glance, ways, If they say no; Mark done.
  5. Papers, once → upload sheet with the demo `electric-bill` paper → review → "counts in N steps".
  6. No typing income → bank sheet with the first simulated persona → confirm.
  7. She presses Send → form sheet on Fuel Assistance in **practice** mode; stops at the hand-off.
     The tour presses Send itself only on our practice form, never on a real site. If the browser
     assistant is off (`automatable_program_ids` empty), the chapter shows the readiness card and
     says the assistant is off on this server.
  8. The door opens → marks the remaining steps done (demo session only), door swings open.
- Each step waits on real conditions (`whenIdle`, the element appearing) with a timeout; on a
  timeout or error the tour stops cleanly and restores the person's session with a toast.
- "Try it" ends the tour and returns to the person's own plan (or to `/start` if they came from
  the landing page without an intake).

**Done when:** the tour runs start to finish against `PROGRAM_SOURCE=curated` in LLM-off mode, and
afterwards the person's own plan, papers and answers are exactly as before (checked by comparing
the snapshot and device state before and after).

### Phase 10 — States, polish, archive (1 day)
- Acceptance checklist (from the Assets & states page): all 8 cases, empty plan, empty filter,
  no papers, three banners, loading skeletons, every QuestionType, every chat message kind.
- Unverified web resources section under the lanes ("Other places to look · not checked"),
  never with a fit badge.
- Mobile (≤760px: 2-col rooms, bottom-sheet spotlight, stacked aside, tour bar compact), reduced
  motion, focus order, `aria-live` on toast and chat, keyboard for all switches.
- `?demo=1` keeps "Agents at work".
- Confirm nothing live imports an archived component; update README (routes, `/papers`, archived
  pages, Watch demo) and `docs/demo-script.md`.

**Done when:** checklist passes on desktop and phone widths; lint, typecheck and pytest green.

Estimated total: **~11.5 working days** for one person; Phases 4–6 can run in parallel with 7–8
once Phase 3 lands. Phase 9 needs Phases 5–8.

## 8. Decisions

Confirmed:

- **D1 Theme:** light only, like the front pages. No theme toggle, no dark tokens.
- **D3 Old pages:** kept in the repo, archived out of the routed tree, URLs redirect into the hub
  (§5). Not deleted.
- **D5 Watch demo:** kept, visible in the nav, running on a throwaway session (Phase 9).
- **D6 Step time estimates:** not shown anywhere. The spotlight glance uses "Best way".

Still open (recommendation in bold):

- **D2 Needs list:** **show the 15 backend needs**; drop clothing / lost ID / debt. Adding them
  later means curating programs first.
- **D4 Offline:** **in-memory only** (no snapshot cached on disk, consistent with "device storage
  never holds answers"). The offline case says "Your plan stays on screen while this page is open."

## 9. Guardrails carried over

- Never port the artifact's invented facts (phone numbers, decision times, "About 20 minutes",
  sample names/amounts). All program facts come from `backend/app/data/programs/`.
- Eligibility stays *potential*: keep "Only the agency can approve you" on cards and spotlight.
- Papers, identity details, plan progress stay on the device; nothing new in logs.
- Bank data is always labelled **Simulated**.
- "We never press Send for you": the run must hand off on `submit`.
- Chat output is a proposal until the person taps Add; safety lines come only from curated records.
