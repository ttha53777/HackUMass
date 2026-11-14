# Browser Execution Agent: 36-hour MVP plan

Status: Phases 0 to 3 built on 2026-11-14 (see "Progress" below). Phase 3's live acceptance runs and the real-site switch-on are waiting on API keys and a team decision. Written 2026-11-14 against `main` at `60c466a`.

## Progress

**Phase 0**

- Contract change done: `ApplicationRecord`, `SessionState.applications` and `application_result` (`graph/state.py`); the Administrator stores a result and marks the plan dirty; Action Planning moves a submitted program to the bottom ("Sent on ... Watch for a reply from ...") and turns `unclear` into "Check whether your application went through"; `SessionSnapshot.applications` and `automatable_program_ids` in `api/schemas.py` and `frontend/src/lib/types.ts`; the snapshot fixture is regenerated and synced.
- S1 (`backend/scripts/spikes/s1_gemini_cu.py`) and S2 (`s2_steel.py`) are written, but they have **not been run yet**: `backend/.env` has no `GEMINI_API_KEY` or `STEEL_API_KEY`. The go/no-go decision is still open.
- S3 (`s3_real_forms.py`) has a baseline from a residential IP (`--local`). The run through Steel, from a datacenter IP, is still to do.

  | program | host | visible fields | bot wall |
  |---|---|---|---|
  | asc-food-pantry | amherstsurvival.org | 5 | no |
  | capv-weatherization | forms.monday.com | 20 | no |
  | hves-home-delivered-meals | fd7.formdesk.com | 65 | no |
  | fbwm-snap-application-assistance | www.foodbankwma.org | 3 | no |
  | eversource-ma-discount-rate | www.eversource.com | 27 | **yes**, even locally |
  | capv-fuel-assistance | www.toapply.org | 0 (sign-up or login wall) | no |

**Phase 1:** all four streams are built. The acceptance check runs as `tests/test_practice_browser.py`: real headless Chrome and the real practice form, with a scripted model. It fills steps one and two from the fill sheet, hands off at the certify box and at Submit, and blocks an off-site navigation. `tests/test_execution_api.py` covers the run lifecycle with `FakeProvider` and no network. One end-to-end run with real Gemini and real Steel still needs the keys.

**Phase 2:** built.

- **Result to the main graph.** When a run ends, `execution/results.py` writes `application_result` into the main graph, once the session is idle. The mapping: submitted stays submitted; unclear stays unclear; a form that wasn't sent, or a run that was stopped, becomes `stopped`; a failed run records nothing. The Administrator never overwrites a `submitted` record with a later run that didn't submit. `RunView.result_recorded` tells the panel when the result is in.
- **Frontend.** The assistant's questions use `question-form.tsx`, through a new `onAnswer` prop. When a result is recorded, the panel refreshes the session (`useSession().refresh`) and, if the form was received, sets the device stage to `applied`. Home gains an "Applications you sent" list showing Action Planning's "Sent on ... Watch for a reply from ..." step and the reference number.
- **Acceptance.** `tests/test_practice_browser.py::test_full_practice_run_with_one_question_and_one_handoff` drives the real manager and `LocalProvider` (headless Chrome) against the practice form served over HTTP. It covers one question, a handoff at the certify step, the person signing and submitting, I'm done, verify (`submitted` with a `PRACTICE-` reference), the result recorded, the private details wiped and the browser closed, all in about 5 seconds. The gate blocking the agent's own Submit is covered in `test_gate.py` and `test_execution_agent.py`. Stop releases the browser in under 5 seconds from `starting`, `working`, `needs_answer` and `needs_you` (`test_execution_api.py`).
- **Manual UI check.** A scratch harness ran the real backend with `LocalProvider` and the scripted model, and drove the Next.js UI: six questions answered in the panel, the takeover with I'm done, the stage set to `applied`, and Home showing the sent application with no console errors.
- **Not yet proven:** the under-4-minutes target with real Gemini, and the interactive Steel iframe during takeover. Both need the S1 and S2 keys.

**Phase 3:** built, except that the live acceptance runs need keys and turning on a real site needs a team decision.

- **Fill-and-stop for real sites.** In `stop_before_submit` mode, the first submit or attestation the gate meets ends the run at a read-only `stop_point` ("The form is filled in up to the point of sending. We stop here: nothing will be sent."). The live view stays non-interactive there, so the form can't be sent from the panel. The person presses **End here**, and the run finishes as `done` with outcome `not_submitted` and is recorded as `stopped`. The panel and the consent card say which kind of form it is: `SessionSnapshot.automation_modes` is a new contract field, mirrored in `types.ts`.
- **Real form chosen, but kept off.** All six candidates were probed read-only on 2026-11-14:
  - **SNAP** (foodbankwma.org): the referral is a third-party mRelief screener inside an iframe, which the gate hands off, and the page carries many ad trackers.
  - **ASC pantry:** "Sign Me Up" opens an Oasis Insight kiosk with reCAPTCHA, which is a real client-records system.
  - **Weatherization** (monday.com): a Cloudflare challenge and custom dropdowns.
  - **Eversource:** a CAPTCHA.
  - **Fuel assistance** (toapply.org): sign-up first.
  - **Highland Valley Elder Services** referral (Formdesk): plain HTML, no CAPTCHA, no requests on load. It is the only workable one. Its record (`data/automation/hves-home-delivered-meals.json`) ships with `"enabled": false`: it is validated on load but never offered until the team agrees to section 7 item 1 and S3 passes through Steel. Local-help programs show the panel in the program drawer, so it will appear once that record is turned on.
- **Choices are the person's.** A click on any radio button, checkbox or option (`role=option` included) is handed off as `choice`. The fill sheet holds only typed details, so the agent never answers a multiple-choice question for the person. A new `full_name` key is derived from first and last name, for forms with a single name field.
- **Failures.** The model gets one retry on a transient failure, and a `failed` interaction status counts as a failure. Either way the person sees "couldn't reach Google's AI" and the run records nothing. Steel's 401/403, 402 and 429 responses map to safe messages. The countdown turns amber under 2 minutes. "Live view not loading? Show snapshots instead" switches to the screenshot fallback.
- **Tests:**
  - at most 2 runs at once (429);
  - the session deadline closes the browser;
  - model outage;
  - fill-and-stop through the API and in real Chrome;
  - the allowlist handler, including strict mode, CDN assets, CAPTCHA frames and `data:` URLs;
  - a crash mid-run logs the exception class but never its message;
  - automation records are validated.

  Off-site navigation, cross-session 404s and no typed values in logs were already covered.
- **Acceptance rehearsal:** `scripts/spikes/rehearse.py` runs the real manager, provider and Gemini N times, answering with an obviously fictional person and playing the person's part at the handoff. It prints a table and PASS or FAIL against the Phase 3 bar. Checked with a scripted model in both modes. **Not yet run against Gemini:** there is no key.

**Changes from this plan, and why**

- **The execution graph is a plain asyncio state machine** (`execution/manager.py`), the fallback section 6 allows. Resuming a LangGraph `interrupt()` re-runs the node from the start, which would replay browser actions. A live browser can't be checkpointed anyway, and the private fill-sheet values must stay out of checkpoints. So there is no `execution/graph.py`; `manager.py` holds the prepare, act and verify steps, and `verify.py` reads the outcome.
- **Action names come from Google's docs** (fetched 2026-11-14): `click`, `double_click`, `type` (no coordinates, so it goes into the focused field), `scroll`, `navigate`, `press_key`, `hotkey` and others. The docs do not use `click_at` or `type_text_at`. For `type`, the gate checks the focused element.
- **Coordinates** are scaled from a 1000x1000 grid, as in Google's own sample. S1 prints both readings so we can confirm it.
- **Steel is called over its REST API with `httpx`**, not `steel-sdk`, so there is one dependency fewer. Playwright is an optional extra: `pip install -e ".[browser]"`.
- **Typed values never reach the model.** The model types a placeholder such as `{{phone}}`; the gate accepts only a known fill-sheet key, and the server types the value. The questions the person sees are worded by us, never by the model.
- **A `safety_decision: require_confirmation` is handed to the person, and the agent does not perform the action.** That means we never need to send `safety_acknowledgement`, which settles that open item.
- **No `BROWSER_PROVIDER=browserbase` yet.** It is the drop-in backup if S2 fails.
- **The feature stays hidden when `GEMINI_API_KEY` is missing**, the same way `LLM_MODE=live` falls back to off.
- **Pulled forward from Phase 2:** the backend already supports questions and takeover end to end (`needs_answer`, `needs_you`, I'm done, `verify`), because the gate's outcomes need them. The run panel has a simple answer box and takeover controls. Phase 2 then completed these.

The agent opens an isolated cloud browser, fills an application from what the person already told us, asks for what it lacks, and hands the same browser to the person for anything that must be theirs: sign-in, identity checks, attestations, signatures and the final submit. It then reads the outcome and updates the plan.

## 1. Decisions

| Area | Decision | Why |
|---|---|---|
| Reasoning | Gemini Computer Use through the Interactions API, in our own loop of about 200 lines | `google-genai` 3.3.0 is already installed and `client.interactions` exists in our venv. Owning the loop is what lets code, not a prompt, enforce the stop-before-submit rule. |
| Browser control | Playwright (async) attached over CDP | Same code drives a cloud or a local browser. |
| Browser host | Steel cloud sessions first; Browserbase Developer ($20) as the drop-in backup; local headed Chromium for development | Steel's free tier gives $30 of credit at $0.10 per browser hour and a documented interactive iframe. Browserbase's free tier is 1 browser hour in total, too little to develop and rehearse on. |
| Live view | The provider's iframe, read-only while the agent works | About 30 minutes of work. A self-built CDP screencast with input forwarding is 3 to 4 hours and worse. |
| Takeover | Same iframe made interactive while the agent loop is parked | No second session, no state transfer. |
| Orchestration | A separate small LangGraph (`execution graph`) per run, paused with `interrupt()`; the main graph only receives the result | Main-graph runs are synchronous with a 45 s limit (`session_store.py`). A browser run lasts minutes and pauses for people. |
| Frontend transport | Poll a run endpoint every second | Matches the existing 202-and-poll pattern and avoids SSE buffering in the Next.js `/api` rewrite. Video comes straight from the provider iframe. |
| Final submit | Never clicked by the agent. Always the person, in takeover | Keeps "eligibility is potential" and consent honest, and matches Google's own guidance for this tool. |
| Demo target | Our own clearly labelled practice application for the full end-to-end run; real provider sites only in fill-and-stop mode | Submitting a fictional persona to a real agency is not acceptable (section 7). |

### Alternatives considered

| Option | Verdict |
|---|---|
| `browser-use` 1.0 (open source) | **Fallback engine.** Supports Gemini (`ChatGoogle`), `cdp_url`, `allowed_domains` and `sensitive_data`. Its 1.0 docs list no pause or resume, so handoff would be a blocking custom tool, and we would not see each action before it runs. Switch to it if the Phase 0 spike shows Gemini Computer Use is unreliable on forms. |
| Stagehand | Rejected. Computer-use mode is documented only for TypeScript, and that mode has no callbacks or abort. |
| Browser Use Cloud | Rejected. Free tier keeps a browser alive for 2 minutes after a run, too short for takeover; iframe embedding is undocumented. |
| Local browser only | Kept for development. Not the demo path: no embeddable interactive view, and it is not isolated from the demo laptop. |
| Run the browser agent as a fifth specialist in the main graph | Rejected. It would hold the session `busy` for minutes and block answers. |

## 2. What the existing code gives us

Reused as is:

- `SessionManager` and `InMemorySaver` (`services/session_store.py`): session lifetime, idle expiry, the `busy` and `run_notices` pattern. The execution manager copies this shape.
- `Profile.facts` with provenance: the source for every pre-filled value.
- `Question` and `AnswerIn` (`graph/state.py`) and the frontend `question-form.tsx`: the agent's mid-run questions use the same types and the same form component.
- `Program.apply_url`, `guide.ways` and `documents_needed`: start URL and the checklist shown before a run.
- `services/llm.py` `generate_json`: outcome verification as one structured call.
- `services/log_safety.py`, `ApiError` and `error_response`: the same logging and error rules.
- `guide-view.tsx` section "apply" and `PlanState.setStage(id, "applied")`: where the button goes and how the device-side stage is recorded.

Gaps the plan must fill:

- **The profile holds no contact details.** Intake collects eligibility facts only (household, income, housing and so on). Name, address, phone, email and date of birth do not exist server-side; the first name stays on the device. Every form needs them, so the agent will ask. This is the main source of mid-run questions.
- **The demo script ends with "nothing is ever submitted for the user."** That stays true: the person submits. `docs/demo-script.md` and `CLAUDE.md` need one added line each (Phase 4).
- Five curated records have a usable web form (`asc-food-pantry`, `capv-weatherization`, `hves-home-delivered-meals`, `fbwm-snap-application-assistance`, `eversource-ma-discount-rate`); `capv-fuel-assistance` needs an account at toapply.org.

## 3. Architecture

```
Guide page ── "Fill this in with me" ──► POST /applications
                                              │
                               ExecutionManager (one run per session)
                                              │
                    ┌──────────── execution graph (LangGraph) ───────────┐
                    │ prepare ─► act ◄─► gate ─► verify ─► END           │
                    │             │        │                             │
                    │      Gemini CU   interrupt(): question | handoff   │
                    └─────────────┼──────────────────────────────────────┘
                                  │ CDP (Playwright)
                        Steel session ──► iframe in the dashboard
                                              │
              result ──► main graph input `application_result`
                         ──► Administrator marks plan dirty ──► Action Planning
```

### New backend files (no existing file touched)

| File | Role |
|---|---|
| `app/execution/models.py` | `Run`, `RunStatus`, `StepLog`, `HandoffReason`, `Outcome` |
| `app/execution/provider.py` | `BrowserProvider` protocol; `SteelProvider`, `LocalProvider`; a `FakeProvider` for tests |
| `app/execution/computer.py` | Maps Gemini actions to Playwright calls, scales coordinates, returns screenshot and URL |
| `app/execution/gate.py` | Pure policy function: allow, ask, handoff or block for each proposed action |
| `app/execution/agent.py` | The Gemini loop: one model turn, gate, execute, function result |
| `app/execution/graph.py` | `prepare`, `act`, `verify` nodes with `interrupt()` |
| `app/execution/manager.py` | Run registry, per-session lock, timeouts, cleanup, private field store |
| `app/execution/fields.py` | Builds the fill sheet from `Profile.facts`; labels only what we know |
| `app/api/execution_routes.py` | Router mounted under `/api/sessions/{id}/applications` |
| `app/data/automation/*.json` | Per program: `start_url`, `allowed_hosts`, `mode` (`practice` or `stop_before_submit`) |

Keeping automation settings in `data/automation/` avoids changing the `Program` model. They are curated by hand like program records, and the model never supplies a URL.

### Contract changes (coordinate first; one small PR in Phase 0)

- `graph/state.py`: `ApplicationRecord {program_id, status, updated_at, confirmation: str | None}` with status `in_progress | submitted | stopped | unclear`; `SessionState.applications: dict[str, ApplicationRecord]`; input key `application_result`.
- `graph/administrator.py`: when `application_result` is present, store it and set `dirty.plan`. Deterministic, no new specialist in the main graph.
- `agents/action_planning.py`: a submitted program gets the next step "Sent on <date>. Watch for a reply from <provider>" and moves below unstarted items; `unclear` gets "Check whether it went through", with the program's contact.
- `api/schemas.py` and `frontend/src/lib/types.ts`: `SessionSnapshot.applications` and `automatable_program_ids`.
- Regenerate `tests/fixtures/snapshot.json`, then `npm run sync:fixture`.

### API

| Call | Purpose |
|---|---|
| `POST /applications {program_id, consent: true}` | Start a run. 409 if one is active. Returns the run. |
| `GET /applications/{run_id}` | Status, step log, pending question, handoff reason, `live_view_url`, seconds left |
| `POST /applications/{run_id}/answer` | Answer the agent's question (`AnswerIn` shape) |
| `POST /applications/{run_id}/control {action: "take" | "return"}` | Person takes or returns control |
| `POST /applications/{run_id}/stop` | End the run and release the browser |

Run states: `starting → working → needs_answer | needs_you → verifying → done | stopped | failed`.

### The agent loop

1. `prepare`: load the automation file, create the cloud session, attach Playwright, install the host allowlist with `context.route`, open `start_url`, build the fill sheet.
2. `act`: send the screenshot and URL to Gemini with the `computer_use` tool (`environment: "browser"`, `enable_prompt_injection_detection: true`) plus three functions of ours: `ask_user(field_label, why)`, `request_handoff(reason)` and `finish(summary)`.
3. `gate` runs on every proposed action before Playwright touches the page (section 4).
4. Limits: 40 steps, 8 minutes of agent time, 5 minutes per pause. Steel's free tier caps a session at 15 minutes, so the panel shows a countdown.
5. `verify` after the person returns control: fresh screenshot and page text into `generate_json` with schema `Outcome {status: submitted | not_submitted | unclear, confirmation_text}`. Anything the page does not state stays `unclear`.

### Live view and takeover

- Agent working: `<iframe src="{debugUrl}?interactive=false">`, plus our step log beside it ("Typed your phone number", never the value).
- Takeover: the run moves to `needs_you`, the loop is parked inside `interrupt()`, and the iframe reloads with `interactive=true&showControls=true`. A banner states why ("This page asks you to sign").
- Return: the person presses **I'm done**; the graph resumes with a new screenshot. The agent does not replay or undo what the person did.
- The person can press **Take over** at any time; the loop finishes its current action and parks.
- Low-fidelity fallback: the loop already holds a screenshot per step, so `GET /applications/{run_id}/frame` can serve the latest one if the iframe fails. Takeover then needs the local headed browser.

## 4. Security and guardrails

Enforced in code, in `gate.py`, not in the prompt:

| Rule | Mechanism |
|---|---|
| Stay on the provider's site | `context.route` aborts any request to a host outside `allowed_hosts`; `navigate` to another host is blocked and reported to the model |
| Never submit, sign or attest | Before a click, read the element at the point (`elementFromPoint`). Hand off if its text or label matches submit, send, sign, agree, certify, attest or pay; if it is a password, file or signature input; or if Gemini returns `safety_decision: require_confirmation`. "Next" and "Continue" pass. |
| No CAPTCHA solving, no sign-in | Detected by frame host and input type, then handed off. Captcha solving is left off at the provider. |
| No SSN, ever | The gate refuses to type into a field whose label or name matches SSN patterns and hands off. We never ask for it and never store it. |
| Page text is data | Tool results carry only screenshot and URL. The model's `ask_user` text is shown as a question, never acted on as an instruction. Typed values come only from the fill sheet or the person's answers, checked by the gate: the model names a field key, and the server substitutes the value. |
| One session never reads another's | Run ids are looked up under the session id; the `live_view_url` is returned only to that session and never logged. Steel debug URLs are unauthenticated, so they are treated as credentials and the session is released on every exit path. |
| Private details | Name, address, phone, email and date of birth live in the manager's memory for the run, outside LangGraph checkpoints, and are wiped at the end. Logs keep action type and field label only. No screenshots are written to disk. |
| Consent | Starting a run requires `consent: true`, like the Nessie route, with a plain statement of what the agent will and will not do. |

Known limits to state openly in the demo: screenshots containing the person's details go to Google and to the browser host; a text-match gate can miss an oddly labelled submit button, which is why the practice form is the only place a submit can succeed.

## 5. Phases

Four people or agents can work in parallel after Phase 0. Hours are elapsed time.

### Phase 0: spikes and contracts (hours 0 to 3)

- S1: Gemini Computer Use clicks one button and types one field on a local page, through `client.interactions`.
- S2: Steel session created from Python, Playwright attached, iframe embedded in a scratch page, interactive toggle works while Playwright stays attached.
- S3: open each candidate real form in a Steel session and record whether it loads or shows a bot wall.
- Contract PR (section 3) merged with stubs.

Acceptance: S1 and S2 each run from one script. Go or no-go recorded: if S1 fails, switch the engine to `browser-use`; if S2 fails, switch to Browserbase Developer.

### Phase 1: core loop (hours 3 to 12)

| Stream | Work |
|---|---|
| A, agent | `computer.py`, `agent.py`, `gate.py` with unit tests |
| B, browser and view | `provider.py`, `manager.py`, routes, the run panel with iframe and step log |
| C, integration | Practice application (three steps: contact, household, attest and sign), automation files, `fields.py` |
| D, main graph | `application_result` in the Administrator and Action Planning, with tests |

Acceptance: from the guide page, the agent fills steps one and two of the practice form from profile facts while the iframe shows it live. `pytest` passes with `FakeProvider` and a scripted model, with no network.

### Phase 2: questions and takeover (hours 12 to 22)

- `ask_user` round trip using `question-form.tsx`.
- Handoff on the attestation step, interactive iframe, **I'm done**, `verify`.
- Result written to the main graph; the Home page shows the updated next step; the device stage is set to `applied`.

Acceptance: the full practice run completes in under 4 minutes with one question and one handoff. The agent's own attempt to click Submit is blocked by the gate in a test. Stopping at any state releases the browser within 5 seconds.

### Phase 3: one real site, hardening (hours 22 to 30)

- One real form from S3 in `stop_before_submit` mode: fill, hand off, and the demo ends the run there without submitting.
- Timeouts, expiry countdown, provider failure messages, the screenshot fallback, a cap of two concurrent runs.
- Tests: allowlist blocks an off-site navigation; a second session gets 404 for another's run; logs contain no typed value.

Acceptance: five consecutive clean practice runs. The real-site run reaches the handoff at least four times in five.

### Phase 4: demo (hours 30 to 36)

- Update `docs/demo-script.md`, `README.md` (new env vars, `playwright install chromium`) and the guardrail line in `CLAUDE.md`.
- Record a backup video of a clean run.
- Freeze code at hour 33.

New settings in `backend/.env.example`: `BROWSER_PROVIDER` (`steel | browserbase | local | off`), `STEEL_API_KEY`, `BROWSER_AGENT_MODEL`. New dependencies: `playwright`, `steel-sdk`. With `BROWSER_PROVIDER=off` the feature is hidden and nothing new is imported, the same way `LLM_MODE=off` works.

## 6. Verify before relying on it

| Item | Why it is open | When |
|---|---|---|
| Gemini model id for Computer Use | Google's page uses `gemini-4-hydrogen` in samples and names several others; third-party pages disagree. Keep it in `BROWSER_AGENT_MODEL`. | S1 |
| Coordinate system | The same page describes both a 1000 by 1000 grid and pixel coordinates. Test one click at a known position. | S1 |
| Where `safety_acknowledgement` goes in the function result | Ambiguous in the docs | S1 |
| Free-tier Gemini quota and data use for Computer Use | Not on the docs page. Use a paid key if any real personal detail is typed. | Before Phase 1 |
| Steel CDP connect URL and timeout parameter from Python | Read from the docs index, not tested | S2 |
| Human input while Playwright stays attached | Documented by neither Steel nor Browserbase; our loop is parked during takeover, which should be enough | S2 |
| Whether the Steel iframe needs `sandbox` or `allow` attributes under our CSP | Untested | S2 |
| Which real forms load from a datacenter IP | Eversource and toapply.org are the likeliest to block | S3 |
| `interrupt()` with async nodes on `InMemorySaver` in langgraph 1.2.22 | Expected to work; if it costs more than 2 hours, replace the execution graph with a plain asyncio state machine behind the same manager API | Phase 1 |

## 7. Needs a team decision

1. **Real sites.** A fictional persona must not be submitted to a real agency, and a fill-and-stop run still loads a real provider's form. Recommended: the practice form carries the full demo, and one real form is shown filled and then abandoned. Say so if even that is unwanted.
2. **The practice form.** It should look generic and say "Practice copy, not sent to any agency" on every step, rather than imitate a named provider's page.
3. **Budget.** Steel's free credit should cover the weekend. The backup is $20 for Browserbase Developer.

## Sources

- Gemini Computer Use: https://aistudio.google.com/docs/computer-use
- Browserbase live view and pricing: https://docs.browserbase.com/features/live-view, https://www.browserbase.com/pricing
- Steel embeds, takeover and limits: https://docs.steel.dev/overview/sessions-api/embed-sessions/live-sessions, https://docs.steel.dev/overview/sessions-api/human-in-the-loop, https://docs.steel.dev/overview/pricinglimits
- browser-use: https://docs.browser-use.com/open-source/all-parameters, https://docs.browser-use.com/tips/live-view/human-takeover
- Stagehand: https://docs.stagehand.dev/v3/basics/agent
