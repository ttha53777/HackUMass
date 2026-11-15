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
| 5 | **Your plan** (`/home`). | The Plan Hub: the door opens as steps get done. One green "Do this first" card, then Today / This week / When you are ready, all in the Action Planning agent's order. Government and Local are marked on every card. |
| 6 | Side box *One quick question* → heat & utilities: **My heating system is broken** → **Save**. | Any open question can be answered right there or in **My answers**. The toast says what moved, and moved cards flash. |
| 7 | **My answers** → Housing: **I own my home**; benefits you get: **Fuel Assistance** → **Save**. | **The key moment.** "Got it. … moved to likely fit." Heating System Repair now fits (broken system, homeowner, gets Fuel Assistance); the Good Neighbor Energy Fund no longer does, because it is for people who don't get state aid. |
| 8 | Tap a program title (**More about this**). | The spotlight, all from the record: cost, when, best way, papers ready; why it may fit (the rule checks); ways to apply with phone links; what to bring; a call opener; what to ask; if they say no; one yes can open more; How we checked this. |
| 9 | **Talk it through** → type *I got a shutoff notice and I have a toddler* → **Add to my plan**. | Not a chatbot: one card says what it heard (needs, plus the shutoff and the child under 5) and nothing is added until the person taps. The plan now opens with one deadline step and the urgent banner. |
| 10 | Shortcut **Add a paper once** → a sample paper (fictional) → **Looks right**. | The Document Agent reads it once, the facts wait for a yes, and the paper counts in every step that asks for it. The file stays on the device. |
| 11 | **Papers**. | Saved and needed papers, the form helper switch, "Going to an appointment?", details read from papers to confirm, **Show at the counter**. |
| 12 | Optional: shortcut **Connect a bank** → pick a *Simulated* profile → tick consent → **Connect** → **Looks right**. | Clearly simulated and read-only. A figure that differs from an answer starts unticked. **Disconnect** removes everything read from it. |
| 13 | Optional: **Watch demo** (nav, or the footer link on a phone). | A 70-second walk-through on a separate demo plan; your own plan comes back untouched when it ends. It never starts a form run. |

### Papers to forms (about 3.5 minutes, offline)

Design and the golden fill sheet: [document-to-form-demo-plan.md](document-to-form-demo-plan.md). `backend/tests/test_paper_to_form.py` runs the same fill in headless Chrome with no model and must pass before the demo.

Setup: `backend/.env` with `BROWSER_PROVIDER=local`, `FORM_AGENT_ENGINE=manifest`, `LOCAL_BROWSER_HEADLESS` unset (a Chrome window opens beside the app; the person signs there). No `GEMINI_API_KEY` is needed. Intake as Maya: name **Maya**, **Food** and **Heat & utilities**, ZIP **01002**, household **2** (on purpose), **A child under 5**, **I rent**, income **I'd rather not say**.

| # | Do | Say / point at |
|---|---|---|
| P1 | **Papers** → **Add all demo papers**. | Ten fictional papers read one after another (under 10 s). Each is read as its own kind; the toast counts the details found for forms. |
| P2 | **Your details** → **All N look right**. | Grouped You / Household / Work and income / Home / Bills and benefits, each naming its paper. Kept on this device only; never in server state. |
| P3 | **Your plan** → **Check them**. Household paper: tick **Household size 3** and **At home** → **Looks right**; benefit letter → **Looks right**; the rest **Looks right**. | The conflict: you said 2, the household paper lists 3 (Rosa, 64). Income is $1,240 wages + $1,050 Social Security = $2,290, added, not compared. |
| P4 | **Fuel Assistance** → **Fill my form** (or the **Fill the form for me** shortcut) → **Turn it on** → **I agree, fill my form**. | Readiness: from your answers, from your details (grouped), and one thing we'll ask. A renewal, because last season's approval letter is on file. |
| P5 | Watch it fill. | Visible typing. Every line names its source: "Typed your account number (from your utility bill)". |
| P6 | Answer **Weekday mornings**. | The one field no paper covers. |
| P7 | Handoff at the certify box. In the Chrome window: pick **Electric**, tick certify, type the name, **Submit renewal** → **I'm done**. | The helper never chooses, signs or sends. Confirmation `PRACTICE-FUEL-1234`. |
| P8 | Optional: **SNAP food benefits** → **Fill my form**. | Same papers, a different 4-step layout with a household table. It stops at "Social Security number": we never fill one. |

The past-due notice says "pay by December 1" rather than a shut-off date: Massachusetts protects heating customers in hardship from winter shut-off (November 15 to March 15), and a Fuel Assistance household qualifies.

Close with the guardrails: eligibility is potential, never official; program facts only come from curated records; nothing is ever submitted for the user (the form helper hands Send back to the person); no account, no database, no Social Security number.

## If something goes wrong

| Symptom | Fix |
|---|---|
| "Your last visit timed out, so we started fresh" | The backend restarted. A new session is ready; replay from step 1 (about 30 seconds), or use **Try a sample**. |
| "We couldn't reach the server" | Start the backend on port 8000, then choose **Try again**. |
| Live mode is slow, or wording looks off | Set `LLM_MODE=off` in `backend/.env` and restart the backend. Templates give the same statuses, links and order. |
| The form helper says it couldn't open the browser | `BROWSER_PROVIDER=local` needs `pip install -e ".[browser]"` and Chrome or Playwright's Chromium (`.venv/bin/playwright install chromium`). |
| "The bank sandbox didn't respond…" | Expected when Nessie is down. The built-in simulated persona is used, and the flow is unchanged. |
| ZIP "outside coverage" | Use `01002`, and check that `PROGRAM_SOURCE=curated`. |
| A question you expected is not listed | It was already answered or skipped: change it under **About you**. |
