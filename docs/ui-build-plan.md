# OpenDoor: Demo-to-App Build Plan

> **Status (2026-11-14): Phases 0-5 done.** See "Build log" at the end for what changed, deviations and open items.

Source of truth for the look and behavior: the "OpenDoor Welcome Flow" artifact (claude.ai/artifact/UjUZ8vsSvz7kbsUQ1MB6bM).
Companion to `docs/foundation-plan.md` (architecture). This plan covers only the product shell, UX and the contract changes needed to support it.

**Hard rule: no backend deletion.** Every agent, graph node, service and test stays. Anything the new UI does not use today (documents upload, Nessie sandbox, activity panel, LLM wording) is kept behind the same endpoints and gets a home in the new UI where it fits (Phase 6), or stays dormant.

---

## 1. What the demo is

A single-page app with three pre-app screens and a six-page dashboard.

| Screen | What it does |
|---|---|
| **Welcome** | Language chips (English live, others "Soon"), optional first name, "Get started", "Try a sample" (Maya). Animated house/door art. |
| **Intake** | Exactly 3 core questions, one per screen: needs (multi-select), ZIP, household (stepper + who's at home). Right rail shows "programs in view" counter and a "what we heard" profile. |
| **Building** | ~2s staged checklist (read programs, check ZIP, sort gov vs local, find the few questions that matter), then lands on Home. |
| **Home** | Greeting, one **next step** hero, "After that" plan list, two path cards (Government benefits / Local help), an at-a-glance strip (next question, next open hours, documents ready). |
| **Government benefits** | "How it works" 4 steps, benefit cards (status, deadline, cost, who decides), start the step-by-step **Guide**. |
| **Guide** (per benefit) | 5 sections: check if you may qualify, gather documents, apply (ways, best first), questions to ask them, track the decision (gather, applied, approved, denied). Also unlocks and "if denied" chains, a call script, safety notes. |
| **Local help** | Programs grouped by how you get them (walk in, register, call, short application), week-hours calendar. |
| **Documents** | Wallet: one entry per kind of paper, mapped to every program that needs it, readiness per program, "I have this" toggles. |
| **About you** | Every answer, its source, edit any one. |
| **Drawer** | Program detail: status, reasons (pass / ask / fail / later / note), requirements with source links, contact, verified date. |
| **Sharpen** | The adaptive loop made visible: the one highest-value unanswered question, how many programs it affects, shown on Home and inline on "one question away" program cards. Toast says what moved after each answer. |

Statuses: `Likely fit`, `Open to everyone`, `One question away`, `Opens later`, `You have this`, `Not a fit right now`. Eligibility language stays *potential*.

## 2. How the demo differs from our backend (the real work)

The demo is client-only: rules are hand-coded JS, state is `localStorage`, and the user can answer questions in any order from anywhere. Our backend is the opposite on three points. These gaps drive the phases.

| # | Demo behavior | Backend today | Resolution |
|---|---|---|---|
| G1 | Asks 3 core questions, then lets user answer any open question from anywhere (inline on cards, Home, drawer, About) | One `pending_question`; `submit_answer` returns `stale_question` for anything not already asked | Expose an **open question queue** (ranked, with the program ids each affects) and allow answering any registered question in it. Keep `pending_question` as the head of that queue so the one-at-a-time contract and old tests still hold. |
| G2 | Rules (income bands, ZIP lists, benefits-held, RAFT "what for", etc.) live in the browser | Eligibility agent evaluates sourced `requirements` deterministically | **Eligibility stays on the backend.** Port each demo rule into program `requirements` (typed where possible) and the question registry. The demo's JS is a spec, not code to ship. |
| G3 | "Government benefits" vs "Local help" split, step-by-step guides, documents wallet, hours calendar, application tracking | `Program.type` is provider type (government/community), not the user-facing track; no guide, hours, or doc-kind data | Add sourced **`track`**, **`guide`**, **`hours`**, and **`document_kinds`** fields to the program JSON. Facts come only from `backend/app/data/programs/` (guardrail), never generated. |

Other differences to settle explicitly:

- **Income question.** Demo uses household-size-specific bands drawn from published cutoffs. Backend uses a `monthly_income` currency question. Decision: add a band question (`annual_income_band`) whose options are generated from the programs' own income tables for the household size; keep `monthly_income` working for the Nessie evidence path.
- **Questions the demo has that the registry lacks:** `benefits_held`, `home_tenure` (rent/own/none), `utility_company`, `umass_affiliation`, `disability_bus`, `near_bus_route`, `college_student`, `raft_use`. Existing registry ids stay; new ones are added.
- **Demo-only shortcuts we will not copy:** Maya's prefilled sample must go through the real API (answer the 3 core questions programmatically), never fake state. Browser `localStorage` holds only UI conveniences (see §4).
- **State rule:** CLAUDE.md says no database and one session never reads another's. Application stage, "I have this" documents and "mark done" are per-session UI state. They live in `sessionStorage`/`localStorage` on the device, are never sent to logs, and are labeled "saved on this device only" exactly as the demo does. If we later want them server-side, they ride on the session snapshot, still in-memory.

## 3. Target architecture

```
frontend/src
  app/
    layout.tsx                  fonts (DM Sans, Manrope), theme tokens
    page.tsx                    gate: no session -> Welcome, else App
    (app)/                      dashboard routes, hash-free: /, /benefits, /benefits/[slug], /local, /documents, /about
  components/
    welcome/                    welcome-screen, house-art, language-chips
    intake/                     core-question screen, in-view counter, heard-card  (reuse question-card.tsx)
    building/                   building-screen
    shell/                      sidebar, mobile header + bottom tabs, crumb, toast, drawer
    home/                       next-step-hero, plan-list, path-cards, glance-strip, sharpen-card
    benefits/                   benefit-card, how-it-works, guide/* (5 sections)
    local/                      access-groups, week-calendar
    documents/                  wallet, readiness-list, doc-card
    about/                      answers-list
    program/                    program-card (unified), program-drawer, status-pill, reasons-list
  lib/
    types.ts                    contract (mirror of schemas.py), coordinate
    derive.ts                   pure selectors: plan items, next step, guide readiness, week events, doc wallet
    device-state.ts             typed, try/catch wrapper over storage for applications/docs/done
  hooks/use-session.ts          kept; extend with open_questions
```

Principles:

- **Backend computes, frontend selects.** Statuses, reasons, "asks", ordering and the question queue come from the snapshot. `derive.ts` only groups and orders what the backend already decided (plan list, wallet aggregation, week calendar), so it is unit-testable without a server.
- **Design system.** Port the demo's tokens (`--paper`, `--accent`, `--gov`, `--loc`, peach/lav/sky/leaf/amber category colors, light + dark) into Tailwind v4 theme variables in `globals.css`, then build shadcn/ui primitives on them. No ad hoc hex values in components.
- **Next.js 16.** `frontend/AGENTS.md` warns APIs differ. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing routes, layouts or data fetching.
- **Accessibility is part of "done":** focus rings, `aria-pressed` on option chips, `prefers-reduced-motion` (demo already shortens the building sequence), live-region for the toast, drawer focus trap, 16px gutters, usable at phone width with bottom tabs.

## 4. Contract changes (coordinate before editing)

Per CLAUDE.md these files change only in a small standalone commit, announced to the team, both sides together: `graph/state.py`, `graph/build.py`, `api/schemas.py`, `frontend/src/lib/types.ts`. Sync `snapshot.json` via `npm run sync:fixture`.

Additive only; no field is removed or renamed.

**Program (data + `state.py` + `types.ts`)**
- `track: "benefit" | "local"` (user-facing split; `type` unchanged).
- `access: "walk_in" | "register" | "call" | "apply"` (local grouping).
- `hours: [{days, start, end, note, source_url}] | null` (null = unknown, never "always open").
- `guide: {what, decides, when, cost, ways[], ask_them[], unlocks[], if_denied[], safety, source_url} | null` (benefits only; every line sourced).
- `document_kinds: string[]` aligned index-for-index with `documents_needed` (replaces the demo's `DOCMAP`).
- `requirements[].applies_if`: optional condition on a question answer (covers "renters need lease", "homeowners only", "college students").

**Snapshot (`schemas.py` + `types.ts`)**
- `open_questions: [{question, affects: program_id[], rank}]`, head equals `pending_question`.
- `ProgramCard.assessment.checks[]`: typed rows `{kind: pass|ask|fail|later|have|note|unsure, text, question_id?}` (the demo's reasons list). Existing `criteria` kept for compatibility.
- `ProgramCard.status_label`-free: label text is a frontend concern, status enum stays the contract.
- `last_change: {moved_to_fit[], opens_later[], no_longer_fit[]}` after each answer (powers "Got it. 2 moved to likely fit").
- `AnswerIn` accepts any `question_id` present in `open_questions`; `stale_question` still guards everything else.

## 5. Phases

Each phase ends with a demoable exit criterion and green checks: `.venv/bin/pytest` in `backend/`, `npm run lint && npm run typecheck` in `frontend/`. Streams follow the ownership table in `foundation-plan.md` C.3 so teammates do not collide.

### Phase 0: Alignment and spec lock (0.5 day)
- Freeze the demo as the visual/behavioral spec; export screenshots of every screen (light + dark, desktop + phone) into `docs/ui-reference/`.
- Review and approve §2 resolutions and §4 contract list with the team (single PR touching only docs).
- Decide the two open items: income-band question shape; whether device-state stays device-only (recommended: yes).
- Branch plan: one `feat/ui-*` branch per phase.
- **Exit:** contract list approved; no code changed.

### Phase 1: Design system and app shell (Stream C)
- Tailwind v4 tokens, DM Sans/Manrope, light/dark, shadcn primitives restyled (button variants incl. `gov`, ghost, text; pill; chip; card; progress bar; ring; drawer/sheet; toast).
- Shell: desktop sidebar (Home, Government benefits, Local help, Documents, About you, count badges, mini-profile, help card), mobile header + bottom tabs, crumb, routing for `/`, `/benefits`, `/benefits/[slug]`, `/local`, `/documents`, `/about`.
- Run entirely against `lib/fixtures/snapshot.ts`; existing intake/results components remain mounted at a temporary `/legacy` route so nothing is lost while the new UI is built.
- **Exit:** every dashboard route renders from the fixture with correct nav state, theming and mobile layout.

### Phase 2: Welcome, 3-question intake, Building (Stream C, small Stream D)
- Welcome screen (language chips with "Soon", name, sample button wired to the real API, door-opening transition honoring reduced motion).
- Intake: one core question per screen using the existing `/sessions` + `/answers` flow (needs, ZIP, household). Household becomes a stepper + "who's at home" chips; backend registry gets `household_size` stepper rendering and the age/child facts it needs (small Stream D change, no contract break).
- Right rail: "programs in view" count (from snapshot, falls back to program total) and "what we heard" from `profile_summary`.
- Building screen driven by real `agent_statuses`/`phase` polling, with the staged copy as the minimum display time. Never a fake spinner that outlasts the backend.
- ZIP outside the supported region: show the demo's warning callout using `coverage`/`region`.
- **Exit:** fresh visit, answer 3 questions, land on a (still basic) Home with real backend results. Refresh restores the session; expired session returns to Welcome with a clear message.

### Phase 3: Contract extension and data enrichment (Streams A, B, D; sequential merges)
This is the critical path; the UI beyond Phase 2 depends on it.
1. **A:** standalone contract commit (§4) with `open_questions`, typed `checks`, `last_change`, any-open-question answering. Update `snapshot.json`, run `sync:fixture`, extend `test_contracts.py` and `test_api.py` (answering an open question out of order; stale ids still rejected; 409 while busy unchanged).
2. **D:** add the eight missing questions to `graph/questions.py` plus the income-band question; Administrator ranks the queue by number of live programs affected (the demo's `questionQueue` rule), tie-broken by registry order.
3. **B:** port the demo's 23 rule sets into sourced `requirements` and Eligibility logic (ZIP lists, income tables per household size, benefit-unlocks like weatherization needs Fuel Assistance, crisis rules, "later" status). Every ported rule gets a test.
4. **B:** enrich the 23 program JSON files with `track`, `access`, `hours`, `guide`, `document_kinds`, with `verified_on` and `source_url` per fact; second-person source review for each guide (these are the highest-stakes copy). Where a source is silent, store `null`; the UI shows "not listed, call to ask" instead of a guess.
5. Parity test: for the demo's sample (Maya, 01002, household 2 with a senior, food + utilities) and three more personas, backend statuses equal the demo's statuses program by program. Differences are either fixed or documented as intentional.
- **Exit:** a pytest parity suite passes; snapshot exposes everything Phases 4-5 need; `LLM_MODE=off` still fully works.

### Phase 4: Home, Benefits, Guide, Local (Stream C)
- **Home:** next-step hero (resume in-progress guide, else first plan item, else best open question, else "all caught up"), "After that" list with expand, path cards with counts, glance strip.
- **Sharpen card + inline questions:** the highest-ranked `open_question` with "affects N programs" and the why-line; inline chips on "one question away" cards; one shared `useAnswer` hook that sends the answer, then renders the `last_change` toast and the 2.6s "moved" highlight.
- **Government benefits:** explainer, benefit cards (status, when, cost, who decides), filters.
- **Guide:** the 5 sections from `program.guide` and the assessment, including emergency callout, ways to apply (best first, copyable phone chips), call script, ask-them list, track stages, unlocks / if-denied chains. Tailoring questions (`college_student`, `home_tenure`) appear inline as `open_questions` filtered to that program.
- **Local help:** grouped by `access`, week calendar from `hours` (unknown hours omitted, with an honest note), call chips.
- **Program drawer:** reasons list, requirements with source links, contact, verified-on date, one inline question.
- Disclaimer on every status surface: potential eligibility, not official.
- **Exit:** the demo flow works end to end on real data: answer a sharpen question and watch programs move, open a guide, mark applied, see Home update.

### Phase 5: Documents wallet, About you, device state (Stream C)
- `device-state.ts`: typed storage wrapper (try/catch, per-session key, cleared on restart) for application stage, "I have this", and "mark done". No document content is ever stored, only booleans and ids.
- Documents wallet built from `document_kinds` aggregation: readiness per program, filters, per-kind tips from sourced `documents_needed` text, conditional docs ("if you rent") shown while the tenure question is unanswered.
- About you: every `answered` item with source badge (`provenance`), edit via the shared question card, skipped answers re-askable; edits invalidate and refresh results using existing backend invalidation.
- Home/glance/nav badges read the wallet counts.
- **Exit:** wallet, About and Home agree after any change; reload keeps device state for the same session only.

### Phase 6: Reconnect the dormant backend (Streams C, D)
Nothing is deleted; this phase decides where each existing capability appears.
- **Documents upload (`services/documents.py`, `/documents`):** an optional "Add a document so we can fill in answers" card on About you and in the wallet. Keeps the consent gate and `unsupported_file` handling; extracted facts show provenance `document_extracted`, never auto-confirmed.
- **Nessie sandbox (`services/nessie.py`, persona endpoints):** optional "Use a sandbox profile" under About you, clearly labeled simulated, consent required. Core flow must pass with it unconfigured (existing test).
- **Activity panel / agent statuses:** surface as a collapsible "How we checked this" in the drawer and building screen, showing agent steps without answers or documents.
- **Action planning agent (`agents/action_planning.py`):** its ranked `action_plan` feeds the Home "next step" and "After that" list; the demo's `rule.step` strings become `ActionItem.next_step`/`rationale` templates in the agent, so ordering logic lives in one place.
- **LLM wording (`services/llm.py`, `llm_guard.py`, `wording.py`):** stays optional and guarded, only rewording sourced text, never facts. Off by default in tests.
- Retire `/legacy` once every legacy component has an equivalent or a documented reason to drop it (components themselves may be deleted; backend may not).
- **Exit:** every backend endpoint is reachable from a UI surface or explicitly documented as API-only in the README.

### Phase 7: Hardening and demo readiness (all)
- Negative cases: out-of-region ZIP, all answers "not sure", skip everything, session expiry mid-flow, backend down, busy 409/202 handling, stale question.
- Privacy audit against the guardrails: no SSNs, no answers/documents/transactions in logs (`log_safety.py` tests), secrets only in `backend/.env`, untrusted text rendered as text (no `dangerouslySetInnerHTML`; the demo's `esc()` becomes React's default escaping), cross-session isolation test.
- Accessibility pass (keyboard-only run through all screens, screen-reader labels, contrast in both themes, 200% zoom, phone width).
- Performance: poll backoff, avoid refetching programs per answer, no layout shift on status changes.
- README: commands, paths, and the new route map kept in sync; update `docs/demo-script.md` to the new flow; add the deployment/run steps verified on a fresh clone.
- Three clean consecutive runs of the demo script.
- **Exit:** all acceptance tests green; fresh-clone README check passes.

## 6. Acceptance checklist

1. Fresh visit shows Welcome; 3 questions later the user sees results derived from the backend, with no fabricated program facts.
2. Any status or guide line traces to `backend/app/data/programs/` with a verified date; unknowns display as unknown.
3. Answering any open question (Home, inline card, guide, About) updates statuses and shows what moved.
4. Government benefits show a working 5-section guide; Local help shows grouped access and hours; Documents wallet reflects all live programs.
5. Light and dark themes, phone and desktop layouts, reduced-motion all verified.
6. Optional integrations (LLM, Nessie, upload) off by default; core flow passes without them.
7. `pytest`, `npm run lint`, `npm run typecheck` pass; `README.md` matches reality.
8. No backend agent, graph node, service or test removed.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Demo rules diverge from backend rules (silent wrong statuses) | Phase 3 parity suite against the demo's own sample personas before any UI depends on it |
| Guide copy contains unsourced advice | `guide` fields require `source_url` + `verified_on`; second-person review; null over guess |
| Contract changes block teammates | One additive standalone commit, fixture-first so Stream C is never blocked; Phase 1-2 need no contract change |
| Any-question answering weakens one-at-a-time promise | `pending_question` stays the queue head; UI shows only one sharpen question at a time |
| Next.js 16 API differences | Read bundled docs before routes/layouts; keep routes simple |
| Device-only state surprises users | Always labeled "saved on this device only"; cleared on restart |
| Scope creep (translations, maps, accounts) | Out of scope: other languages ("Soon" chips only), map view, accounts, database, live web discovery |

## 8. Suggested order if time is short

Phases 0-2, then Phase 3 steps 1-3, then Phase 4 Home + one Guide (Fuel Assistance) + Local, then Phase 5 wallet. Phase 6 and the remaining guides follow. This gives a believable demo of the whole experience with the adaptive loop fully real.


---

## 9. Build log (Phases 0-3)

**Phase 0.** Demo saved as the spec at `docs/ui-reference/opendoor-demo.html` (screenshots not taken: the artifact needs a signed-in browser). Decisions taken: income becomes yearly bands built from the programs' own tables (typed `monthly_income` still works, preferred when confirmed); application stage / "I have this" / "mark done" stay device-only.

**Phase 3 (backend, all additive).**
- Core questions are now `needs`, `zip`, `household_size`, `household_who`; household questions are skipped when nothing matched (outside coverage). Results appear right after.
- `open_questions` (ranked, with the program ids each affects; head = `pending_question`), typed `checks` per program, `last_change`, any follow-up answerable out of order (core/confirmation questions still need to have been asked).
- Eligibility: OR-groups, `on_unmet` (`later`/`note`), `needs_any`, `info` requirements, "not sure" answers, `held_benefit`, band-based income; new statuses `already_receiving`, `opens_later`.
- Questions added: `income_band`, `benefits_held`, `utility_issues`, `housing_need`, `eversource_customer`, `umass_affiliation`, `disability_bus`, `near_bus_route`, `college_student`, `raft_use`. Old questions stay in the registry. The `employment` need option was removed (no programs).
- All 23 program records ported: `track`, `access`, `hours`, `guide` (8 benefits), `first_step`, `document_kinds`, `held_benefit`, structured requirements. Provider text and URLs untouched.
- **Parity:** `tests/test_ui_parity.py` replays 6 personas through the API; expected statuses come from running the demo's own rule code (`tests/fixtures/demo_parity.json`). All match except two documented divergences: Highland Valley "benefits support" and "information & referral" are *call to confirm*, because the provider pages do not state who qualifies (rules marked unverified) where the demo said yes/no.
- Known data differences: weatherization and heating repair also list the housing category (demo: utilities only); the demo's pantry ZIP list is longer than the curated record's.
- Tests: 285 pass (was 263). `scripts/make_snapshot.py` regenerates the contract fixture from real data.

**Phase 1.** Palette ported to Tailwind v4 tokens (light, dark, shadcn tokens mapped); DM Sans + Manrope; app shell (sidebar, mobile header + bottom tabs, toast); routes `/home`, `/benefits`, `/benefits/[slug]`, `/local`, `/documents`, `/about` (placeholders reading the snapshot). Deviation: secondary text is darker than the demo's for AA contrast. `NEXT_PUBLIC_UI_FIXTURE=1` runs the UI from the canned snapshot with no backend. The old UI is at `/legacy`.

**Phase 2.** `/` is the front door: Welcome (language chips, name kept on device, "Try a sample" through the real API), the 3 core questions, Building (never outlasts the backend), then `/home`. Refresh resumes; an outside-coverage ZIP shows the backend's notice instead of asking more.

**Open items:** Phase 6-7 as planned; real screenshots for `docs/ui-reference/`; teammates should review the contract commit (`state.py`, `schemas.py`, `types.ts`, `snapshot.json`).

### Architecture review (after Phase 3)

Fixed:
- **One source of truth for "why" lines.** Eligibility now emits `checks` (`CheckLine`) on each assessment; the API only maps a missing field to its question. The view no longer re-implements group logic (it used to, and could pick a different deciding rule).
- **No side effects in the snapshot builder.** `last_change` is computed by `SessionManager` when a run finishes; `build_snapshot` only reads it.
- **Follow-ups are accepted only once intake is over and results exist** (they used to be accepted from the first screen).
- **Sourcing:** the Eversource income amounts now cite where they come from (the Good Neighbor Energy Fund's 60% SMI table) in the record's text.
- **Frontend:** the session provider moved into the `(opendoor)` route group, so `/legacy` no longer runs a second poller on the same session; "wait for the backend" lives in `useSession().whenIdle()` instead of a component loop; focus moves to each new question (to the ZIP field on the ZIP step); dead code removed.
- Verified with a production `next build` (cache components + client `use(params)`) and a manual run through the real API.

Known, accepted for now: the legacy intake still runs its own session hook (removed when `/legacy` retires in Phase 6); `BACKEND_URL` is read at build time by `next build` (documented in the README).

### Phase 4 (frontend only, no contract change)

- **Home** (`components/home/`): next-step hero (resume a started guide, else first plan step, else best open question, else all caught up), "After that" list with show-all, path cards with live counts, Sharpen card (head of `open_questions`, "affects N", skip when skippable), glance strip (next question, next posted hours, documents ready), out-of-coverage callout with "Change ZIP".
- **One answer path** (`components/session/answer-provider.tsx`): every surface answers through `useAnswer()`, which waits for the backend, toasts from `last_change` ("Got it. 2 moved to likely fit...") and highlights moved cards for 2.6s. Rejected answers are toasted once.
- **Program card + drawer** (`components/program/`): unified card with inline chips for "one question away" (single choice answers on tap; multi choice opens the drawer); drawer with focus trap, Escape, reasons, one inline question, next step, hours, contact, documents, unknowns, sourced rules, verified date.
- **Government benefits** (`components/benefits/benefits-view.tsx`): how-it-works, benefit cards (status or stage, who decides, questions/documents/when meters), need filter, "One yes opens more" from `guide.unlocks`, "Not a fit right now".
- **Guide** (`components/benefits/guide-view.tsx`): the 5 sections plus sourced rules; eligibility asks and tailoring questions inline, `conditional_notes` shown when the answer matches, ways best-first with copyable phone chips, call script, ask-them list (copy all), stage tracker; approving a benefit with `held_benefit` adds it to `benefits_held` through the real API.
- **Local help** (`components/local/local-view.tsx`): grouped by `access`, need filter, week calendar from `hours` (unknown hours left out, with a count of places to call first).
- `lib/derive.ts` gained the pure selectors (tone/label, asks, plan items, next step, week events, docs, wallet kinds, guide notes, tailoring); `lib/device-state.ts` gained the per-session plan state (stage, done, docs). It was pulled forward from Phase 5 because the guide's stage tracker and "I have this" need it. The Documents and About pages are still Phase 5.
- Verified: lint, typecheck, `next build`, 291 backend tests, selectors run against `snapshot.json`, and every answer path (sharpen, out of order, skip, tailoring) exercised through the dev proxy against a curated-data backend. **Not yet clicked through in a browser.**

Gaps noticed:
- A tailoring question shows in a guide only when it is in `open_questions` or already answered (the snapshot has no definition otherwise). The backend accepts them; exposing their definitions (e.g. `guide_questions`) would need a contract change.
- Matching `conditional_notes` compares option labels with `display_value`, because `AnsweredItem` carries no option ids. An additive `selected_option_ids` on `AnsweredItem` would make this exact.
- ~~After answering `benefits_held = snap`, `last_change.moved_to_fit` listed the SNAP program itself.~~ Fixed: `already_receiving` is now reported under `updated`, not as a new fit.
- The demo's dated timing strip (deadlines) and "other programs outside what you picked" are not built: the snapshot has neither the dates as data nor the unmatched programs.

### Phase 5 (frontend only, no contract change)

- **Documents wallet** (`components/documents/wallet-view.tsx`): one card per kind of paper across live programs and started applications (`walletPrograms` / `walletKinds` in `derive.ts`), "I have it" toggles, which programs use each paper, the providers' own wording, readiness per application, a per-application filter, "Still to find" / "Ready", a never-email warning, and "Ask about documents on your call" for benefits whose provider lists none. Papers the provider marks conditional in its own text ("Renters: ...") get an "only if it applies" tag.
- **About you** (`components/about/about-view.tsx`): name (device only, edited in place) and language rows, then every answered item with a source badge from `provenance`. Edit opens the shared question form already filled in; skipped answers show "Answer". Open questions are listed with the programs each affects. "Start over" asks twice, then clears the device plan and name and starts a new session.
- **Device state:** the per-session plan (stages, done, documents) from Phase 4. A new session starts empty, and `clearDevice()` removes it on Start over. The sidebar name updates when it changes.
- **Badges:** the Documents nav badge counts papers still to find; Home's glance strip and the guide read the same wallet.
- **Toast:** when an answer adds or removes programs (for example, adding a need), the toast now counts them, because `last_change` only compares statuses of programs that were already listed.
- Verified: lint, typecheck, `next build`, plus edits to every core answer (needs, ZIP, household size, who is home) through the API, with results recomputed. **Not clicked through in a browser.**

Gap: which conditional papers apply is not decided yet (for example, the lease only for renters). That needs `applies_if` on requirements or documents in the backend (planned in §4, not built), so every listed paper is shown for now.
