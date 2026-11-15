# Community Resource Navigator

A guided assistant that helps people find government assistance programs and local community resources, see whether they *might* qualify, and leave with a prioritised list of next steps.

Built as a 36-hour hackathon MVP (HackUMass). The working name is a placeholder.

> **Project status: MVP feature-complete (tickets T1–T18).** The guided intake, 23 curated Hampshire County program records, deterministic eligibility, a ranked plan, the results UI, the optional simulated bank profile and document upload all work end to end. A scripted demo test passes. Gemini live mode is built and tested with a fake client, but **not yet verified against the real API**. The design is in [docs/foundation-plan.md](docs/foundation-plan.md).

## Who it is for

Adults facing financial or logistical hardship who need help finding food, utility, housing, healthcare, transportation, or senior services. The interface is meant to be usable by people of any technical ability.

## How it works for the user

The app leads; the user answers. It is not an open-ended chatbot.

1. The app opens with a question: "What are you having the most trouble with right now?"
2. It asks for a ZIP code, then a few short questions chosen from the user's needs and from what nearby programs actually require.
3. Every question has tap-to-answer options where possible, and non-essential questions can be skipped.
4. It shows matching government and community programs, each with a source link and a preliminary fit label.
5. It produces an ordered roadmap of next steps, and revises it when the user adds or corrects information. A short summary says what each new answer changed.
6. The plan can be printed or saved as a PDF from the browser; links are written out in print.
7. Optionally, the person can try a fictional simulated bank profile or upload a pay stub or benefit letter. Any number found is shown to them to confirm before it is used.
8. A collapsed *How we put this together* panel shows each of the four specialist steps, its status and time, and counts drawn from the results. It shows no generated reasoning.

## Architecture

```text
Next.js frontend  ──/api/* proxy──>  FastAPI  ──>  LangGraph
                                                    │
                                    Agent Administrator (deterministic router)
                                    ├─ User Intelligence   builds the typed profile
                                    │    ├─ Nessie sandbox service (optional)
                                    │    └─ document extraction (optional upload)
                                    ├─ Program Discovery   filters curated, sourced programs
                                    ├─ Eligibility         compares profile to documented criteria
                                    └─ Action Planning     ranks next steps
                                                    │
                                    Typed shared state + in-memory checkpoints
```

- Each answer triggers one graph run. The Administrator picks the next step from state: update the profile, discover programs, assess eligibility, plan, or ask one more question.
- Specialists never message each other. Each returns a typed update to shared state.
- Discovery supplies sourced criteria before Eligibility assesses; Action Planning consumes the assessments.
- Structured eligibility rules are evaluated in code. The language model (Google Gemini, live mode only) is used only to interpret free-text answers and to word explanations.
- Needs cover 12 areas: food, heat and utilities, housing, medical care, getting around, emotional support, legal help, childcare, work and training, safety at home, free tax help, and phone and internet. Records for the newer areas are evidenced in `docs/curation/` like the rest. After the needs answer the chat offers up to three related areas from a fixed map (`RELATED` in `frontend/src/components/front/chat/content.ts`).
- **Bank connector (sandbox only).** "Connect a bank account" (on Your money, and on the chat's income question) reads a fictional Nessie demo account into monthly totals: income sources, recurring bills with paid or unpaid status, and spending by category. Snapshots carry `bank_suggestions` for open questions (working, I rent, behind on a bill, an income range); each is applied only when the person confirms it, and the bank's income figure is confirmed through the existing confirmation question before forms or eligibility use it. The Your money page shows the budget, bills, help that lowers costs, and a tax-time checklist with the curated free tax programs. Disconnect removes everything read from the bank that wasn't confirmed.
- When a need has no curated program in the person's area, `services/web_search.py` looks it up with Gemini's Google Search grounding. Those links appear on Home as "More places to look, found on the web" with a "we haven't checked these" note, never in the plan or with a status. Google Search grounding may need billing enabled on the Gemini key; without it the list is simply empty.
- Typed chat messages are read by `services/conversation.py`. The model can only choose real question options; every value is validated like any other answer; facts for later questions are confirmed by the person before they are used; replies must pass `is_safe_reply` (no program, benefit or place names the person didn't use, no links, amounts, dates or questions, no promises); instruction-like messages yield nothing. Danger or crisis words show a fixed message (911, and 988 by call or text) in both modes. With `LLM_MODE=off` the same endpoint uses keyword matching and the chat uses template replies.
- An "Other" answer is kept word for word. Options it clearly names are matched by keyword, or by the model in live mode, which can only choose existing options. The match is shown next to the answer.
- Model wording is checked before use: it may not add a link, amount, phone number or date missing from the program record, or claim someone is eligible. Otherwise the template text is kept.
- Each program gets one of four preliminary labels. A rule the provider states but the app cannot check (most rules) can never yield more than *possibly a fit*. Facts from simulated bank data or a document count only once the user confirms them.
- The frontend polls a session snapshot for progress and results.

## Prerequisites

- Node.js 20 or newer and npm
- Python 3.12 or newer
- A Google Gemini API key (only for live model mode)
- A Capital One Nessie sandbox API key (optional)

## Setup and run

Backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cp .env.example .env
.venv/bin/uvicorn app.main:app --port 8000 --env-file .env
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL that `npm run dev` prints. It is <http://localhost:3000> unless that port is taken, in which case Next.js picks the next free one. The first question appears as soon as the page reaches the backend.

The frontend forwards `/api/*` to `http://127.0.0.1:8000`. Set `BACKEND_URL` when starting the frontend to point it elsewhere.

## API

All routes are under `/api`. Errors have the shape `{"error": {"code", "message"}}`.

| Route | Purpose |
|---|---|
| `POST /sessions` | Start a session. Returns `201` and a snapshot that already contains the first question. |
| `GET /sessions/{id}` | Current snapshot: pending question, answered questions, programs, plan, agent statuses, notices. |
| `POST /sessions/{id}/answers` | Answer the pending question, or change or skip an earlier one. `200` means the snapshot is current; `202` means work continues (`busy: true`), so poll the `GET` route. |
| `GET /sessions/{id}/web-resources` | Unverified web results (title, https link, site) for the person's needs that no curated program in their area covers, found with Gemini's Google Search grounding. The query holds only the need and the city and county; only grounding links are used, never model text. Shown on Home apart from the plan. `available: false` when search is off or not allowed for the key. |
| `POST /sessions/{id}/interpret` | Body `{"question_id", "text"}` (up to 500 characters). Reads a message typed into the chat and returns a proposal: a short guarded reply, an answer to the pending question, facts to confirm later, needs the app can't search for, and a `safety` flag. It never changes the session. At most 40 per session (`429 too_many_messages`). |
| `GET /nessie/personas` | The fictional demo bank profiles, each labelled *Simulated*. |
| `POST /sessions/{id}/evidence/nessie/disconnect` | Disconnects the simulated bank: drops its summary and any income read from it that the person never confirmed. A confirmed figure stays as their own answer. `200` or `202` like answers. |
| `POST /sessions/{id}/evidence/nessie` | Body `{"persona_id", "consent": true}`. Uses a simulated bank profile; `200` or `202` like answers. Deposits become an **unconfirmed** income estimate, and the app asks the person to confirm it before relying on it. |
| `POST /sessions/{id}/evidence/document` | Multipart: `file` (PDF or `.txt`, 2 MB max), `consent=true`, and optional `kind` (the paper's kind from the wallet: `income`, `member_income`, `dob`, `lease`, `heat`, `shutoff`, `address`, `id`, `liheap`, `notices`). The Document Agent reads only that kind's fields from labelled lines that start a line (e.g. a pay stub: monthly income and working; a household paper: household size and age groups; a lease: renting and heat included). Without `kind`, only household size and income. SSN-looking lines are skipped. The file is deleted right after reading and its text is never stored. Found facts wait for the person to confirm them, and a disagreement with an answer or another paper becomes one question that names both sources. The response is the snapshot plus `identity` (name, birth date, address, phone, email, and form details such as employer, rent, landlord, utility account, household members and last season's Fuel Assistance number; see `document_patterns.KIND_DETAILS`) for the person's device only. Each is checked like a typed answer: sent once with `Cache-Control: no-store`, never kept on the server. |
| `POST /sessions/{id}/evidence/review` | Body `{"document_id", "accept": [field], "edits": {field: value}}`. Answers one paper's review card (`pending_reviews` in the snapshot): ticked fields are confirmed, edited ones become the person's own answer (option ids for choices), and the rest are dropped. `422` for a field not on that card or a value its question doesn't allow. `200` or `202` like answers. |
| `GET /health` | Liveness and configuration flags (`browser_agent` is true when the browser assistant is mounted). No secrets. |

Error codes: `session_not_found` (404), `stale_question` (409), `session_busy` (409), `validation_error` (422), `consent_required` (400), `unsupported_file` (415).

### Browser assistant (optional)

Only mounted when `BROWSER_PROVIDER` is `steel` or `local`. Without `GEMINI_API_KEY` it offers only practice forms that have a field map, filled by the offline manifest engine. It fills an application form from the person's answers, asks for anything missing, and hands the browser to the person for every step that must be theirs (signing, signing in, CAPTCHA, the final submit). Design: [docs/browser-agent-plan.md](docs/browser-agent-plan.md).

| Route | Purpose |
|---|---|
| `POST /sessions/{id}/applications` | Body `{"program_id", "consent": true, "details"?, "detail_sources"?}`. `detail_sources` maps a detail key to the paper title it came from ("your lease"), used only for the step log: "Typed your account number (from your electric bill)". Starts a run for a program listed in `automatable_program_ids`. `details` holds the person's confirmed device details (fill-sheet keys such as `first_name`, `date_of_birth`) for this run only; they never replace a profile value and are never stored or logged. `201`; `409 run_active` if one is running; `409 facts_in_conflict` while an answer the form needs is disputed. |
| `GET /sessions/{id}/applications/readiness?program_id=` | "Before we start": the form's fill-sheet keys sorted into `from_profile`, `from_device_needed`, `will_ask`, `unconfirmed` and `blocked_by`. Keys only, never values. |
| `GET /sessions/{id}/applications/{run_id}` | Run status, step log, pending question, handoff reason, live-view URL, seconds left. Poll about once a second. When the run ends, its outcome goes into the main graph (`applications` and the plan's next step); `result_recorded` turns true once it has. |
| `POST /sessions/{id}/applications/{run_id}/answer` | Answer the assistant's question (`AnswerIn` shape, `text` or `skipped`). |
| `POST /sessions/{id}/applications/{run_id}/control` | `{"action": "take"}` gives the person the browser; `"return"` hands it back. |
| `POST /sessions/{id}/applications/{run_id}/stop` | Ends the run and releases the browser. |
| `GET /sessions/{id}/applications/{run_id}/frame` | Latest screenshot (PNG), the fallback view when there is no embeddable live view. |
| `GET /practice/` | Our own generic practice application form (not under `/api`). Practice copy, never sent anywhere. |
| `GET /practice/<form_id>/` | A per-program practice form: `fuel-renewal` (Fuel Assistance renewal, 2 steps) and `food-application` (food assistance, 4 steps). Pages live in `backend/app/execution/forms/`; field maps in `backend/app/data/automation/forms/`. |

Programs the assistant can fill are listed in `backend/app/data/automation/`. A `practice` record opens our practice form, or, with a `form_id`, that program's own practice form, whose readiness lists come from its field map; a `stop_before_submit` record opens a real provider form and the run always ends before sending. Records with `"enabled": false` are validated but never offered. Rehearse with real keys: `cd backend && .venv/bin/python scripts/spikes/rehearse.py --runs 5`.

Extra error codes: `run_not_found` (404), `run_active` (409), `run_finished` (409), `not_automatable` (422), `browser_unavailable` (503), `too_many_runs` (429).

### Form-Fill Agent v2 ("Filler", optional)

A new agent built beside the browser assistant above, in `backend/app/filler/`. Mounted only when `FILLER_ENABLED=1` and `GEMINI_API_KEY` is set; the Papers page then shows its controls instead of the v1 helper's.

Phase 2, papers and details. A paper is read only with consent: the session's **Read my papers automatically** setting (each upload is read at once) or that paper's own **Filler reads** switch. One Gemini call reads it into details (name, address, income, rent...), each with its page and the words it came from; SSN-like and long numbers are masked first. The file is dropped after reading. Details are typed into a form only after the person confirms them (**All correct**). Everything lives in memory for the session; nothing is kept after it.

| Call (under `/sessions/{id}/filler`) | Purpose |
|---|---|
| `GET /state` | Auto-read setting, papers and their status, details, how many are unconfirmed. |
| `PUT /auto-read` | `{"on": true, "scopes": [...]}`. Off takes back the consent it gave and drops those details. |
| `POST /papers` | Multipart `file` (PDF, PNG or JPEG, 10 MB, 15 pages) and an optional `kind` hint. Read at once if auto-read is on. |
| `DELETE /papers/{paper_id}` | Forget the paper and what was read from it. |
| `PUT /consents/{paper_id}` / `DELETE` | The paper's own switch on (read it) or off (drop what was read). |
| `POST /details/confirm` | `{}` confirms every detail; `{"edits": {"phone": "..."}}` sets values (all or nothing). |
| `DELETE /details/{key}` | Forget one detail. |

Phases 3 and 3.5, filling a form. `POST /sessions/{id}/filler/runs` fills the practice form from confirmed details. The fast path reads the page's own HTML: each field's label, `name` and `autocomplete` are matched to a detail by rules, by a hand-checked map in `backend/app/data/filler/` for known forms, or by one text-only model call (labels only, never values). It fills a page in seconds with no model turns: about 6 s for the practice form's 10 fields. Gemini Computer Use takes over only when a page won't move on. Every field and click passes the safety gate (`backend/app/filler/gate.py`): choices, certify boxes, signatures, sign-in, CAPTCHAs and the final Submit always go to the person, who acts in the same live browser. `{"prepare": true}` opens and maps the form before the person presses Start (`{"action": "go"}`).

| Call (under `/sessions/{id}/filler/runs`) | Purpose |
|---|---|
| `POST /` | Start; `{"prepare": true}` waits at `ready` with a plan of the first page. 409 if one is going. |
| `GET /{run_id}` | Status, question, hand-off, filled fields, outcome, plan, seconds to first typing. |
| `POST /{run_id}/answer` | `{"value": "..."}` or `{"skip": true}`. The answer becomes a confirmed detail. |
| `POST /{run_id}/control` | `go`, `pause`, `resume`, `take`, `return`, `done` (after the person presses Submit). |
| `POST /{run_id}/stop` | Stop and release the browser. Nothing is sent. |
| `WS /{run_id}/live` | Frames, cursor, steps, questions, hand-offs; the person's clicks and keys during a hand-off or the review. |

Phase 4, the viewer. On Papers, **Watch it fill a practice form** opens the Filler full screen (`frontend/src/components/filler/filler-stage.tsx`): the live browser with the agent's cursor on the left; on the right the pre-flight card (what it will fill and from which paper, what it will ask, what is the person's), one question at a time, the hand-off banner with **Hand back**, the field checklist and a caption per action. **Pause**, **Take over** and **Stop** are always there. During a hand-off and at the review the person clicks, scrolls and types right in the live view; the review outlines every filled field, and the person presses the form's own Submit, then **I've sent it**. The stream is the run's WebSocket, through the same `/api` rewrite.

Phase 5, real programs and PDFs. Which programs the Filler can fill is curated in `backend/app/data/filler/targets/<program_id>.json` (`practice`, or `stop_before_submit` with its own `start_url` and `allowed_hosts`); those programs get the plan's **Fill my form** button, which opens the Filler. On a real site the run is fill-and-stop: the first Submit or attestation ends it read-only and nothing is sent; navigation off the allowed hosts is aborted. Real-site records ship with `"enabled": false` until the team signs off and the form is checked from Steel. A finished program run writes its outcome into the plan (`application_result`, as v1 does). On Papers, **Fill a PDF form** takes a blank fillable PDF (`POST /sessions/{id}/filler/pdf-forms`): its fields are filled live as a web page, the person ticks boxes and checks it, and **Make my PDF** writes the values into the real PDF (`GET .../runs/{run_id}/pdf`). Signature fields are left for the person to sign in a PDF app.

Phase 1 is a spike: it opens its own browser, streams it live over a WebSocket (CDP screencast, cursor, a caption per action), and lets Gemini Computer Use fill a built-in practice page with a fictional person. These dev routes answer requests from this machine only.

| Call | Purpose |
|---|---|
| `POST /filler/dev/spike` | Start a spike run (409 if one is going). |
| `GET /filler/dev/spike/{run_id}` | Status, frames, peak fps, seconds to first typing, which fields were filled. |
| `POST /filler/dev/spike/{run_id}/stop` | Stop and release the browser. |
| `WS /filler/dev/spike/{run_id}/live` | Live events: `frame`, `cursor`, `step`, `status`, `end`. |
| `GET /filler/dev/viewer` | A bare page that starts a run and shows it live. Open `http://localhost:8000/api/filler/dev/viewer`. |

Live checks against Gemini: `cd backend && .venv/bin/python scripts/spikes/filler_phase1.py` (the browser), `scripts/spikes/filler_phase2.py` (reading three fictional sample papers) and `scripts/spikes/filler_phase3.py` (the Gemini loop on the practice form).

Try it with the backend running:

```bash
curl -s -X POST http://127.0.0.1:8000/api/sessions
curl -s -X POST http://127.0.0.1:8000/api/sessions/<session_id>/answers \
  -H 'content-type: application/json' \
  -d '{"question_id": "needs", "selected_option_ids": ["food", "utilities"]}'
```

## Environment variables

Set these in `backend/.env`. That file is git-ignored; never commit keys or real personal data. Everything works with only `PROGRAM_SOURCE` set: the model and Nessie are optional, and each has a fallback.

| Variable | Required | Purpose |
|---|---|---|
| `PROGRAM_SOURCE` | No | `fixtures` loads fictional development programs for the made-up ZIP code `00000`, labelled as test data in every response. Any other value (e.g. `curated`) uses the 23 curated records in `backend/app/data/programs/` and the 25 Hampshire County ZIP codes in `backend/app/data/regions.json`. `.env.example` sets `fixtures`. |
| `LLM_MODE` | No | `live` or `off`. With `off`, wording comes from templates and no model is called. |
| `GEMINI_API_KEY` | Only when `LLM_MODE=live` | Google Gemini access for reading typed chat messages, matching "Other" answers, and plainer wording of explanations and next steps. Without it, live mode falls back to templates and `/api/health` reports `off`. |
| `LLM_MODEL` | No | Gemini model ID for live mode. Default `gemini-3.5-flash-lite`. |
| `BROWSER_PROVIDER` | No | `off` (default) hides the browser assistant and imports nothing for it. `local` drives Chrome on this machine (development; needs `pip install -e ".[browser]"`). `steel` uses a Steel cloud browser with an embeddable live view (needs `STEEL_API_KEY`). Without `GEMINI_API_KEY` only forms with a field map are offered. |
| `FORM_AGENT_ENGINE` | No | How a practice form with a field map is filled. `manifest` (default): the curated map, no model, works offline. `gemini_map`: one Gemini call per step maps the page's labels to fill-sheet keys (never values) and falls back to the map after 8 s or an error. `computer_use`: the screenshot loop. Anything but `manifest` needs `GEMINI_API_KEY`, or it falls back to `manifest`. Every engine's actions pass the same gate. |
| `FORM_TYPE_DELAY_MS` | No | Visible typing speed for `local`, in ms per key (default 30; 0 types instantly). |
| `STEEL_API_KEY` | Only for `steel` | Steel cloud browser key. |
| `BROWSER_AGENT_MODEL` | No | Gemini Computer Use model ID. Default `gemini-3.5-flash` (`gemini-4-hydrogen` was too slow to finish a run). |
| `PRACTICE_BASE_URL` | No | Where the browser reaches the backend's practice form. Default `http://127.0.0.1:8000`; a cloud browser needs a public URL (for example a tunnel). |
| `FILLER_ENABLED` | No | `1` mounts the Filler phase 1 dev routes (needs `GEMINI_API_KEY`). Off by default. |
| `FILLER_PROVIDER` | No | Filler browser: `local` (default, Chrome on this machine) or `steel` (needs `STEEL_API_KEY`). |
| `FILLER_MODEL` | No | Filler's Gemini Computer Use model ID. Default `gemini-3.5-flash`. |
| `FILLER_READ_MODEL` | No | Gemini model that reads papers. Default `gemini-3.5-flash-lite` (1-2 s a paper). |
| `LOCAL_BROWSER_CHANNEL` | No | For `local`: `chrome` (default) uses the installed Google Chrome, and falls back to Playwright's Chromium (`.venv/bin/playwright install chromium`) when Chrome isn't installed; empty always uses Playwright's Chromium. |
| `LOCAL_BROWSER_HEADLESS` | No | For `local`: `true` hides the window. Default shows it. Keep it shown for a demo: the person signs and presses Submit in that window. |
| `NESSIE_API_KEY` | No | Capital One Nessie **sandbox** key (`https://api.nessieisreal.com`). The sandbox starts empty for each key; seed it once with `backend/scripts/seed_nessie.py` (writes fictional personas to the shared sandbox). Without the key, or without seeded personas, the app uses the fictional personas in `backend/app/data/nessie_fallback.json`, labelled as seeded. See [docs/nessie-spike.md](docs/nessie-spike.md). |

The frontend needs no secrets. The browser only calls same-origin `/api/*`, which Next.js forwards to the backend.

## Sessions

- No account and no database. Session state lives in the backend process's memory.
- State is kept across questions for as long as the backend keeps running.
- Restarting the backend clears every session. The app then shows a "session expired" message and starts a new one.
- Run the backend without auto-reload during a demo so a file save does not wipe the session.

## Deployment

The frontend runs on Vercel. The backend can't run there: it keeps sessions in memory, runs background tasks and serves WebSockets, so it needs one long-running process. `render.yaml` deploys it to Render as a single always-on instance (any similar host works with the same start command).

1. **Backend (Render).** New → Blueprint → pick this repo. Render asks for each variable listed in `render.yaml` (keys, `LLM_MODE`, `PROGRAM_SOURCE`, browser and Filler settings); set `PRACTICE_BASE_URL` to the service's own public URL. Not on Vercel: a serverless backend loses sessions as soon as a second instance starts, and can't serve the Filler's WebSocket. Check `https://<service>.onrender.com/api/health`. Keep `numInstances: 1`: a second instance would not see the first one's sessions. The free plan sleeps after 15 idle minutes (sessions are lost, the first request takes ~1 min); open the site just before a demo, or switch to `starter`.
2. **Frontend (Vercel).** Project → Settings → General → **Root Directory** = `frontend` (`frontend/vercel.json` pins the framework and commands). Under Environment Variables (Production and Preview):
   - `BACKEND_URL` = the backend's public URL, e.g. `https://api.example.com`. It is read **at build time** for the `/api/*` rewrite, so redeploy after changing it.
   - `NEXT_PUBLIC_BACKEND_WS_ORIGIN` = the same host as `wss://`, e.g. `wss://api.example.com`. Vercel's rewrites don't proxy WebSockets, so the Filler's live view connects to the backend directly. Only needed when the Filler is on.
3. **Domain (Porkbun → Vercel).** In Vercel → Settings → Domains, add `example.com` and `www.example.com`. In Porkbun → Domain → DNS, delete the default parking `ALIAS`/`CNAME` records, then add:

   | Type | Host | Answer |
   |---|---|---|
   | `A` | *(blank)* | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |
   | `CNAME` | `api` | `<service>.onrender.com` (then add `api.example.com` as a custom domain in Render) |

   Vercel may show project-specific values on the Domains page; use those if they differ. HTTPS certificates are issued automatically once DNS resolves.

Never set `DEV_SESSION_FILE` on a deployed server.

## Tests and checks

```bash
# backend
cd backend && .venv/bin/pytest

# frontend
cd frontend && npm run lint && npm run typecheck
```

The backend and frontend share one snapshot fixture, `backend/tests/fixtures/snapshot.json`. After editing it, regenerate the typed frontend copy, or the backend contract test fails:

```bash
cd frontend && npm run sync:fixture
```

After adding or removing a program in `backend/app/data/programs/`, or a ZIP code in `backend/app/data/regions.json`, refresh the landing page's count and the conversation's ZIP-to-town table:

```bash
cd frontend && npm run sync:programs
```

## Reproducing the demo

Use `PROGRAM_SOURCE=curated` and run the backend without `--reload`. The click-by-click script, what to point at, and recovery steps are in [docs/demo-script.md](docs/demo-script.md).

- **Region:** Amherst / Hampshire County, Massachusetts. Supported ZIP codes are in `backend/app/data/regions.json` (25 Hampshire County ZIPs from the MassGIS ZIP layer; Amherst is `01002` and `01003`).
- **Persona (fictional):** a retired person living alone on about $1,400 a month, behind on an electric bill and worried about groceries.
- **Script:** *Food* + *Utilities* → `01002` → *I'm behind on a bill* → household of 1 → $1,400 a month → results and plan → follow-up *I own my home* (Heating System Repair moves from "More information needed" to "Possibly a fit") → optionally the simulated bank profile → print the plan.
- **Check before demoing:** `cd backend && .venv/bin/pytest tests/test_demo_smoke.py` runs the same script through the API five times.

For development without real data, `PROGRAM_SOURCE=fixtures` serves fictional programs for ZIP `00000`, labelled as test data.

## Scope and limitations

- **Informational only.** Fit labels are preliminary. Only the program's provider decides eligibility.
- **Grounded data.** Program details and links come from a hand-curated, dated dataset for one region. The app does not search the live web and says so when a ZIP code is outside coverage.
- **Simulated banking.** Nessie is a sandbox. No real bank account is ever connected, and deposits are not treated as income until the person confirms them.
- **Documents.** Only household size and income are read from an upload, the file is deleted immediately, and found numbers need the person's confirmation.
- **No applications.** The app never submits anything on a user's behalf.
- **Not production-ready.** No authentication, no persistence, no rate limiting.

## Repository structure

```text
CLAUDE.md                          guidance for coding agents
render.yaml                        Render Blueprint for the backend (see Deployment)
frontend/vercel.json               Vercel build settings (Root Directory = frontend)
docs/foundation-plan.md            architecture, contracts, tickets, risks
docs/demo-script.md                the demo, step by step, with recovery steps
backend/app/main.py                FastAPI entry point; wires graph, programs, sessions
backend/app/api/routes.py          HTTP routes
backend/app/api/execution_routes.py  browser assistant routes (mounted only when enabled)
backend/app/api/practice_routes.py serves the practice forms at /practice/ and /practice/<form_id>/
backend/app/execution/             browser assistant: gate, agent loop, computer, providers,
                                   run manager, fill sheet, outcome check, practice form
backend/app/data/automation/       per-program automation records (start URL, hosts, mode)
backend/app/data/filler/           Filler targets (which programs, how) and hand-checked field maps
backend/app/filler/                Form-Fill Agent v2: consent, paper reading, cloud browser,
                                   live stream, agent loop
frontend/src/components/filler/    Filler UI: auto-read setting, consent notice, review card, live viewer stage
backend/app/api/filler_routes.py   Filler dev routes and live viewer (mounted only when enabled)
backend/scripts/spikes/            Phase 0 spikes: Gemini Computer Use, Steel, real forms
backend/app/api/views.py           builds the client snapshot from graph state
backend/app/api/schemas.py         request/response shapes          (contract file)
backend/app/graph/state.py         shared LangGraph state models    (contract file)
backend/app/graph/build.py         graph wiring                     (contract file)
backend/app/graph/administrator.py deterministic routing between specialists
backend/app/graph/questions.py     question registry and selection policy
backend/app/graph/answers.py       answer validation and normalisation
backend/app/agents/                the four specialists, one file each
backend/app/services/              programs repository, session store, Gemini wrapper
                                   and output guard, Nessie client, document reader
backend/app/data/fixtures/         fictional development programs and region
backend/app/data/programs/         curated program records, one JSON file each
backend/app/data/regions.json      supported ZIP codes (curated source)
backend/app/data/nessie_fallback.json  fictional simulated bank personas (fallback)
backend/scripts/seed_nessie.py     opt-in: seed those personas into the Nessie sandbox
docs/nessie-spike.md               what was verified about the Nessie API
docs/curation/                     per-record evidence: source URL and quote for each fact
backend/tests/                     pytest suite and the shared snapshot fixture
frontend/src/app/                  pages
frontend/src/components/front/      Landing page, Behind the scenes and the conversation at /start (front/chat/), with scoped light-only styles, fonts, door transition
frontend/src/components/front/chat/i18n/ the conversation in English, Spanish, Portuguese, Chinese and Hindi (from the mock's tables; `node scripts/geni18n.mjs src/components/front/chat/i18n` regenerates them). Landing, Building and the dashboard stay English
frontend/src/components/front-door/ the house drawing used on Home
frontend/src/components/chat/       answer wording helpers (script.ts) and the agent checklist
frontend/src/components/hub/       the Plan Hub (/home, /papers): hero and door, plan lanes, ask box, program spotlight, drawers (needs, answers, talk it through, add a paper, paper, counter, review, bank, fill my form), papers on the device (papers-context.tsx), "Watch demo" (tour/), scoped light-only styles (hub.css)
frontend/src/lib/hub-derive.ts     the hub's selectors: steps, lanes, cases, pips (no statuses decided here)
frontend/src/components/home/      archived: the old Home (not routed)
frontend/src/components/benefits/  archived views (guide, benefits list); the browser assistant and readiness card are still used
frontend/src/components/local/     archived: Local help and the week calendar
frontend/src/components/documents/ the document wallet
frontend/src/components/about/     archived: About you (now the hub's My answers drawer)
frontend/src/components/evidence/  optional document upload, sandbox profile, confirm card
frontend/src/components/program/   program card, drawer, question form, How we checked this
frontend/src/components/session/   session, answer and device-plan providers
frontend/src/components/shell/     toast and gate (live); sidebar and bottom tabs (archived)
frontend/src/components/od/        shared OpenDoor building blocks
frontend/src/components/ui/        shadcn components
frontend/src/hooks/use-session.ts  session lifecycle, answer submission, polling
frontend/src/lib/api.ts            typed client for the backend API
frontend/src/lib/types.ts          TypeScript mirror of the API     (contract file)
frontend/src/lib/fixtures/         generated copy of the snapshot fixture
```

Contract files are shared by every workstream. Agree changes with the team first, and change the Python and TypeScript sides together.

Where to make changes:

- **An agent's behaviour:** its file in `backend/app/agents/`. Graph wiring and shared state are contract files; coordinate before editing them.
- **A program record:** add or edit a file in `backend/app/data/programs/`, following the curation procedure in the [foundation plan](docs/foundation-plan.md) (section B.7). Copy URLs from the provider's page; never write one from memory.
- **A question:** `backend/app/graph/questions.py`. A question is only asked when a candidate program's requirement references its `target_field`.
- **An integration:** `backend/app/services/`.

## Troubleshooting

- **"We couldn't reach the server" on the home page.** Start the backend on port 8000, or set `BACKEND_URL` for the frontend, then choose *Try again*.
- **A hydration warning in the browser console that mentions `data-gr-ext-installed` or similar.** A browser extension changed the page before React loaded. It is harmless.
- **Dozens of "Module not found" warnings from `npm run build` mentioning `node_modules.nosync`.** A side effect of the iCloud workaround below. The build still succeeds.
- **The frontend opens a different app, or a port other than 3000.** Something else is using port 3000. Use the URL printed by `npm run dev`.
- **`npm run lint` hangs, or Node fails with odd errors inside `node_modules`, on macOS.** This happens when the checkout is in an iCloud-synced folder such as Desktop or Documents and iCloud offloads dependency files. Either move the checkout outside iCloud, or keep dependencies in a folder iCloud skips:

  ```bash
  cd frontend
  rm -rf node_modules
  npm ci
  mv node_modules node_modules.nosync
  ln -s node_modules.nosync node_modules
  ```

  Repeat the last two lines after any `npm install` or `npm ci`, because npm replaces the link with a real folder.
- **A ZIP code is "outside coverage".** With `PROGRAM_SOURCE=fixtures` only ZIP `00000` is supported; with `curated`, only the Hampshire County ZIPs in `backend/app/data/regions.json`.
- **`409 session_busy`.** The previous answer is still being processed. Poll `GET /sessions/{id}` until `busy` is false.
- **`Cannot find name 'LayoutProps'` from `tsc`.** Run `npm run typecheck`, which generates Next.js route types first, instead of calling `tsc` directly.
- **`404 session_not_found` after a restart.** Sessions live in memory, so restarting the backend clears them. Start a new session, or keep sessions across restarts while developing: `DEV_SESSION_FILE=.dev-sessions.json .venv/bin/uvicorn app.main:app --port 8000 --env-file .env` (the `backend` entry in `.claude/launch.json` does this). The file holds answers: it is git-ignored, and must never be set on a shared or deployed server. Delete it to start clean. The browser keeps its session id in `localStorage`, so new tabs reopen the same session.

- **`/api/health` says `llm_mode: off` although `LLM_MODE=live`.** `GEMINI_API_KEY` is missing or empty in `backend/.env`. The app uses its template wording, which gives the same statuses, links and order. Restart the backend after setting the key.
- **"The bank sandbox didn't respond…" or "…has no copy of this simulated profile yet".** Nessie is unreachable, or the sandbox was never seeded for this key. The built-in simulated persona is used instead. To seed it: `cd backend && .venv/bin/python scripts/seed_nessie.py` (this writes fictional records to the shared sandbox).
- **An upload says "We can only read PDF or plain text".** Only `.pdf` and `.txt` files up to 2 MB are accepted. Scanned PDFs without a text layer contain no readable text; type the numbers instead.


## OpenDoor UI notes

- Run the backend with the real programs: `PROGRAM_SOURCE=curated .venv/bin/uvicorn app.main:app --port 8000 --env-file .env` (`fixtures` is still the default and is what most tests use).
- Light only: the landing page, Behind the scenes, the conversation, Building and the Plan Hub (`/home`, `/papers`) ignore the system theme (`components/front/front-theme.tsx`). The old sidebar's light/dark toggle is archived.
- The landing page is `/`, Behind the scenes is `/behind` and the conversation is `/start` (`?sample=1` plays the example, `?need=food` starts with a need picked, `?say=…` starts by reading the person's words). On the income question the conversation offers "Or connect a demo bank account"; once linked it moves on, and the bank's income and bills wait on Home as a "simulated" review card (a lone `bank_suggestions` entry for a question still open is offered as a one-tap confirmation). After review, Building ticks each agent off from its real status and opens `/home` on its own; the dashboard is the Plan Hub at `/home` ("Your plan") and `/papers`, and sends anyone without a finished intake to `/start`. The old sidebar dashboard (`/benefits`, `/benefits/[slug]`, `/local`, `/documents`, `/about`, `/money`) is archived, not deleted, in `frontend/src/app/(opendoor)/_archive/legacy-dashboard/` (not routed); those URLs redirect into the hub (`next.config.ts`). Plan and progress: `docs/plan-hub-integration-plan.md`; design reference: `docs/ui-reference/opendoor-plan-hub.html`. A figure from the bank or a paper that disagrees with an answer is confirmed on Home. The old `/legacy` UI was retired in Phase 6.
- Plan Hub: "Talk it through" sends `POST .../interpret` with `question_id: "needs"`; its `proposed` field carries validated answers to follow-ups the same sentence gives (shutoff, broken heat, eviction or no place tonight, child under 5, someone 60+), applied only when the person taps **Add to my plan**. "Fill my form" uses the `/applications` endpoints (readiness, start, poll, answer, take over, stop) and never presses Send. "Watch demo" runs the real UI on a throwaway session (`useSession().beginDemo/endDemo`): the person's session id stays in storage, and plan progress, the helper log and demo papers are not kept. It never starts a form run.
- Where each endpoint shows up: `POST /sessions`, `GET /sessions/{id}` and `POST .../answers` drive every screen; `POST .../interpret` reads what people type in the conversation at `/start`; `POST .../evidence/document` is the "Add a document" card (About you, Documents); `GET /nessie/personas` and `POST .../evidence/nessie` are the "Try a sandbox profile" card (About you); a fact read from either is confirmed through the confirm card (Home, About you). `GET /health` is API-only (used by checks and the demo script). Agent statuses appear on Building's checklist and under "How we checked this" in the program drawer; the action plan orders Home and supplies its step wording.
- `BACKEND_URL` is read when Next.js builds its rewrites: for `next build` / `next start`, set it at build time, not only at start.
- `NEXT_PUBLIC_UI_FIXTURE=1 npm run dev` runs the UI from `src/lib/fixtures/snapshot.ts` with no backend.
- Demo only: open any page with `?demo=1` to show "Agents at work" (`src/components/loop/agent-flow-mini.tsx`), which replays API calls (method, route template, status, time) and the Administrator's trace steps as they happen: under the checklist on Building ("Putting your plan together"), and as a bottom-right pill elsewhere. The device remembers it; `?demo=0` turns it off. No answers, ids or bodies are shown.
- Regenerate the contract fixture: `.venv/bin/python scripts/make_snapshot.py` in `backend/`, then `npm run sync:fixture` in `frontend/`.
- Keep the repo out of iCloud-synced folders (Desktop, Documents). With "Optimize Mac Storage" on, macOS evicts synced files when disk space is low: Python then hangs on imports and `.git` can be corrupted. Also never symlink `node_modules` elsewhere: the lockfile records the symlinked paths.
