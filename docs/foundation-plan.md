# Community Resource Navigator — Foundation Plan

**Status:** planning output for the 36-hour MVP. Implemented so far: T1–T11, T13, T12, T14 (live mode not yet verified against the real API), T15 and T16. Gemini replaced Anthropic for D10; `income_min` added to `Requirement.kind`. See `README.md` for what runs today.
**Source spec:** *Community Resource Navigator — Hackathon MVP Product & Technical Specification* (handoff PRD).
**Date:** 2026-11-14

Items marked **VERIFY** depend on third-party behaviour or real-world facts that have not been confirmed and must be checked before code or data relies on them.

---

## A. Architecture summary and key decisions

### A.1 Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **One graph run per HTTP turn; no `interrupt()`.** Each answer invokes the graph from `START` on the session's `thread_id`; the graph runs until the Administrator sets a `pending_question` or reaches `complete`, then ends. | Editing an earlier answer, skipping, and attaching evidence all become "another input to the same graph". LangGraph `interrupt()`/`Command(resume=…)` re-runs the node from the top on resume and ties the resume to one pending interrupt, which makes back/edit awkward. |
| D2 | **Administrator is deterministic code**, not an LLM supervisor. Routing is a pure function of state. | Spec §8.1 constraint; removes the largest source of demo flakiness. |
| D3 | **Question selection is data-driven.** A typed question registry holds every askable question. After Discovery, the Administrator only asks registry questions whose `target_field` is referenced by a requirement of at least one candidate program. | "Ask only what matters" falls out of the data rather than hand-written branches. Food and housing diverge automatically because their programs reference different fields. |
| D4 | **Eligibility is deterministic for structured rules.** LLM use is limited to wording explanations and never changes a status. | Spec §8.4; statuses are testable without a model. |
| D5 | **`LLM_MODE=off` is a first-class mode.** Every LLM call has a template fallback. | The scripted demo and the whole test suite run with no network and no key. |
| D6 | **Discovery reads curated JSON only.** No live web search in the MVP. | Spec §13; live search is on the cut list. |
| D7 | **Background run + polling, with a fast path.** `POST …/answers` starts the graph run and waits up to 0.8 s. If the run finishes it returns `200` with the current snapshot; otherwise it returns `202` with `busy: true` and the frontend polls `GET /sessions/{id}` about once a second until `busy` is false. | One code path for fast and slow turns. Progress is visible because the checkpointer saves after every node. SSE adds failure modes for no demo gain. |
| D8 | **Next.js proxies `/api/*` to FastAPI** through a `rewrites` entry. | No CORS configuration, no backend URL in browser code, keys stay server-side. |
| D9 | **Preliminary roadmap first, follow-ups second.** After the first Eligibility pass the plan is produced and shown; up to two eligibility-triggered follow-ups are then offered alongside the results and revise them. | Users get value even if they stop answering; the revision is the visible "new evidence changes the plan" moment. |
| D10 | **Model provider: Google Gemini** (changed from Anthropic during T14), model ID from `LLM_MODEL` (default `gemini-3.5-flash-lite`), called through one thin wrapper (`services/llm.py`) using the `google-genai` SDK's `models.generate_content` with a JSON schema. No LangChain model or agent abstractions. | Fewer dependencies. Only `langgraph` is needed from that ecosystem. Call shape verified against SDK 3.3.0 on 2026-11-14. |

### A.2 Responsibilities

| Layer | Owns | Does not own |
|---|---|---|
| Next.js | Rendering the snapshot, question controls, polling, session id in `sessionStorage` | Business rules, question order, eligibility, any secret |
| FastAPI | HTTP contract, session lifecycle, per-session run lock, background run, upload validation, Nessie calls | Deciding the next step (delegates to the graph) |
| LangGraph | State, routing, specialist execution, checkpoints | HTTP, UI wording beyond question prompts and explanations |

### A.3 Session lifetime

- `session_id` is a server-generated UUID4 and is also the LangGraph `thread_id`.
- State lives in an `InMemorySaver` created once at process start. A restart loses every session.
- A lost session returns `404 session_not_found`; the frontend shows "Your session expired — start again" and creates a new one.
- A per-session `asyncio.Lock` prevents two graph runs on one thread; a second request while a run is active returns `409 session_busy`.
- Idle sessions are dropped after 2 hours by a simple sweep (bounded memory, and a privacy measure).

### A.4 Optional dependencies

| Dependency | Verdict |
|---|---|
| `langgraph` | Required. |
| Provider SDK (`google-genai`) | Installed by default; imported only in live mode. |
| `httpx` | Required (Nessie client, test client). |
| `pypdf` | Only if the document stretch goal is built. |
| LangChain model/agent packages, vector stores, LangSmith | Not justified for the MVP. |
| shadcn/ui | Justified: Button, Card, Badge, Input, Checkbox/Toggle, Dialog, Progress. Add components as needed, not the whole set. |

### A.5 Assumptions for the spec's open questions (§21)

1. **Demo region:** Amherst / Hampshire County, Massachusetts. The supported ZIP list is curated in `regions.json` from an authoritative source (**VERIFY**; do not type ZIPs from memory).
2. **Model:** Gemini via `LLM_MODEL`. One batched call per specialist run, 12 s timeout; a fast error is retried once, a timeout is not; then template fallback. (Reduced from 20 s so two model-using specialists fit the 45 s run budget.)
3. **Documents:** stretch. Not in the live demo unless everything else is green by hour 27.
4. **Nessie:** treated as unverified until ticket T12's spike is done. A seeded fallback file exists from the start.
5. **Categories with full demo coverage:** food and utilities. Housing gets enough records to prove branching. Other categories are best-effort.
6. **Partial results:** yes (D9).
7. **Question budget:** at most 6 core questions before first results; at most 2 eligibility follow-ups; hard cap of 10 questions per session excluding edits.

---

## B. Guided intake, schemas, and contracts

### B.1 Guided UX flow

**First screen.** One line of value proposition, then Question 1 already rendered. No text box is focused or required.

| Order | Question id | Prompt | Type | Asked when |
|---|---|---|---|---|
| 1 | `needs` | "What are you having the most trouble with right now?" | `multi_select` + Other | Always |
| 2 | `zip` | "What ZIP code do you live in?" | `zip` | Always. Not skippable; without it there are no local results. |
| — | *Discovery runs here (instant file filter)* | | | |
| 3+ | `situation` | "Which best describes your current situation?" | `single_select` | A candidate program references `situation` |
| 3+ | `household_size` | "How many people live in your household, including you?" | `number` | A candidate program references `household_size` |
| 3+ | `monthly_income` | "About how much income does your household receive in a month?" | `currency` with period toggle | A candidate program has an income rule |
| 3+ | need-specific (e.g. `utility_urgency`, `housing_status`) | per registry | `single_select` | Selected need matches and a candidate program references the field |
| — | *Eligibility, then Action Planning; results and roadmap shown* | | | |
| F1–F2 | follow-ups (e.g. `age_60_plus`, `heat_included_in_rent`) | per registry | usually `single_select` | The answer could change at least one assessment's status |
| E | `evidence_offer` | "Would you like to use a demo bank profile to help narrow this down?" | `single_select` | Once, after first results. Always skippable. |

Need-specific and follow-up questions above are **examples**. The real set is whatever fields the curated program requirements reference; add a registry entry only when a verified requirement needs it.

**Branching examples.**

- *Food + Utilities, retired:* `needs` → `zip` → `situation` → `household_size` → `monthly_income` → results → follow-up on an age threshold if a senior program is a candidate.
- *Housing only:* `needs` → `zip` → `housing_status` → `household_size` → `monthly_income` → results. `utility_urgency` is never asked.
- *Transportation only, no income-tested candidates:* `needs` → `zip` → results. Income is never asked.

**Controls.**

- `single_select` auto-advances on choice; every other type needs **Continue**.
- Every skippable question shows "Skip / I'm not sure". A skip records the field in `skipped_fields`; it is never asked again unless the user edits it.
- Sensitive questions show their `reason` under the prompt ("We ask about income because some programs have income limits. An estimate is fine.").
- Answered questions appear as a compact list with an **Edit** action. Editing re-opens that question; submitting it goes through the same answer endpoint.
- Progress shows a phase label ("Understanding your needs", "Finding programs", "Checking fit", "Building your plan"), not a percentage.

**When asking stops.** The Administrator moves on to Eligibility when any of these is true: no unanswered, unskipped core question is referenced by a candidate program; 6 core questions have been asked; the session's total cap is reached.

**Unsupported ZIP.** The snapshot carries `coverage: "unsupported"` with a plain message that only the demo region is covered, plus a "Change ZIP" action. No programs are shown and none are invented.

### B.2 Question and answer schema

```python
class Option(BaseModel):
    id: str            # stable, e.g. "food"
    label: str

class Question(BaseModel):
    id: str                                  # stable registry id
    prompt: str
    reason: str | None                       # shown for sensitive questions
    type: Literal["single_select", "multi_select", "text", "number", "currency", "zip"]
    options: list[Option] = []
    allow_other: bool = False
    skippable: bool = True
    target_field: str                        # profile field this fills
    origin: Literal["core", "eligibility_followup", "conflict", "evidence_offer"]

class AnswerIn(BaseModel):
    question_id: str
    selected_option_ids: list[str] = []
    value: float | str | None = None         # number / currency / zip
    period: Literal["week", "month", "year"] | None = None
    text: str | None = None                  # "Other" or free text, max 500 chars
    skipped: bool = False
```

The spec lists five response types; `currency` is added so the income control can carry a period.

### B.3 Canonical state

```python
Provenance = Literal["user_reported", "document_extracted", "nessie_sandbox", "inferred"]

class Fact(BaseModel):
    value: Any
    provenance: Provenance
    updated_at: datetime
    period: str | None = None                # for income
    confirmed: bool = True                   # False while a conflict is open

class Conflict(BaseModel):
    field: str
    candidates: list[Fact]

class Profile(BaseModel):
    facts: dict[str, Fact] = {}              # keys are registry target_fields
    conflicts: list[Conflict] = []

class Requirement(BaseModel):
    id: str
    kind: Literal["income_max", "income_min", "age_min", "age_max", "residency",
                  "household", "categorical", "open_access", "text_only"]
    field: str | None                        # profile field compared, None for text_only
    op: Literal["lte", "gte", "eq", "in"] | None
    value: Any | None                        # scalar, list, or table keyed by household size
    period: str | None
    text: str                                # provider wording, paraphrased closely
    source_url: str
    verified: bool

class Program(BaseModel):
    id: str
    name: str
    provider: str
    type: Literal["government", "community"]
    categories: list[str]
    service_area: ServiceArea                # zips and/or county and/or statewide
    description: str                         # provider fact
    info_url: str
    apply_url: str | None
    contact: str | None
    documents_needed: list[str] | None       # None = unknown
    requirements: list[Requirement]
    unknowns: list[str]
    verified_on: date
    program_period: str | None

class CriterionResult(BaseModel):
    requirement_id: str
    result: Literal["met", "not_met", "unknown"]
    evidence: str | None                     # e.g. "household_size = 1 (user reported)"

class EligibilityAssessment(BaseModel):
    program_id: str
    status: Literal["likely_eligible", "possibly_eligible",
                    "likely_ineligible", "insufficient_information"]
    criteria: list[CriterionResult]
    missing_fields: list[str]
    explanation: str
    source_urls: list[str]
    disclaimer: str                          # constant text
    inputs_hash: str                         # hash of the profile fields this used

class ActionItem(BaseModel):
    rank: int
    program_id: str
    action_type: Literal["apply_now", "confirm_eligibility", "get_more_information"]
    rationale: str
    next_step: str
    documents: list[str] | None
    link: str                                # copied from the Program record
    urgency: Literal["high", "medium", "low", "unknown"]
    depends_on: list[str] = []
    uncertainty: str | None

class SessionState(TypedDict, total=False):
    session_id: str
    workflow_phase: Literal["intake", "discovering", "evaluating",
                            "awaiting_user", "planning", "complete", "error"]
    intake: IntakeState          # asked ids, answered ids, skipped_fields, counts
    pending_question: Question | None
    user_answer: AnswerIn | None             # consumed by User Intelligence
    pending_evidence: EvidenceRequest | None # nessie persona or document ref
    profile: Profile
    consents: dict[str, bool]                # {"nessie": .., "document": ..}
    financial_summary: FinancialSummary | None
    documents: list[DocumentExtraction]
    coverage: Literal["unknown", "supported", "unsupported"]
    programs: list[Program]
    eligibility_assessments: dict[str, EligibilityAssessment]   # keyed by program_id
    action_plan: list[ActionItem]
    dirty: DirtyFlags                        # discovery, eligibility_ids, plan
    agent_statuses: dict[str, AgentStatus]
    errors: list[SafeError]
```

There is no `messages` transcript in the MVP. The answered-question list is derived from `intake` plus `profile`. Add a bounded transcript only if free-form clarification is built.

**Ownership.** Each node returns only its own keys; the only shared key is `agent_statuses`, which uses a dict-merge reducer.

| Key | Writer |
|---|---|
| `workflow_phase`, `pending_question`, `intake`, `dirty` | Administrator |
| `profile`, `consents`, `financial_summary`, `documents`; clears `user_answer` and `pending_evidence` | User Intelligence |
| `programs`, `coverage` | Program Discovery |
| `eligibility_assessments` | Eligibility |
| `action_plan` | Action Planning |

**Invalidation.** User Intelligence reports `changed_fields`. The Administrator then sets:

- `dirty.discovery = True` if `needs` or `zip` changed. Discovery re-runs and assessments for programs no longer present are dropped.
- `dirty.eligibility_ids` gains every program with a requirement whose `field` is in `changed_fields`. Only those are re-assessed. `inputs_hash` is a second guard: an assessment whose hash no longer matches is never served.
- `dirty.plan = True` whenever any assessment changed.

While anything is dirty, the snapshot marks affected results `stale: true` so the UI never shows an old claim as current.

**Frontend types** mirror the snapshot in `frontend/src/lib/types.ts`, written by hand from `api/schemas.py`. Both files are contract files (see §C.3).

### B.4 Agent contracts

| Agent | Inputs | Outputs | Tools | Deterministic | LLM | On failure |
|---|---|---|---|---|---|---|
| **Administrator** | Whole state | `workflow_phase`, `pending_question`, `intake`, `dirty`, statuses | None | Everything | Nothing | Sets `error` phase with a safe message after budget exhaustion |
| **User Intelligence** | `user_answer` + its `Question`, `profile`, `pending_evidence` | `profile`, `changed_fields`, `conflicts`, `financial_summary`, `consents` | Nessie service, document extractor | Option, number, currency, ZIP normalisation; conflict detection; Nessie aggregation | Mapping "Other"/free text onto known option ids or a short note; document fact extraction | Free text kept as an unparsed note; evidence failure recorded in `errors`, flow continues |
| **Program Discovery** | `needs`, `zip`, broad qualifiers | `programs`, `coverage` | Programs repository | Region and category filter, dedupe, ordering | Nothing in MVP | Malformed record skipped and logged by id; empty result is a valid outcome |
| **Eligibility** | `profile`, `programs`, `dirty.eligibility_ids` | `eligibility_assessments` | None | Every criterion result and every status | `explanation` wording only | Template explanation |
| **Action Planning** | `profile`, `programs`, assessments | `action_plan` | None | Ranking, `action_type`, links, documents, urgency | `rationale` and `next_step` wording | Template wording |

**Status rule (deterministic).**

1. Any verified requirement is `not_met` → `likely_ineligible`.
2. Otherwise, a structured requirement is `unknown` because a profile field is missing → `insufficient_information`, with that field in `missing_fields`.
3. Otherwise, all structured requirements are `met` and there are `text_only` or unverified requirements → `possibly_eligible`.
4. Otherwise, all requirements are verified and `met` → `likely_eligible`.
5. A program with no requirements recorded → `insufficient_information` with the explanation "We could not verify this program's requirements; confirm with the provider."

A fact with `confirmed = False` or provenance `nessie_sandbox` can never produce `likely_eligible` on its own; the best it yields is `possibly_eligible`.

**Follow-up scoring.** For each field in any assessment's `missing_fields` that has a registry question and has not been asked or skipped: score = number of assessments whose status would leave `insufficient_information` if it were known, weighted ×2 for programs in the user's first-selected need. Ask the top one. Stop after two.

**Planning rank.** Sort by: `action_type` (`apply_now` for `likely_eligible`, `confirm_eligibility` for `possibly_eligible`, `get_more_information` for `insufficient_information`; `likely_ineligible` is excluded from the plan but stays visible on its card), then need order as selected by the user, then community programs with `open_access` first within a tier because they are the fastest help. `urgency` is `unknown` unless the user's answers support it (for example a "behind on bill" answer).

**LLM output guard.** Generated wording passes a check before it is stored: it must not contain a URL, a dollar amount, or a date that is absent from the program record it describes. On failure the template is used.

### B.5 LangGraph execution plan

```text
START
  └─> administrator ──(route)──┬─> user_intelligence ──┐
            ▲                  ├─> discovery ──────────┤
            │                  ├─> eligibility ────────┤
            │                  ├─> action_planning ────┤
            └──────────────────┴───────────────────────┘
                               └─> END
```

`route(state)` returns the first match:

1. `user_answer` or `pending_evidence` present → `user_intelligence`
2. `dirty.discovery` and `needs` and `zip` known → `discovery`
3. core question still worth asking → set `pending_question`, phase `intake` → `END`
4. `dirty.eligibility_ids` non-empty → `eligibility`
5. `dirty.plan` → `action_planning`
6. follow-up or evidence offer available and budget left → set `pending_question`, phase `awaiting_user` → `END`
7. otherwise → phase `complete` → `END`

- **Session creation** invokes the graph with empty state; rule 3 fires and Question 1 is returned synchronously.
- **Answer validation** happens in FastAPI before the graph runs: an unknown `question_id` is rejected; an id that is neither the pending question nor a previously answered one returns `409 stale_question`.
- **Parallelism:** none in the first slice. Discovery is a local file filter, so there is nothing to wait for. If Nessie latency hurts, fetch it inside User Intelligence with a 5 s timeout and fall back.
- **Budgets:** graph `recursion_limit` 25 per run; each specialist may run at most twice per run (counter in state); LLM calls 20 s and 1 retry; Nessie 5 s and 1 retry; whole run 45 s wall clock, after which the phase becomes `error` with whatever results exist preserved.
- **No infinite loops:** every route step either consumes an input (`user_answer`), clears a dirty flag, or ends. A node that fails clears its dirty flag and records an error rather than leaving the flag set.

### B.6 API contract

All routes are under `/api`. Error body: `{"error": {"code": str, "message": str}}`.

| Method and path | Request | Response | Notes |
|---|---|---|---|
| `POST /sessions` | — | `201 SessionSnapshot` | Includes `session_id` and the first `pending_question`. |
| `GET /sessions/{id}` | — | `200 SessionSnapshot` | Polled while `busy` is true. |
| `POST /sessions/{id}/answers` | `AnswerIn` | `200` or `202 SessionSnapshot` | Also used for edits and skips. `200` = run finished; `202` = still running, poll. |
| `GET /nessie/personas` | — | `200 [{id, label, description}]` | Labels say "simulated". |
| `POST /sessions/{id}/evidence/nessie` | `{persona_id, consent: true}` | `202 SessionSnapshot` | `consent` must be literally true. |
| `POST /sessions/{id}/evidence/document` | multipart, `consent=true` | `202 SessionSnapshot` | Stretch. PDF or text, 2 MB cap. |
| `GET /health` | — | `200 {status, llm_mode, nessie_configured}` | No secrets. |

```ts
type SessionSnapshot = {
  session_id: string;
  phase: "intake" | "discovering" | "evaluating" | "awaiting_user" | "planning" | "complete" | "error";
  busy: boolean;                      // a graph run is active; keep polling
  pending_question: Question | null;
  answered: { question_id: string; prompt: string; display_value: string; skipped: boolean }[];
  profile_summary: { field: string; label: string; display_value: string; provenance: Provenance }[];
  coverage: "unknown" | "supported" | "unsupported";
  programs: ProgramCard[];            // program + its assessment + stale flag
  action_plan: ActionItem[];
  plan_stale: boolean;
  agent_statuses: Record<AgentName, { status: "queued" | "running" | "completed" | "failed" | "skipped"; updated_at: string }>;
  financial_summary: FinancialSummaryView | null;   // always carries simulated: true
  notices: { code: string; message: string }[];     // recoverable problems, safe wording
};
```

| Code | HTTP | Meaning |
|---|---|---|
| `session_not_found` | 404 | Unknown id or lost on restart |
| `stale_question` | 409 | Answer does not match the pending or an answered question |
| `session_busy` | 409 | A run is in progress |
| `validation_error` | 422 | Bad shape, bad ZIP format, out-of-range number |
| `consent_required` | 400 | Evidence submitted without consent |
| `unsupported_file` | 415 | Wrong type or too large |

Unsupported ZIP, no matches, Nessie down, and LLM timeout are **not** HTTP errors. They arrive as `coverage`, an empty list, or `notices` on a normal snapshot.

### B.7 Data plan

**Files** (all under `backend/app/data/`):

- `programs/<program-id>.json` — one `Program` per file, so teammates curating in parallel do not conflict.
- `regions.json` — supported ZIPs with city and county.
- `nessie_fallback.json` — seeded personas for when the sandbox is empty or down; summaries built from it carry `source: "seeded_fallback"`.

**Curation procedure**, per program:

1. Open the provider's own page. Copy the URL from the browser; never type or generate one.
2. Record description, service area, and requirements in the provider's terms. Anything not stated is listed under `unknowns`.
3. Encode a requirement as structured only when the page gives an explicit threshold or rule; otherwise `text_only`.
4. Income tables: record the table, its period, and the program year exactly, with the page that shows it as `source_url`.
5. Set `verified_on` to the day it was checked. A second teammate spot-checks every record used in the scripted demo.
6. A loader test fails the build on missing `info_url`, missing `verified_on`, or a non-https URL.

**Candidate sources to investigate** (names only; **VERIFY** every fact from the provider page before a record exists): Massachusetts DTA (SNAP), the regional fuel-assistance administrator for Hampshire County, MassHealth, RAFT housing assistance, Amherst Survival Center, Food Bank of Western Massachusetts, Amherst Senior Center, the regional elder-services agency, PVTA reduced-fare programs, Town of Amherst resident services.

**Target:** 20 records minimum, at least 8 community/nonprofit, at least 6 food and 5 utilities, at least 3 housing.

**Nessie normalisation.**

```python
class FinancialSummary(BaseModel):
    source: Literal["nessie_sandbox", "seeded_fallback"]
    simulated: Literal[True] = True
    persona_id: str
    period_start: date
    period_end: date
    total_deposits: float
    avg_monthly_deposits: float
    avg_monthly_outflow: float | None
    utility_bill_signals: list[str]          # payee/category labels, no amounts beyond totals
    balance_snapshot: float | None
    caveats: list[str]                       # always includes "Deposits are not the same as countable income."
```

- Only the summary enters graph state. Raw transactions stay inside the Nessie service call and are not logged.
- If the user has not reported income, `avg_monthly_deposits` becomes a `monthly_income` fact with provenance `nessie_sandbox` and `confirmed = False`, and a confirmation question is queued ("The demo profile shows about $X a month in deposits. Is that close to your household's monthly income?").
- If the user has reported income and the two differ by more than 20 %, a `Conflict` is recorded and the same confirmation question is asked. The user-reported value stays in force until they answer.
- **T12 result** (see `docs/nessie-spike.md`): base `https://api.nessieisreal.com`, `?key=` auth, per-key data starts empty so personas must be seeded (`backend/scripts/seed_nessie.py`); conditional go with the seeded file as the default path.

### B.8 Security and privacy checklist

- [ ] `GEMINI_API_KEY` and `NESSIE_API_KEY` exist only in `backend/.env`, which is git-ignored; `backend/.env.example` holds names with empty values.
- [ ] No `NEXT_PUBLIC_*` variable carries a secret. The browser only calls same-origin `/api/*`.
- [ ] Snapshot responses are built from an allow-list view model, never by dumping state.
- [ ] Consent is recorded in `consents` before any Nessie call or document parse; the endpoints reject requests without it.
- [ ] No SSN, full date of birth, name, or street address is ever requested. Age is collected as a range or a threshold yes/no.
- [ ] Logs contain session id, node name, timing, and error codes. They never contain answers, profile values, transactions, or document text.
- [ ] Uploads: type and size checked, parsed from a temp file that is deleted in a `finally` block, extracted text discarded after fact extraction.
- [ ] Document text and any retrieved text are passed to the model inside a delimited data block with an instruction that the content is data. Extraction output is schema-validated and limited to known profile fields, so injected text cannot add programs, URLs, or statuses.
- [ ] Session ids are unguessable UUID4s; one session cannot read another's state.
- [ ] Every results view shows: informational only, the provider decides eligibility, "as of" date per program, and "simulated" on all Nessie-derived values.
- **Known limitations:** no authentication, no encryption at rest (nothing is at rest), no rate limiting, sessions vanish on restart, coverage limited to the demo region.

### B.9 Future MongoDB seam

Only two seams are created now:

1. `services/session_store.py` exposes `get_checkpointer()`. Swapping `InMemorySaver` for a durable checkpointer is a one-line change there.
2. `services/programs_repo.py` exposes `ProgramsRepository` with `list(region, categories)` and `get(id)`. The file-backed class is the only implementation.

Agents depend on these functions and on `SessionState`, never on storage. No Mongo adapter, no generic repository layer, no ORM models.

---

## C. Build sequence

### C.1 Build first

**The first milestone is the vertical slice with fixtures, in `LLM_MODE=off`:** session creation returns Question 1 → answers advance through the registry → profile is built → Discovery filters 4–6 fixture programs → Eligibility assigns statuses → Action Planning returns a templated roadmap → frontend renders all of it by polling. No Nessie, no documents, no LLM, no styling beyond legible.

Everything else attaches to that slice.

### C.2 Phases

| Hours | Work | Exit criterion |
|---|---|---|
| 0–2 | T1 scaffold, T2 contracts, root docs updated with verified commands. In parallel: T12 Nessie spike, T8 curation starts. | Both dev servers start; contract files merged; teammates unblocked. |
| 2–6 | T3 graph skeleton and Administrator, T4 question registry, T5 API, T6 frontend question renderer. | App asks Question 1; answering shows the next adaptive question; refresh keeps the session. |
| 6–14 | T7 User Intelligence, T9 Discovery, T8 reaches 12+ records, T10 Eligibility, T11 Action Planning (templates). | **Vertical slice complete end to end in `LLM_MODE=off`.** Smoke test passes. |
| 14–21 | Follow-up loop, edit/skip invalidation, T13 results and roadmap UI, T14 LLM wrapper and wording. | One follow-up changes one assessment and the plan; editing ZIP refreshes results. |
| 21–27 | T15 Nessie integration and persona picker, T8 reaches 20+ records with second-person review, T16 activity panel. | Nessie optional path works; core flow passes with Nessie unconfigured. |
| 27–33 | Hardening: negative cases, error notices, accessibility pass, source review. T17 documents only if all else is green. | Every acceptance test in §E passes. |
| 33–36 | Demo rehearsal ×3, freeze, README fresh-clone check. | Three clean consecutive runs of the script. |

### C.3 Parallel workstreams

| Stream | Owns | Tickets |
|---|---|---|
| **A — Orchestration/backend** | `backend/app/graph/`, `backend/app/api/`, `services/session_store.py` | T1 (backend half), T2, T3, T5 |
| **B — Programs/eligibility** | `backend/app/data/`, `agents/discovery.py`, `agents/eligibility.py`, `services/programs_repo.py` | T8, T9, T10 |
| **C — Frontend** | `frontend/` | T1 (frontend half), T6, T13, T16 |
| **D — Intake/planning/integrations** | `graph/questions.py`, `agents/user_intelligence.py`, `agents/action_planning.py`, `services/llm.py`, `services/nessie.py` | T4, T7, T11, T12, T14, T15, T17 |

**Contract files** — change only after telling the team, in a small standalone commit: `graph/state.py`, `graph/build.py`, `api/schemas.py`, `frontend/src/lib/types.ts`. Stream A is the only stream that edits `graph/build.py`.

After T2 merges, streams B, C, and D work against fixtures and do not block each other. Stream C can build against a static `snapshot.json` fixture until T5 lands.

### C.4 Deferred

Live web discovery, map view, export/share, accounts and history, MongoDB, SSE streaming, semantic search over programs, free-form chat route, multi-region coverage.

---

## D. Risks and fallbacks

| # | Risk | L | I | Mitigation | Demo fallback |
|---|---|---|---|---|---|
| R1 | Program curation is slower than expected or facts are thin | H | H | Start at hour 0; one file per program; food and utilities first | Demo with 12 solid records; say coverage is deliberately narrow |
| R2 | Nessie sandbox is empty, rate-limited, or behaves differently than assumed | M | M | T12 spike in the first 2 hours; fallback file from day one | Seeded fallback personas, labelled as seeded |
| R3 | LLM latency or outage during the demo | M | H | D5: templates for everything; 20 s timeout | Run with `LLM_MODE=off` |
| R4 | Structured eligibility rules encoded wrongly, giving a confident wrong status | M | H | Second-person review of demo records; unverified rules cap at `possibly_eligible`; unit test per rule kind | Statuses are framed as preliminary with the source link beside each |
| R5 | Graph routing loops or stalls | L | H | Deterministic router, per-run counters, recursion limit, 45 s wall clock | Phase `error` keeps existing results visible |
| R6 | Contract drift between backend schemas and frontend types | M | M | Contract files rule; snapshot fixture checked into both sides; contract test | — |
| R7 | In-memory session lost by dev-server reload mid-demo | M | M | Run the backend without `--reload` for the demo | Frontend recovers with "session expired" and restarts in two clicks |
| R8 | Stale results shown after an edit | M | H | `inputs_hash` guard plus `stale` flags; dedicated test | — |
| R9 | Scope creep into documents, maps, or chat | H | M | Cut list below, enforced at hour 21 | — |
| R10 | Python 3.13 or Next 16 incompatibility with a dependency | L | M | Verified at T1; pin versions in the lockfile then | Drop to Python 3.12 |

**Cut list, in order:** document upload → activity panel timestamps → LLM-written wording (keep templates) → evidence offer question (keep the persona picker button) → housing branch records → Nessie live calls (keep fallback personas). Never cut: app-led intake, profile, Discovery, Eligibility, Action Plan, source links.

---

## E. Implementation tickets

| ID | Ticket | Stream | Depends on | Acceptance criteria |
|---|---|---|---|---|
| T1 | Scaffold `frontend/` (Next.js App Router, TS, Tailwind, shadcn init, `/api` rewrite) and `backend/` (`pyproject.toml`, FastAPI app, `/api/health`, pytest) | A, C | — | Both servers start from documented commands; `GET /api/health` reachable through the Next proxy; `CLAUDE.md` and `README.md` updated with the commands that were actually run. |
| T2 | Contract files: `state.py`, `schemas.py`, `types.ts`, and a `snapshot.json` fixture | A | T1 | Pydantic models validate the fixture; the TS types compile against the same fixture. |
| T3 | Graph skeleton: `build.py`, `administrator.py` with `route()`, stub specialists, `InMemorySaver` | A | T2 | Unit tests cover each of the 7 route rules; a run always terminates; a second invoke on the same thread sees prior state. |
| T4 | Question registry and selection policy | D | T2 | Given fixture programs, food and housing need sets yield different question sequences; a skipped or answered question is never selected again; caps enforced. |
| T5 | API routes, session lock, background run, error codes | A | T3 | `POST /sessions` returns Question 1 with no input; wrong `question_id` → 409; unknown session → 404; concurrent answer → 409. |
| T6 | Question renderer: all six input types, Continue, Skip, answered list with Edit, polling hook | C | T2 | Keyboard-only completion of the intake; visible focus; labels on every control; works at 375 px width. |
| T7 | User Intelligence: normalisation, provenance, `changed_fields`, conflicts | D | T2 | Table-driven tests per question type; ZIP and number validation; a contradicting fact produces a `Conflict` and does not overwrite. |
| T8 | Curated dataset and `regions.json` | B | T2 | Loader test passes on every file; ≥20 records by hour 27; each demo record reviewed by a second person; no URL that was not copied from a provider page. |
| T9 | Discovery agent and programs repository | B | T2 | Supported ZIP + needs returns matching government and community records; unsupported ZIP returns `coverage: unsupported` and no programs; malformed file is skipped without failing the run. |
| T10 | Eligibility agent | B | T2 | Tests for each of the 5 status rules and each requirement kind; missing income → `insufficient_information` with the field named; unverified rule never yields `likely_eligible`; only dirty program ids are recomputed. |
| T11 | Action Planning with templates | D | T2 | Ranking test; every item's `link` equals a URL on its program record; `likely_ineligible` programs are excluded; unknown deadline is stated as unknown. |
| T12 | Nessie spike (2 h timebox) | D | — | Written note of confirmed endpoints, auth, data scoping, and whether seeding is needed; go/no-go on live calls; fallback file drafted. |
| T13 | Results UI: program cards, status badges, criteria detail, roadmap, stale state, unsupported-region and empty states | C | T2 | Every card shows type, source link, "as of" date, and the disclaimer; stale results are visibly marked; statuses are not conveyed by colour alone. |
| T14 | LLM wrapper, free-text mapping, wording generation with output guard | D | T7, T10, T11 | `LLM_MODE=off` never imports or calls the SDK; timeout falls back to template; guard rejects text containing a URL or amount not in the record. |
| T15 | Nessie service, summary normalisation, evidence endpoint, persona picker | D, C | T12, T7, T5 | Consent enforced; summary marked simulated; deposit-derived income stays unconfirmed until the user confirms; Nessie timeout yields a notice and unchanged results. |
| T16 | Agent activity panel | C | T5 | Shows the four specialists' statuses from the snapshot; no invented reasoning text. |
| T17 | Document upload (stretch) | D, C | T7, T5 | PDF/text only, 2 MB cap, temp file deleted, extracted fact shown for confirmation before it changes the profile; injected instructions in a test document have no effect on programs or statuses. |
| T18 | Demo smoke test and script | A | slice | One pytest drives the scripted scenario through the API in `LLM_MODE=off` and asserts: first question present before any input, ≥1 government and ≥1 community program, one follow-up asked, plan non-empty, every link present on a program record. Passes 5 times in a row. |

### Testing strategy

- **Unit:** router rules, question selection, normalisers, each requirement kind, status rules, ranking, Nessie aggregation (from recorded fixtures), output guard.
- **Contract:** `snapshot.json` validates against Pydantic and compiles against TS types; dataset loader test.
- **Integration:** FastAPI `TestClient` flows with the real graph, `LLM_MODE=off`, Nessie mocked with `httpx.MockTransport`: happy path, skip income, edit ZIP after discovery, unsupported ZIP, Nessie timeout, empty Nessie data, session lost.
- **Smoke:** T18.
- **Manual before demo:** keyboard and screen-reader pass on the intake; fresh-clone README check; three rehearsals in live LLM mode and one in off mode.

---

## F. Ready-to-implement checklist

- [ ] Team agrees on decisions D1–D10 and the assumptions in A.5.
- [ ] Workstream owners assigned (A, B, C, D).
- [ ] Demo region confirmed and an authoritative ZIP source identified.
- [ ] Gemini API key available to the team outside the repo; Nessie key requested.
- [ ] Package manager choices confirmed at T1 (plan assumes `npm` and `pip` in a venv; `uv` and `pnpm` are not installed on the planning machine).
- [ ] T1 and T2 merged before any specialist work starts.
- [ ] `snapshot.json` fixture reviewed by frontend and backend owners.
- [ ] Curation procedure (B.7) read by everyone adding program records.
- [ ] Cut list accepted, with the hour-21 checkpoint on the calendar.
- [ ] `CLAUDE.md` word count re-checked after every edit (`wc -w CLAUDE.md` must be under 200).

---

## G. Root documentation

`CLAUDE.md` and `README.md` exist at the repository root. Both describe the planned layout and mark commands as unverified until T1 runs them. T1's acceptance criteria include replacing those markers.

## References used for verification

- LangGraph interrupts and persistence: <https://docs.langchain.com/oss/python/langgraph/interrupts>
- LangGraph human-in-the-loop: <https://docs.langchain.com/oss/python/langgraph/add-human-in-the-loop>
- Nessie official documentation: not located during planning. T12 starts by finding it from the key-signup page; no Nessie URL in this plan is confirmed.
- Third-party description of Nessie routes, unconfirmed: <https://deepwiki.com/aadit2805/drift/4.1-nessie-api-integration>
