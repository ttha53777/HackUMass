# Community Resource Navigator

A guided assistant that helps people find government assistance programs and local community resources, see whether they *might* qualify, and leave with a prioritised list of next steps.

Built as a 36-hour hackathon MVP (HackUMass). The working name is a placeholder.

> **Project status: scaffold and shared contracts are in place; the guided intake is not built yet.**
> Today the app shows a placeholder page and a backend health check. Sections marked **Planned** describe the agreed design in [docs/foundation-plan.md](docs/foundation-plan.md) and are not implemented.

## Who it is for

Adults facing financial or logistical hardship who need help finding food, utility, housing, healthcare, transportation, or senior services. The interface is meant to be usable by people of any technical ability.

## How it works for the user (Planned)

The app leads; the user answers. It is not an open-ended chatbot.

1. The app opens with a question: "What are you having the most trouble with right now?"
2. It asks for a ZIP code, then a few short questions chosen from the user's needs and from what nearby programs actually require.
3. Every question has tap-to-answer options where possible, and non-essential questions can be skipped.
4. It shows matching government and community programs, each with a source link and a preliminary fit label.
5. It produces an ordered roadmap of next steps, and revises it when the user adds or corrects information.

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

Open the URL that `npm run dev` prints. It is <http://localhost:3000> unless that port is taken, in which case Next.js picks the next free one. The page shows "Backend connected" when the proxy reaches FastAPI.

The frontend forwards `/api/*` to `http://127.0.0.1:8000`. Set `BACKEND_URL` when starting the frontend to point it elsewhere.

## Environment variables

Set these in `backend/.env`. That file is git-ignored; never commit keys or real personal data. Only the health check reads them today; the model and Nessie integrations are planned.

| Variable | Required | Purpose |
|---|---|---|
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

## Reproducing the demo (Planned)

Set `LLM_MODE=off` for a fully deterministic run.

- **Region:** Amherst / Hampshire County, Massachusetts. The exact supported ZIP codes will be listed here once the dataset is curated.
- **Persona (fictional):** a retired person living alone on about $1,400 a month, worried about groceries and energy bills.

Script: choose *Food* and *Utilities* → enter a supported ZIP → *Retired* → household of 1 → $1,400 a month → review programs and roadmap → answer the one follow-up question and watch the results update → optionally pick the simulated bank profile.

## Scope and limitations

- **Informational only.** Fit labels are preliminary. Only the program's provider decides eligibility.
- **Grounded data.** Program details and links come from a hand-curated, dated dataset for one region. The app does not search the live web and says so when a ZIP code is outside coverage.
- **Simulated banking.** Nessie is a sandbox. No real bank account is ever connected, and deposits are not treated as verified income.
- **No applications.** The app never submits anything on a user's behalf.
- **Not production-ready.** No authentication, no persistence, no rate limiting.

## Repository structure

```text
CLAUDE.md                       guidance for coding agents
docs/foundation-plan.md         architecture, contracts, tickets, risks
backend/app/main.py             FastAPI entry point
backend/app/api/routes.py       routes (health only so far)
backend/app/api/schemas.py      request/response shapes        (contract file)
backend/app/graph/state.py      shared LangGraph state models  (contract file)
backend/app/agents/             the four specialists           (empty, planned)
backend/app/services/           LLM, Nessie, programs, sessions (empty, planned)
backend/app/data/programs/      curated program records         (empty, planned)
backend/tests/                  pytest suite and the shared snapshot fixture
frontend/src/app/               pages (placeholder home page)
frontend/src/components/        UI components; `ui/` holds shadcn components
frontend/src/lib/types.ts       TypeScript mirror of the API   (contract file)
frontend/src/lib/fixtures/      generated copy of the snapshot fixture
```

Contract files are shared by every workstream. Agree changes with the team first, and change the Python and TypeScript sides together.

Where changes will go as the planned pieces are built:

- **An agent's behaviour:** its file in `backend/app/agents/`. Graph wiring and shared state are contract files; coordinate before editing them.
- **A program record:** add or edit a file in `backend/app/data/programs/`, following the curation procedure in the [foundation plan](docs/foundation-plan.md) (section B.7). Copy URLs from the provider's page; never write one from memory.
- **A question:** the question registry in `backend/app/graph/` (planned).
- **An integration:** `backend/app/services/`.

## Troubleshooting

- **"Backend not reachable" on the home page.** Start the backend on port 8000, or set `BACKEND_URL` for the frontend.
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
- **`Cannot find name 'LayoutProps'` from `tsc`.** Run `npm run typecheck`, which generates Next.js route types first, instead of calling `tsc` directly.

Planned topics once the features exist: session expired after a backend restart, missing model key in live mode, Nessie unavailable, unsupported ZIP code.
