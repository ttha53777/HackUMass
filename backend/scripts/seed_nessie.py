"""Seed the Nessie sandbox with the app's fictional personas (opt-in, run once).

    cd backend && .venv/bin/python scripts/seed_nessie.py

Writes to the team's shared Nessie *sandbox*, using NESSIE_API_KEY from
backend/.env. It creates, per persona in app/data/nessie_fallback.json:
a customer named "Simulated <persona-id>", one checking account, its deposits
and bills, and its monthly purchases. A persona whose customer already exists
is skipped, so running it twice is safe.

Nothing here is a real person or account. The key is never printed.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://api.nessieisreal.com"
PREFIX = "Simulated"


def load_key() -> str:
    key = os.environ.get("NESSIE_API_KEY", "").strip()
    env = ROOT / ".env"
    if not key and env.exists():
        match = re.search(r"^NESSIE_API_KEY=(.*)$", env.read_text(), re.M)
        key = match.group(1).strip() if match else ""
    if not key:
        sys.exit("NESSIE_API_KEY is not set in the environment or backend/.env.")
    return key


def created_id(response: httpx.Response) -> str:
    response.raise_for_status()
    return response.json()["objectCreated"]["_id"]


def main() -> None:
    params = {"key": load_key()}
    data = json.loads((ROOT / "app" / "data" / "nessie_fallback.json").read_text())
    with httpx.Client(base_url=BASE, params=params, timeout=10) as client:
        existing = {c.get("last_name") for c in client.get("/customers").json() if c.get("first_name") == PREFIX}
        merchant = created_id(client.post("/merchants", json={"name": f"{PREFIX} grocery store"}))
        for persona in data["personas"]:
            if persona["id"] in existing:
                print(f"skip {persona['id']}: already seeded")
                continue
            customer = created_id(
                client.post("/customers", json={"first_name": PREFIX, "last_name": persona["id"]})
            )
            account = created_id(client.post(f"/customers/{customer}/accounts", json={
                "type": "Checking", "nickname": f"{PREFIX} checking", "rewards": 0,
                "balance": persona["balance"],
            }))
            for deposit in persona["deposits"]:
                created_id(client.post(f"/accounts/{account}/deposits", json={
                    "medium": "balance", "transaction_date": deposit["transaction_date"],
                    "status": deposit["status"], "amount": deposit["amount"],
                    "description": deposit["description"],
                }))
            for bill in persona["bills"]:
                created_id(client.post(f"/accounts/{account}/bills", json={
                    "status": bill["status"], "payee": bill["payee"],
                    "payment_amount": bill["payment_amount"], "payment_date": bill["payment_date"],
                }))
            for purchase in persona.get("purchases", []):
                created_id(client.post(f"/accounts/{account}/purchases", json={
                    "merchant_id": merchant, "medium": "balance", "amount": purchase["amount"],
                    "purchase_date": purchase["purchase_date"], "status": purchase["status"],
                    "description": purchase["description"],
                }))
            print(f"seeded {persona['id']}")


if __name__ == "__main__":
    main()
