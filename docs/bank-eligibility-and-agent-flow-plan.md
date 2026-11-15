# Plan: bank signals for eligibility + live agent-flow panel

Status: proposal, not built. Two independent parts; either can ship alone.

---

## Part A — Use three unused bank signals in eligibility

### Principle (unchanged)

The bank never decides eligibility. Nessie is **evidence** that fills profile
facts. Every fact it fills is `provenance="nessie_sandbox"`, `confirmed=False`,
`source="bank:<persona>"`. The Eligibility agent already treats such facts as
weak (`_is_weak`), so they can lift a program to `possibly_eligible` but never
to `likely_eligible` until the person confirms. Disconnect already removes every
unconfirmed `nessie_sandbox` fact (`forget_bank_evidence`), so new facts get
that for free.

**Eligibility agent: no code change.** Everything happens before it, in the
Nessie service and the Profile Agent (User Intelligence).

### A1. Countable income instead of raw deposits

Today `monthly_income = avg_monthly_deposits`, which counts transfers, refunds
and one-off deposits as income. The summary itself warns about that.

| Change | Where |
|---|---|
| New `countable_monthly_income(summary)` = sum of `income_sources` where `kind in {"wages","benefit"}`; `"other"` excluded | `services/nessie.py` |
| `_income_fact()` uses it; falls back to `avg_monthly_deposits` only when no source is classified | `agents/user_intelligence.py` |
| Confirmation wording: "about $X a month from paychecks and benefits" instead of "in deposits" | `graph/questions.py` `_describe` |

Effect: fewer false `likely_ineligible` once confirmed (e.g. SNAP help, Lifeline,
Fuel Assistance income tables).

### A2. Recurring bills → housing and utility facts

`summary.bills` (payee category, average, last status) maps to facts that
program rules and the question registry already use:

| Bank signal | Fact (unconfirmed) | Rules / behaviour it feeds |
|---|---|---|
| A `rent` bill exists | `housing_status = "renting"` | Craig's Doors, Fuel Assistance (housing_status); skips the housing question |
| A `utilities` bill that is a heating payee (oil, gas, heat) **and** a separate rent bill | `heat_included_in_rent = "no"` | Fuel Assistance renters path; skips that question |
| Utility payee matches Eversource | `eversource_customer = "yes"` | Eversource discount rate (`eq yes`) |
| Latest `utilities` bill `overdue` | `utility_urgency = "behind"` | Ranking and RAFT / CAPV crisis wording; `STRENGTH` already ranks it below a shut-off notice from a paper |
| Latest `rent` bill `overdue` | `housing_need = "behind"` | RAFT, CAPV rent/utility (`crisis` group) |

Rules for this mapping:
- Never infer `shutoff`: an overdue bill isn't a shut-off notice. That stays a
  question or a document.
- A fact is only filled when it is relevant to a need the person picked (no
  housing facts if they only asked about food).
- Overdue rent is sensitive: it is always confirmed through the review card
  (A4), never shown as a settled fact.

### A3. Income type → benefit and situation hints

`summary.income_sources` / `benefit_signals` say *where* money comes from.
`benefits_held` options are SNAP, MassHealth and Fuel Assistance, and none of
those arrive as bank deposits (SNAP is EBT; fuel aid is paid to the vendor). So
income type does not fill `benefits_held`. Instead it steers the next question
and fills one hint:

| Bank signal | Effect |
|---|---|
| `unemployment` deposits | `situation = "looking_for_work"` (unconfirmed), which raises MassHire in the ranking |
| `social_security` deposits | Raise priority of the `age_60_plus` and `benefits_held` questions (no fact set: SSDI ≠ 60+) |
| Only `benefit` income, no wages | Raise priority of `benefits_held` ("People with fixed income often already get…") |

"Raise priority" is a small hook in `next_followup_question` that reads
`state.financial_summary.benefit_signals`. It changes which question comes
next, never a fact.

### A4. One review card for all bank facts

Several new facts mean several confirmation questions, which would be tiring.
Reuse the existing review card (`ReviewDecision{document_id, accept, edits}`)
with `document_id = "bank:<persona>"`: one card, "The simulated bank profile
suggests…", where each line can be accepted or fixed. Accepted fields become
`confirmed=True`; edits become `user_reported`. `confirm_monthly_income` stays
as the single-question path when income is the only bank fact.

### A5. Work list

| # | Task | Files | Coordinate? |
|---|---|---|---|
| 1 | `bank_facts(summary, needs) -> dict[str, Fact]` (pure, A1–A3) | `services/nessie.py` | — |
| 2 | Profile Agent calls `apply_evidence_facts(profile, bank_facts(...))` instead of income only | `agents/user_intelligence.py` | — |
| 3 | `apply_review` accepts `bank:` cards | `agents/user_intelligence.py` | — |
| 4 | Question priority hook + wording | `graph/questions.py` | — |
| 5 | Snapshot exposes the bank review card | `api/views.py`, `api/schemas.py`, `frontend/src/lib/types.ts` | **yes** |
| 6 | Fallback personas: one overdue utility bill, one Eversource payee, one unemployment persona; reseed | `data/nessie_fallback.json`, `scripts/seed_nessie.py` | — |
| 7 | Frontend card reuses `review-card.tsx`, labelled "Simulated" | `components/chat/review-card.tsx`, `components/bank/` | — |

Tests: mapping table per signal; no `shutoff` ever inferred; user answer beats
bank (conflict path); disconnect removes all bank facts; eligibility stays
`possibly_eligible` until the card is accepted, then can reach `likely_eligible`;
snapshot fixture re-synced (`npm run sync:fixture`).

---

## Part B — Mini "live agent flow" panel for the demo

### What it shows

A small panel that plays the backend's agentic loop as it happens: API call in,
Administrator routing, each agent working, external service calls, and the loop
back to the person. One line of plain English per step.

```
┌ Agents at work ────────────────── ● live ┐
│ ↗ POST /evidence/nessie        202  41ms │
│ ◆ Administrator → Profile Agent          │
│     new bank evidence to read            │
│ ⛁ Profile Agent → Nessie sandbox         │
│     simulated data · 3 facts, unconfirmed│
│ ◆ Administrator → Eligibility Agent      │
│     income changed: re-check 6 programs  │
│ ✓ Eligibility Agent  6 programs checked  │
│ ↩ Administrator asks you to confirm      │
│ ↙ GET /sessions/…              200  12ms │
└──────────────────────────────────────────┘
```

### Data sources (no values, ever)

| Lane | Source | Change needed |
|---|---|---|
| API calls | Thin wrapper in `lib/api.ts` emits `{method, route template, status, ms}` to a tiny client store. No bodies, IDs shortened. | Frontend only |
| Agent steps | `snapshot.trace` (already polled; `InMemorySaver` checkpoints each step so mid-run polls see progress). Diff by `seq`. | None |
| Service calls | New trace step `"called"` with `node` = `nessie` / `llm` / `web_search` and `reason` = `live` / `seeded_fallback` / `timeout`. Emitted from the Profile Agent and LLM service. | `graph/state.py` `TraceStep` + `types.ts`, **coordinate** |

Sentences come from `components/loop/templates.ts` (`describe`, `agentLabel`),
extended with the `called` step, so the panel and "How we got here" use the same
wording.

### Pacing

Most runs finish in under a second, too fast to follow. The panel keeps a queue
and shows each new event for at least ~450 ms (0 with reduced motion). It never
shows a step the backend hasn't reported; it only slows the replay.

### Where it appears

- **Building screen:** under the existing `Checklist` while the plan is built.
- **Everywhere else:** a collapsed pill at bottom right ("● Agents working") that
  opens while `app.working` and fades out 2 s after the run ends; click to keep it open.
- Shown with `?demo=1` (remembered in `localStorage`) so normal users don't see it.

### Work list

| # | Task | Files |
|---|---|---|
| 1 | API event store + fetch wrapper | `frontend/src/lib/api-events.ts`, `lib/api.ts` |
| 2 | `called` trace step from Nessie / LLM / web search | `graph/state.py`, `graph/trace.py`, `agents/user_intelligence.py`, `services/llm.py`, `frontend/src/lib/types.ts` |
| 3 | Templates for `called` + API lines | `components/loop/templates.ts` |
| 4 | `AgentFlowMini` (queue, pacing, lanes, icons, chips reused from `loop-trace.tsx`) | `components/loop/agent-flow-mini.tsx` |
| 5 | Mount in `Building` and app shell behind `?demo=1` | `components/chat/building.tsx`, `components/shell/` |

Done when: connecting a bank persona with `?demo=1` plays the full sequence
above; nothing in the panel contains an answer, amount, name or document text
(test on `templates.ts` output); lint and typecheck pass.

---

## Suggested order

1. B1, B3, B4, B5 with agent steps only (no backend change): demo-ready quickly.
2. A1 (smallest eligibility win), then A2 + A4, then A3.
3. B2 once the `state.py` / `types.ts` change is agreed with the team.
