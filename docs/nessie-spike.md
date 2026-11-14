# Nessie spike (T12)

**Date:** 2026-11-14. **Timebox:** 2 h. **Key:** the team's sandbox key in `backend/.env` (`NESSIE_API_KEY`); never written here.

Nessie is Capital One's hackathon **sandbox**. Nothing in it is a real bank account, and the app labels every value from it "simulated".

## Confirmed by calling the API

| Question | Finding |
|---|---|
| Base URL | `https://api.nessieisreal.com`. Plain `http://` refuses connections. `api.reimaginebanking.com` does not resolve. |
| Auth | `?key=<API key>` query parameter. |
| Key validation | **Not observable from a read.** `GET /customers` returns `200 []` for our key *and* for a made-up key, so a successful GET does not prove the key is valid. |
| Data scoping | Our key starts with **no customers and no accounts** (`GET /customers` → `[]`, `GET /accounts` → `[]`). `GET /atms` returns shared demo data. So per-key data is empty, and **personas must be seeded** with POST calls. |
| Docs endpoints | `/documentation`, `/api-docs`, `/swagger.json` return `403 Missing Authentication Token` (AWS API Gateway). The public docs site renders client-side and could not be read. No official docs were used. |
| Validation errors | Bad bodies get `400` with a plain-text list of missing fields. |

Required fields, read from those validation errors:

| Route | Required body fields |
|---|---|
| `POST /customers` | none (an empty body is accepted: **201**, `{"code":201,"message":"Customer created","objectCreated":{"_id":"<uuid>"}}`) |
| `POST /customers/{id}/accounts` | `type`, `nickname`, `rewards`, `balance` |
| `POST /accounts/{id}/deposits` | `medium`, `transaction_date`, `status`, `amount`, `description` |
| `POST /accounts/{id}/purchases` | `merchant_id`, `medium`, `amount` |
| `POST /accounts/{id}/bills` | `status`, `payee`, `payment_amount` |
| `POST /merchants` | `name` |

IDs are UUID strings in `objectCreated._id`.

## Not confirmed (treat as assumptions)

- Enum values. From Nessie's historical documentation:
  - account `type`: `Checking` / `Savings` / `Credit Card`;
  - `medium`: `balance` / `rewards`;
  - deposit `status`: `pending` / `cancelled` / `completed`;
  - bill `status`: `pending` / `cancelled` / `completed` / `recurring`.
- The read routes `GET /customers/{id}/accounts`, `GET /accounts/{id}/deposits` and `GET /accounts/{id}/bills`, and their response field names. Our key has no data to read.
- `DELETE` behaviour.

These were not probed further: creating and deleting records in the shared sandbox was stopped, pending the team's decision.

**Side effect of the spike:** one empty customer (`a043541a-…`) was created by the empty-body `POST /customers` probe. It has no name and no accounts. The app ignores customers it did not seed.

## Decision: conditional go

- **Fallback first.** `backend/app/data/nessie_fallback.json` holds three fictional, clearly simulated personas. The app works fully without Nessie, and summaries built from this file say `source: "seeded_fallback"`.
- **Live reads are optional.** If `NESSIE_API_KEY` is set and the sandbox has personas seeded by `backend/scripts/seed_nessie.py` (customers named `Simulated <persona-id>`), the app reads deposits and bills from the sandbox. Anything else falls back to the seeded file, with a notice: no key, no matching customer, an error, a timeout (5 s, one retry) or an unexpected shape.
- **Seeding is a manual, opt-in step.** It writes to the shared sandbox, so a teammate runs it once: `cd backend && .venv/bin/python scripts/seed_nessie.py`. The script is idempotent: it skips personas that already exist.
- **Privacy:** only the aggregated `FinancialSummary` enters graph state. Raw transactions stay inside the service call and are never logged.
