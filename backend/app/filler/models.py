"""Filler types: what can be read from a paper, consent, and the details found.

Everything here lives in memory for one session (spec: Consent and document parsing).
Detail values never reach logs; `Detail.view()` is returned only to the session that
owns it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Callable, Literal

Scope = Literal["identity", "contact", "income", "household", "housing"]
SCOPES: tuple[Scope, ...] = ("identity", "contact", "income", "household", "housing")
NOTICE_VERSION = "2026-11-15"

PaperKind = Literal["pay_stub", "state_id", "lease", "other"]
PAPER_KINDS: tuple[PaperKind, ...] = ("pay_stub", "state_id", "lease", "other")
KIND_LABEL = {"pay_stub": "pay stub", "state_id": "ID", "lease": "lease", "other": "paper"}

PaperStatus = Literal["waiting", "queued", "reading", "done", "failed"]
DetailStatus = Literal["proposed", "confirmed"]


# ---------------------------------------------------------------------------
# Validation: every value a model returns passes one of these, or is dropped.
# ---------------------------------------------------------------------------

_SSN_LIKE = re.compile(r"\b\d{3}[- ]?\d{2}[- ]?\d{4}\b")
_LONG_NUMBER = re.compile(r"\d{9,}")  # card, account and document numbers


def _clean(value: Any, limit: int = 120) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text or len(text) > limit or "{{" in text or "}}" in text:
        return None
    if _SSN_LIKE.search(text) or _LONG_NUMBER.search(text.replace(" ", "").replace("-", "")):
        return None
    return text


def _name(value: Any) -> str | None:
    text = _clean(value, 80)
    return text if text and re.fullmatch(r"[A-Za-zÀ-ÿ' .,-]+", text) and re.search(r"[A-Za-zÀ-ÿ]", text) else None


def _date(value: Any) -> str | None:
    text = _clean(value, 20)
    if not text:
        return None
    for pattern in (r"(\d{4})-(\d{2})-(\d{2})", r"(\d{2})/(\d{2})/(\d{4})"):
        m = re.fullmatch(pattern, text)
        if m:
            parts = [int(p) for p in m.groups()]
            year, month, day = parts if pattern.startswith(r"(\d{4})") else (parts[2], parts[0], parts[1])
            try:
                born = date(year, month, day)
            except ValueError:
                return None
            if 1900 <= born.year and born <= date.today():
                return born.strftime("%m/%d/%Y")
    return None


def _state(value: Any) -> str | None:
    text = (_clean(value, 2) or "").upper()
    return text if re.fullmatch(r"[A-Z]{2}", text) else None


def _zip(value: Any) -> str | None:
    text = str(value or "").strip()  # not _clean: ZIP+4 is 9 digits
    return text if re.fullmatch(r"\d{5}(-\d{4})?", text) else None


def _phone(value: Any) -> str | None:
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}" if len(digits) == 10 else None


def _email(value: Any) -> str | None:
    text = _clean(value, 120)
    return text.lower() if text and re.fullmatch(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}", text) else None


def _money(low: float, high: float) -> Callable[[Any], str | None]:
    def check(value: Any) -> str | None:
        try:
            amount = float(str(value).replace(",", "").replace("$", "").strip())
        except ValueError:
            return None
        return f"{amount:,.2f}".rstrip("0").rstrip(".") if low <= amount <= high else None

    return check


def _count(low: int, high: int) -> Callable[[Any], str | None]:
    def check(value: Any) -> str | None:
        try:
            number = int(float(str(value).strip()))
        except ValueError:
            return None
        return str(number) if low <= number <= high else None

    return check


def _text(limit: int) -> Callable[[Any], str | None]:
    return lambda value: _clean(value, limit)


@dataclass(frozen=True)
class DetailSpec:
    label: str  # "first name": the agent's captions say "your first name"
    scope: Scope
    check: Callable[[Any], str | None]
    hint: str  # what the extraction schema tells the model


CATALOGUE: dict[str, DetailSpec] = {
    "full_name": DetailSpec("full name", "identity", _name, "the person's full name as printed"),
    "first_name": DetailSpec("first name", "identity", _name, "given name"),
    "last_name": DetailSpec("last name", "identity", _name, "family name"),
    "date_of_birth": DetailSpec("date of birth", "identity", _date, "date of birth, MM/DD/YYYY"),
    "street_address": DetailSpec("street address", "contact", _text(100), "street and unit, no city"),
    "city": DetailSpec("city", "contact", _text(60), "city or town"),
    "state": DetailSpec("state", "contact", _state, "two-letter US state code"),
    "zip": DetailSpec("ZIP code", "contact", _zip, "5-digit ZIP code"),
    "phone": DetailSpec("phone number", "contact", _phone, "the person's phone number"),
    "email": DetailSpec("email", "contact", _email, "the person's email address"),
    "employer": DetailSpec("employer", "income", _text(80), "employer's name"),
    "monthly_income": DetailSpec("monthly income", "income", _money(0, 1_000_000),
                                 "gross pay per month in dollars, converted from the pay period shown"),
    "household_size": DetailSpec("household size", "household", _count(1, 20),
                                 "number of people listed as living in the home"),
    "monthly_rent": DetailSpec("monthly rent", "housing", _money(0, 100_000), "rent per month in dollars"),
    "landlord_name": DetailSpec("landlord's name", "housing", _text(80), "landlord or property manager"),
}

# What each kind of paper may give. Anything else the model returns is dropped.
KIND_KEYS: dict[str, tuple[str, ...]] = {
    "pay_stub": ("full_name", "first_name", "last_name", "street_address", "city", "state", "zip",
                 "employer", "monthly_income"),
    "state_id": ("full_name", "first_name", "last_name", "date_of_birth", "street_address", "city", "state", "zip"),
    "lease": ("full_name", "first_name", "last_name", "street_address", "city", "state", "zip",
              "monthly_rent", "landlord_name", "household_size"),
    "other": (),
}


def keys_for(kind: str, scopes: frozenset[str]) -> tuple[str, ...]:
    return tuple(k for k in KIND_KEYS.get(kind, ()) if CATALOGUE[k].scope in scopes)


def all_keys_for(scopes: frozenset[str]) -> tuple[str, ...]:
    return tuple(k for k, spec in CATALOGUE.items() if spec.scope in scopes and any(k in v for v in KIND_KEYS.values()))


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


def now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Consent:
    """Permission to read one paper (or, as `AutoRead`, every new upload)."""

    scopes: frozenset[str]
    notice_version: str
    granted_at: datetime = field(default_factory=now)


@dataclass
class AutoRead:
    on: bool = False
    consent: Consent | None = None


@dataclass
class Paper:
    id: str
    mime: str
    pages: int
    kind_hint: str | None = None
    kind: str | None = None
    status: PaperStatus = "waiting"
    consent: Consent | None = None
    found: int = 0
    message: str | None = None
    data: bytes | None = field(default=None, repr=False)  # dropped as soon as it has been read

    def view(self) -> dict[str, Any]:
        return {
            "paper_id": self.id,
            "kind": self.kind,
            "kind_label": KIND_LABEL.get(self.kind or "", None),
            "status": self.status,
            "pages": self.pages,
            "can_read": self.consent is not None,
            "scopes": sorted(self.consent.scopes) if self.consent else [],
            "found": self.found,
            "message": self.message,
        }


@dataclass
class Detail:
    key: str
    value: str
    status: DetailStatus
    source: Literal["paper", "typed"]
    paper_id: str | None = None
    paper_kind: str | None = None
    page: int | None = None
    snippet: str | None = None  # where it was read, masked; shown in the review card
    box: list[int] | None = None  # [ymin, xmin, ymax, xmax] on a 0-1000 grid, photos only
    confirmed_at: datetime | None = None

    def view(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": CATALOGUE[self.key].label,
            "value": self.value,
            "status": self.status,
            "source": self.source,
            "paper_id": self.paper_id,
            "paper_kind": self.paper_kind,
            "source_label": f"your {KIND_LABEL[self.paper_kind]}" if self.paper_kind in KIND_LABEL else None,
            "page": self.page,
            "snippet": self.snippet,
            "box": self.box,
        }
