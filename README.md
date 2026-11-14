# Community Resource Navigator

A guided assistant that helps people find government assistance programs and local community resources, see whether they *might* qualify, and leave with a prioritised list of next steps.

Built as a 36-hour hackathon MVP (HackUMass). The working name is a placeholder.

> **Project status: the guided intake works end to end in the browser against fictional test programs.**
> Built: question registry, Administrator and graph, session API, profile building, program filtering over 23 curated Hampshire County records, deterministic eligibility checks, a ranked plan of next steps, and the web UI: one question at a time, then program cards and a printable plan. Sections marked **Planned** describe the agreed design in [docs/foundation-plan.md](docs/foundation-plan.md) and are not implemented.

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
7. A collapsed *How we put this together* panel shows each of the four specialist steps, its status and time, and counts drawn from the results. It shows no generated reasoning.

## Architecture (Planned)

```text
Next.js frontend  ──/api/* proxy──>  FastAPI  ──>  LangGraph
                                                    │
                                    Agent Administrator (deterministic router)
                                    ├─ User Intelligence   builds the typed profile
                                    │    ├─ Nessie sandbox service (optional)
                                    │    └─ document extraction (stretch)
                                    ├─ Program Discovery   filters curated, sourced programs
                                    ├─ Eligibility         compares profile to documented criteria
                                    └─ Action Planning     ranks next steps
                                                    │
                                    Typed shared state + in-memory checkpoints
```

- Each answer triggers one graph run. The Administrator picks the next step from state: update the profile, discover programs, assess eligibility, plan, or ask one more question.
- Specialists never message each other. Each returns a typed update to shared state.
- Discovery supplies sourced criteria before Eligibility assesses; Action Planning consumes the assessments.
- Structured eligibility rules are evaluated in code. The language model is used only to interpret free-text answers and to word explanations.
- Each program gets one of four preliminary labels. A rule the provider states but the app cannot check (most rules) can never yield more than *possibly a fit*. Facts from simulated bank data or a document count only once the user confirms them.
- The frontend polls a session snapshot for progress and results.

## Prerequisites

- Node.js 20 or newer and npm
- Python 3.12 or newer
- An Anthropic API key (only for live model mode)
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
| `GET /health` | Liveness and configuration flags. No secrets. |

Error codes: `session_not_found` (404), `stale_question` (409), `session_busy` (409), `validation_error` (422).

Try it with the backend running:

```bash
curl -s -X POST http://127.0.0.1:8000/api/sessions
curl -s -X POST http://127.0.0.1:8000/api/sessions/<session_id>/answers \
  -H 'content-type: application/json' \
  -d '{"question_id": "needs", "selected_option_ids": ["food", "utilities"]}'
```

## Environment variables

Set these in `backend/.env`. That file is git-ignored; never commit keys or real personal data. The model and Nessie integrations are planned, so only `PROGRAM_SOURCE` changes behaviour today.

| Variable | Required | Purpose |
|---|---|---|
| `PROGRAM_SOURCE` | No | `fixtures` loads fictional development programs for the made-up ZIP code `00000`, labelled as test data in every response. Any other value (e.g. `curated`) uses the 23 curated records in `backend/app/data/programs/` and the 25 Hampshire County ZIP codes in `backend/app/data/regions.json`. `.env.example` sets `fixtures`. |
| `LLM_MODE` | No | `live` or `off`. With `off`, wording comes from templates and no model is called. |
| `ANTHROPIC_API_KEY` | Only when `LLM_MODE=live` | Model access for free-text interpretation and explanations. |
| `LLM_MODEL` | No | Model ID to use in live mode. |
| `NESSIE_API_KEY` | No | Enables the simulated banking profile. Without it, a seeded fallback persona is used and labelled as such. |

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

Today, with `PROGRAM_SOURCE=fixtures`, open the app and choose *Food & groceries* and *Utilities & energy bills*, enter ZIP `00000`, then answer the utility, household-size and income questions. The app shows fictional programs, a ranked plan and one follow-up question at a time; answers can be edited or skipped. `backend/tests/test_api.py` runs the same flow through the API.

Planned for the real demo:

- **Region:** Amherst / Hampshire County, Massachusetts. Supported ZIP codes are listed in `backend/app/data/regions.json` (25 Hampshire County ZIPs from the MassGIS ZIP layer; Amherst is `01002` and `01003`). Use `PROGRAM_SOURCE=curated`.
- **Persona (fictional):** a retired person living alone on about $1,400 a month, worried about groceries and energy bills.
- **Script:** choose *Food* and *Utilities* → enter a supported ZIP → household of 1 → $1,400 a month → review programs and roadmap → answer the one follow-up question and watch the results update → optionally pick the simulated bank profile.

## Scope and limitations

- **Informational only.** Fit labels are preliminary. Only the program's provider decides eligibility.
- **Grounded data.** Program details and links come from a hand-curated, dated dataset for one region. The app does not search the live web and says so when a ZIP code is outside coverage.
- **Simulated banking.** Nessie is a sandbox. No real bank account is ever connected, and deposits are not treated as verified income.
- **No applications.** The app never submits anything on a user's behalf.
- **Not production-ready.** No authentication, no persistence, no rate limiting.

## Repository structure

```text
CLAUDE.md                          guidance for coding agents
docs/foundation-plan.md            architecture, contracts, tickets, risks
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
backend/app/services/              programs repository, in-memory session store
backend/app/data/fixtures/         fictional development programs and region
backend/app/data/programs/         curated program records, one JSON file each
backend/app/data/regions.json      supported ZIP codes (curated source)
docs/curation/                     per-record evidence: source URL and quote for each fact
backend/tests/                     pytest suite and the shared snapshot fixture
frontend/src/app/                  pages
frontend/src/components/intake/    guided intake: question card, answered list,
                                   progress, follow-up framing, change summary
frontend/src/components/results/   results: next steps, program cards, status badges,
                                   activity panel
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

Planned topics once the features exist: missing model key in live mode, Nessie unavailable.
