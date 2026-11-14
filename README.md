# Community Resource Navigator

A guided assistant that helps people find government assistance programs and local community resources, see whether they *might* qualify, and leave with a prioritised list of next steps.

Built as a 36-hour hackathon MVP (HackUMass). The working name is a placeholder.

> **Project status: planning complete, implementation not started.**
> The repository currently contains documentation only. Sections marked **Planned** describe the agreed design in [docs/foundation-plan.md](docs/foundation-plan.md). Commands marked **unverified** have not been run yet and will be confirmed or corrected when the scaffold lands.

## Who it is for

Adults facing financial or logistical hardship who need help finding food, utility, housing, healthcare, transportation, or senior services. The interface is meant to be usable by people of any technical ability.

## How it works for the user

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

## Setup and run (Planned — commands unverified)

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --port 8000
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Environment variables (Planned)

Set these in `backend/.env`. That file is git-ignored; never commit keys or real personal data.

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

## Tests and checks (Planned — commands unverified)

```bash
# backend
cd backend && pytest

# frontend
cd frontend && npm run lint && npx tsc --noEmit
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

Present today:

```text
CLAUDE.md                  guidance for coding agents
README.md                  this file
docs/foundation-plan.md    architecture, contracts, tickets, risks
```

Planned:

```text
backend/app/graph/         shared state, graph wiring, Administrator, question registry
backend/app/agents/        the four specialists, one file each
backend/app/services/      LLM wrapper, Nessie client, programs repository, session store
backend/app/api/           routes and request/response schemas
backend/app/data/programs/ curated program records, one JSON file per program
backend/tests/
frontend/src/app/          pages
frontend/src/components/   question controls, program cards, roadmap, activity panel
frontend/src/lib/          API client and shared types
```

Where to make changes, once the scaffold exists:

- **An agent's behaviour:** its file in `backend/app/agents/`. Graph wiring and shared state are contract files; coordinate before editing them.
- **A program record:** add or edit a file in `backend/app/data/programs/`, following the curation procedure in the [foundation plan](docs/foundation-plan.md) (section B.7). Copy URLs from the provider's page; never write one from memory.
- **A question:** the question registry in `backend/app/graph/`.
- **An integration:** `backend/app/services/`.

## Troubleshooting

This section will be filled in with validated commands once the application runs. Expected topics: session expired after a backend restart, missing model key in live mode, Nessie unavailable, and an unsupported ZIP code.
