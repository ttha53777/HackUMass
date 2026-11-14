# Demo script

About 4 minutes. It uses real, hand-checked Hampshire County records. The persona is fictional.

`backend/tests/test_demo_smoke.py` runs this exact script through the API and must pass before every demo (`cd backend && .venv/bin/pytest tests/test_demo_smoke.py`).

## Before you start

1. `backend/.env`: `PROGRAM_SOURCE=curated`. Use `LLM_MODE=off` for the safest run; use `live` only if `GEMINI_API_KEY` is set and was rehearsed.
2. Start the backend **without** `--reload`, so a file save can't wipe the session:
   `cd backend && .venv/bin/uvicorn app.main:app --port 8000 --env-file .env`
3. Start the frontend: `cd frontend && npm run dev`, then open the printed URL.
4. Check that `curl -s localhost:8000/api/health` shows the `llm_mode` you expect.
5. Use a fresh browser window; *Start over* also gives a clean session.

**Persona (fictional):** a retired person living alone in Amherst on about $1,400 a month, worried about groceries and an electric bill they are behind on.

## Script

| # | Do | Say / point at |
|---|---|---|
| 1 | Open the page. | The app leads: the first question is already there. It's not a chat box. |
| 2 | Tick **Food & groceries** and **Utilities & energy bills** → **Continue**. | Tap-to-answer. Every later question depends on these choices. |
| 3 | ZIP **01002** → **Continue**. | Coverage is deliberately narrow: only programs we checked by hand. |
| 4 | **I'm behind on a bill**. | Single choices advance on tap. The teaser shows programs were already found. |
| 5 | Household **1** → **Continue**. | The question explains why it's asked. |
| 6 | **$1,400**, *per month* → **Continue**. | "An estimate is fine." Income is asked only because nearby programs have income limits. |
| 7 | Results appear. | Header "near Amherst (01002)", the tally, and the *guide, not a decision* box. |
| 8 | Scroll to **Your next steps**. | Ranked: open-access meals first (no application), then what to check. "Act soon" comes from the behind-on-a-bill answer. Every link comes from the provider's record. |
| 9 | Open **May not fit** → *Good Neighbor Energy Fund* → **Why we think this**. | Not met: $16,800 a year is below the $53,586 minimum. The rule, the numbers and the source are all shown. |
| 10 | Back at the top: the follow-up card ("could change 1 result") → **I own my home**. | **The key moment.** *What changed* says Heating System Repair moved from "More information needed" to "Possibly a fit", and it moves up the plan. |
| 11 | Optional: offer → **Yes** → pick *Simulated: retired, fixed monthly income* → tick consent → **Use this simulated profile**. | Clearly simulated sandbox data. Deposits match the $1,400 answer, so nothing changes and no question is needed. |
| 11b | Optional alternative: pick *Simulated: family of four*. | Deposits of $5,350 conflict with the answer: the app keeps the person's number and asks. Answer **No, that's not right**. |
| 12 | Open **How we put this together**. | Four specialists, real statuses and counts, no invented "AI reasoning". |
| 13 | **Print or save**. | A plan to take to an appointment, with links written out. |

Close with the guardrails: eligibility is preliminary, program facts only come from curated records, nothing is ever submitted for the user, and there's no account or database.

## If something goes wrong

| Symptom | Fix |
|---|---|
| "Your earlier session expired" | The backend restarted. The app has already started a new session; replay from step 2 (about 30 seconds). |
| "We couldn't reach the server" | Start the backend on port 8000, then choose *Try again*. |
| Live mode is slow, or wording looks off | Set `LLM_MODE=off` in `backend/.env` and restart the backend. Templates give the same statuses, links and order. |
| "The bank sandbox didn't respond…" | Expected when Nessie is down. The built-in simulated persona is used, and the flow is unchanged. |
| ZIP "outside coverage" | Use `01002`, and check that `PROGRAM_SOURCE=curated`. |
| Results say "Updating…" for long | Wait for the poll (about 1 s); in live mode the model call can take several seconds. |
