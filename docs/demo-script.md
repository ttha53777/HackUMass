# Demo script

About 4 minutes. It uses real, hand-checked Hampshire County records. The persona is fictional.

`backend/tests/test_demo_smoke.py` runs the same answers through the API (five times, each in a fresh app) and must pass before every demo (`cd backend && .venv/bin/pytest tests/test_demo_smoke.py`).

## Before you start

1. `backend/.env`: `PROGRAM_SOURCE=curated`. Use `LLM_MODE=off` for the safest run; use `live` only if `GEMINI_API_KEY` is set and was rehearsed.
2. Start the backend **without** `--reload`, so a file save can't wipe the session:
   `cd backend && .venv/bin/uvicorn app.main:app --port 8000 --env-file .env`
3. Start the frontend: `cd frontend && npm run dev`, then open the printed URL.
4. Check that `curl -s localhost:8000/api/health` shows the `llm_mode` you expect.
5. Use a fresh browser window, or **About you → Start over** (tap twice) for a clean session.

**Persona (fictional):** someone living alone in Amherst, worried about groceries and a heating system that just stopped working in the home they own.

## Script

| # | Do | Say / point at |
|---|---|---|
| 1 | Open the page. Type a first name, **Get started**. | Welcome, not a chat box. The name stays on this device; other languages are marked *Soon*. |
| 2 | Tick **Food & groceries** and **Heat & utility bills** → **Continue**. | One question per screen. The right rail shows programs in view and what we heard. |
| 3 | ZIP **01002** → **Continue**. | Coverage is deliberately narrow: only programs we checked by hand. |
| 4 | Household **1**, **None of these** → **Show my results**. | Three questions, then the Building screen: each row is a real agent step, checked off when the backend says it finished. |
| 5 | Home. | One next step, ranked by the Action Planning agent, with its wording and caveat. *After that*, two paths (government benefits, local help), and the sharpen card: the one question that would settle the most programs. |
| 6 | **About you** → *Questions you can answer* → heat & utilities: **My heating system is broken** → **Save answer**. | Any open question can be answered from anywhere. The toast says what moved. |
| 7 | Housing: **I own my home**. Then benefits you get: **Fuel Assistance** → **Save answer**. | **The key moment.** "Got it. … moved to likely fit." Heating System Repair now fits (broken system, homeowner, gets Fuel Assistance); the Good Neighbor Energy Fund no longer does, because it is for people who don't get state aid. |
| 8 | **Government benefits**. | Fuel Assistance shows *You have this*. Each card: who decides, questions left, documents, when. "One yes opens more" shows which approvals unlock others. |
| 9 | Open the **SNAP** guide → *I'm starting this application*. Tap **I have this** on a document if one is listed. | Five sections from the record: check, gather, apply (easiest way first, phone chips, a call script), what to ask, track the decision. Saved on this device only. |
| 10 | **Home**. | "Pick up where you left off": the started guide is now the next step. |
| 11 | **Local help** → tap a card. | Grouped by how you get started; the week calendar shows only posted hours. The drawer: reasons, the rules with source links, verified date, and **How we checked this** (agent steps, counts only). |
| 12 | **Documents**. | One list across every application; each paper counts everywhere it's needed. Nothing is uploaded. |
| 13 | Optional: **About you** → *Try a sandbox profile* → pick *Simulated: family of four* → tick consent → **Use this profile**. | Clearly simulated. Its deposits differ from what was said, so nothing is used until the person answers the confirm card. |

Close with the guardrails: eligibility is potential, never official; program facts only come from curated records; nothing is ever submitted for the user; no account, no database, no Social Security number.

## If something goes wrong

| Symptom | Fix |
|---|---|
| "Your last visit timed out, so we started fresh" | The backend restarted. A new session is ready; replay from step 1 (about 30 seconds), or use **Try a sample**. |
| "We couldn't reach the server" | Start the backend on port 8000, then choose **Try again**. |
| Live mode is slow, or wording looks off | Set `LLM_MODE=off` in `backend/.env` and restart the backend. Templates give the same statuses, links and order. |
| "The bank sandbox didn't respond…" | Expected when Nessie is down. The built-in simulated persona is used, and the flow is unchanged. |
| ZIP "outside coverage" | Use `01002`, and check that `PROGRAM_SOURCE=curated`. |
| A question you expected is not listed | It was already answered or skipped: change it under **About you**. |
