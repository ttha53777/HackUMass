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
| `GET /nessie/personas` | The fictional demo bank profiles, each labelled *Simulated*. |
| `POST /sessions/{id}/evidence/nessie` | Body `{"persona_id", "consent": true}`. Uses a simulated bank profile; `200` or `202` like answers. Deposits become an **unconfirmed** income estimate, and the app asks the person to confirm it before relying on it. |
| `POST /sessions/{id}/evidence/document` | Multipart: `file` (PDF or `.txt`, 2 MB max) and `consent=true`. Reads only household size and income from labelled lines such as "Gross monthly pay: $1,400". The file is deleted right after reading, and its text is never stored. Found numbers wait for the person to confirm them. |
| `GET /health` | Liveness and configuration flags. No secrets. |

Error codes: `session_not_found` (404), `stale_question` (409), `session_busy` (409), `validation_error` (422), `consent_required` (400), `unsupported_file` (415).

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
| `GEMINI_API_KEY` | Only when `LLM_MODE=live` | Google Gemini access for matching "Other" answers and for plainer wording of explanations and next steps. Without it, live mode falls back to templates and `/api/health` reports `off`. |
| `LLM_MODEL` | No | Gemini model ID for live mode. Default `gemini-3.5-flash-lite`. |
| `NESSIE_API_KEY` | No | Capital One Nessie **sandbox** key (`https://api.nessieisreal.com`). The sandbox starts empty for each key; seed it once with `backend/scripts/seed_nessie.py` (writes fictional personas to the shared sandbox). Without the key, or without seeded personas, the app uses the fictional personas in `backend/app/data/nessie_fallback.json`, labelled as seeded. See [docs/nessie-spike.md](docs/nessie-spike.md). |

The frontend needs no secrets. The browser only calls same-origin `/api/*`, which Next.js forwards to the backend.

## Sessions

- No account and no database. Session state lives in the backend process's memory.
- State is kept across questions for as long as the backend keeps running.
- Restarting the backend clears every session. The app then shows a "session expired" message and starts a new one.
- Run the backend without auto-reload during a demo so a file save does not wipe the session.

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
docs/foundation-plan.md            architecture, contracts, tickets, risks
docs/demo-script.md                the demo, step by step, with recovery steps
backend/app/main.py                FastAPI entry point; wires graph, programs, sessions
backend/app/api/routes.py          HTTP routes
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
frontend/src/components/front-door/ Welcome, the 3 core questions, Building
frontend/src/components/home/      Home: next step, plan, sharpen card, glance strip
frontend/src/components/benefits/  Government benefits and the step-by-step guide
frontend/src/components/local/     Local help and the week calendar
frontend/src/components/documents/ the document wallet
frontend/src/components/about/     About you: answers, sources, start over
frontend/src/components/evidence/  optional document upload, sandbox profile, confirm card
frontend/src/components/program/   program card, drawer, question form, How we checked this
frontend/src/components/session/   session, answer and device-plan providers
frontend/src/components/shell/     sidebar, bottom tabs, toast, gate
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
- **`404 session_not_found` after a restart.** Sessions live in memory, so restarting the backend clears them. Start a new session.

- **`/api/health` says `llm_mode: off` although `LLM_MODE=live`.** `GEMINI_API_KEY` is missing or empty in `backend/.env`. The app uses its template wording, which gives the same statuses, links and order. Restart the backend after setting the key.
- **"The bank sandbox didn't respond…" or "…has no copy of this simulated profile yet".** Nessie is unreachable, or the sandbox was never seeded for this key. The built-in simulated persona is used instead. To seed it: `cd backend && .venv/bin/python scripts/seed_nessie.py` (this writes fictional records to the shared sandbox).
- **An upload says "We can only read PDF or plain text".** Only `.pdf` and `.txt` files up to 2 MB are accepted. Scanned PDFs without a text layer contain no readable text; type the numbers instead.


## OpenDoor UI notes

- Run the backend with the real programs: `PROGRAM_SOURCE=curated .venv/bin/uvicorn app.main:app --port 8000 --env-file .env` (`fixtures` is still the default and is what most tests use).
- Front door is `/`; the dashboard lives at `/home`, `/benefits`, `/benefits/[slug]`, `/local`, `/documents`, `/about`. The old `/legacy` UI was retired in Phase 6.
- Where each endpoint shows up: `POST /sessions`, `GET /sessions/{id}` and `POST .../answers` drive every screen; `POST .../evidence/document` is the "Add a document" card (About you, Documents); `GET /nessie/personas` and `POST .../evidence/nessie` are the "Try a sandbox profile" card (About you); a fact read from either is confirmed through the confirm card (Home, About you). `GET /health` is API-only (used by checks and the demo script). Agent statuses appear on the Building screen and under "How we checked this" in the program drawer; the action plan orders Home and supplies its step wording.
- `BACKEND_URL` is read when Next.js builds its rewrites: for `next build` / `next start`, set it at build time, not only at start.
- `NEXT_PUBLIC_UI_FIXTURE=1 npm run dev` runs the UI from `src/lib/fixtures/snapshot.ts` with no backend.
- Regenerate the contract fixture: `.venv/bin/python scripts/make_snapshot.py` in `backend/`, then `npm run sync:fixture` in `frontend/`.
- Keep the repo out of iCloud-synced folders (Desktop, Documents). With "Optimize Mac Storage" on, macOS evicts synced files when disk space is low: Python then hangs on imports and `.git` can be corrupted. Also never symlink `node_modules` elsewhere: the lockfile records the symlinked paths.
