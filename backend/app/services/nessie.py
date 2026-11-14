"""Simulated banking profile from the Capital One Nessie sandbox (ticket T15).

Nessie is a sandbox: nothing here is a real bank account, and every summary is
marked `simulated: True`. See docs/nessie-spike.md for what was verified.

`summarize(persona_id)` always returns a `FinancialSummary`:
  * live: when a key is set and the sandbox holds the persona seeded by
    scripts/seed_nessie.py (customer "Simulated <persona-id>");
  * otherwise the fictional persona in data/nessie_fallback.json, with
    `source: "seeded_fallback"`, and a notice when live was tried and failed.

Only the aggregated summary leaves this module. Raw transactions are never
stored in session state or logged. Every request has a 5 s timeout and one
retry, inside an overall deadline so the sandbox cannot use up a graph run.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from app.graph.state import FinancialSummary

logger = logging.getLogger(__name__)

BASE_URL = "https://api.nessieisreal.com"
FALLBACK_FILE = Path(__file__).resolve().parents[1] / "data" / "nessie_fallback.json"
REQUEST_TIMEOUT = 5.0
RETRIES = 1
DEADLINE_SECONDS = 12.0
SEEDED_PREFIX = "Simulated"

CAVEATS = [
    "Simulated demo data, not a real bank account.",
    "Deposits are not the same as countable income.",
]
FALLBACK_CAVEAT = "This is a built-in demo profile; the bank sandbox was not used."

NOTICE_UNAVAILABLE = (
    "The bank sandbox didn't respond, so we used a built-in simulated profile instead."
)
NOTICE_NOT_SEEDED = (
    "The bank sandbox has no copy of this simulated profile yet, so we used the built-in one."
)

_UTILITY_WORDS = ("electric", "gas", "oil", "heat", "water", "utility", "power", "energy")


@dataclass(frozen=True)
class Persona:
    id: str
    label: str
    description: str


@dataclass(frozen=True)
class SummaryResult:
    summary: FinancialSummary
    notice: tuple[str, str] | None = None  # (code, safe message)


class NessieUnavailable(Exception):
    pass


def _months_spanned(start: date, end: date) -> int:
    return max(1, (end.year * 12 + end.month) - (start.year * 12 + start.month) + 1)


def _date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _amount(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if number == number and abs(number) < 1e9 else 0.0  # drop NaN and absurd values


def aggregate(
    persona_id: str,
    source: str,
    deposits: list[dict],
    bills: list[dict],
    outflows: list[float],
    balance: float | None,
    period: tuple[date, date] | None = None,
) -> FinancialSummary:
    """Reduce transactions to the summary. Cancelled items are ignored."""
    kept = [d for d in deposits if str(d.get("status", "completed")).lower() != "cancelled"]
    dates = [d for d in (_date(x.get("transaction_date")) for x in kept) if d]
    if period is None:
        if dates:
            period = (min(dates), max(dates))
        else:
            today = date.today()
            period = (today, today)
    months = _months_spanned(*period)
    total = round(sum(_amount(d.get("amount")) for d in kept), 2)
    live_bills = [b for b in bills if str(b.get("status", "")).lower() != "cancelled"]
    outflow = sum(_amount(b.get("payment_amount")) for b in live_bills) + sum(outflows)
    payees = []
    for bill in live_bills:
        payee = str(bill.get("payee", "")).strip()
        if payee and any(w in payee.lower() for w in _UTILITY_WORDS) and payee not in payees:
            payees.append(payee[:60])
    caveats = list(CAVEATS) + ([FALLBACK_CAVEAT] if source == "seeded_fallback" else [])
    return FinancialSummary(
        source=source,  # type: ignore[arg-type]
        persona_id=persona_id,
        period_start=period[0],
        period_end=period[1],
        total_deposits=total,
        avg_monthly_deposits=round(total / months, 2),
        avg_monthly_outflow=round(outflow / months, 2) if outflow else None,
        utility_bill_signals=payees,
        balance_snapshot=balance,
        caveats=caveats,
    )


class NessieService:
    def __init__(
        self,
        api_key: str | None,
        *,
        transport: httpx.BaseTransport | None = None,
        fallback_file: Path = FALLBACK_FILE,
        deadline: float = DEADLINE_SECONDS,
    ) -> None:
        self._key = (api_key or "").strip() or None
        self._transport = transport
        self._deadline = deadline
        data = json.loads(fallback_file.read_text())
        self._period = (date.fromisoformat(data["period_start"]), date.fromisoformat(data["period_end"]))
        self._fallback = {p["id"]: p for p in data["personas"]}

    @classmethod
    def from_env(cls) -> "NessieService":
        return cls(os.environ.get("NESSIE_API_KEY"))

    @property
    def configured(self) -> bool:
        return self._key is not None

    def personas(self) -> list[Persona]:
        return [Persona(p["id"], p["label"], p["description"]) for p in self._fallback.values()]

    def has_persona(self, persona_id: str) -> bool:
        return persona_id in self._fallback

    # -- fallback ----------------------------------------------------------

    def _from_fallback(self, persona_id: str) -> FinancialSummary:
        p = self._fallback[persona_id]
        return aggregate(
            persona_id, "seeded_fallback", p["deposits"], p["bills"],
            list(p.get("purchases_total", [])), p.get("balance"), self._period,
        )

    # -- live --------------------------------------------------------------

    def _get(self, client: httpx.Client, path: str, started: float) -> Any:
        last: Exception | None = None
        for _ in range(RETRIES + 1):
            remaining = self._deadline - (time.monotonic() - started)
            if remaining <= 0:
                break
            try:
                response = client.get(path, timeout=min(REQUEST_TIMEOUT, remaining))
                response.raise_for_status()
                return response.json()
            except (httpx.HTTPError, ValueError) as exc:
                last = exc
        # Error class only: URLs carry the key and bodies carry transactions.
        raise NessieUnavailable(last.__class__.__name__ if last else "deadline")

    def _from_live(self, persona_id: str) -> FinancialSummary | None:
        started = time.monotonic()
        with httpx.Client(
            base_url=BASE_URL, params={"key": self._key}, transport=self._transport
        ) as client:
            customers = self._get(client, "/customers", started)
            if not isinstance(customers, list):
                raise NessieUnavailable("shape")
            match = next(
                (c for c in customers
                 if isinstance(c, dict) and c.get("first_name") == SEEDED_PREFIX
                 and c.get("last_name") == persona_id),
                None,
            )
            if match is None:
                return None
            customer_id = match.get("_id") or match.get("id")
            accounts = self._get(client, f"/customers/{customer_id}/accounts", started)
            deposits: list[dict] = []
            bills: list[dict] = []
            outflows: list[float] = []
            balance = 0.0
            for account in accounts if isinstance(accounts, list) else []:
                account_id = account.get("_id") or account.get("id")
                balance += _amount(account.get("balance"))
                deposits += [d for d in self._get(client, f"/accounts/{account_id}/deposits", started) or [] if isinstance(d, dict)]
                bills += [b for b in self._get(client, f"/accounts/{account_id}/bills", started) or [] if isinstance(b, dict)]
                outflows += [
                    _amount(p.get("amount"))
                    for p in self._get(client, f"/accounts/{account_id}/purchases", started) or []
                    if isinstance(p, dict) and str(p.get("status", "")).lower() != "cancelled"
                ]
        if not deposits:
            return None
        return aggregate(persona_id, "nessie_sandbox", deposits, bills, outflows, round(balance, 2))

    # -- entry point -------------------------------------------------------

    def summarize(self, persona_id: str) -> SummaryResult:
        if persona_id not in self._fallback:
            raise KeyError(persona_id)
        if not self.configured:
            return SummaryResult(self._from_fallback(persona_id))
        try:
            live = self._from_live(persona_id)
        except NessieUnavailable as exc:
            logger.warning("nessie unavailable (%s); using seeded persona", exc)
            return SummaryResult(self._from_fallback(persona_id), ("nessie_unavailable", NOTICE_UNAVAILABLE))
        if live is None:
            return SummaryResult(self._from_fallback(persona_id), ("nessie_not_seeded", NOTICE_NOT_SEEDED))
        return SummaryResult(live)
