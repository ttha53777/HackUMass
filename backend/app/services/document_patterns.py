"""What the Document Agent may read from each kind of paper (Phase 3).

Deterministic in every mode: labelled lines only, and a label must start its
line, so a sentence planted in the middle of a paper cannot match. Each kind
may set only its own profile fields (KIND_FIELDS); identity details for the
fill sheet are returned separately and never enter graph state.

Guards, applied before any field is read:
  * a line that looks like a Social Security number is dropped (note
    "ssn_line_dropped"); we never read or keep SSNs;
  * a value containing "{{" or "}}" is rejected, since it could plant a
    fill-sheet placeholder;
  * numbers are range checked; options must be the question's own option ids.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

# Profile fields each kind may set. A kind not listed here is stored, not read.
KIND_FIELDS: dict[str, frozenset[str]] = {
    "income": frozenset({"monthly_income", "situation"}),
    "dob": frozenset({"household_size", "household_who"}),
    "lease": frozenset({"housing_status", "heat_included_in_rent"}),
    "heat": frozenset({"utility_urgency", "eversource_customer"}),
    "shutoff": frozenset({"utility_urgency", "utility_issues"}),
    "address": frozenset(),
    "id": frozenset(),
}

# Identity keys (fill-sheet keys) each kind may give the person's device.
KIND_IDENTITY: dict[str, frozenset[str]] = {
    "income": frozenset({"full_name"}),
    "dob": frozenset({"full_name", "date_of_birth"}),
    "lease": frozenset({"full_name", "street_address", "city", "state", "zip"}),
    "heat": frozenset({"full_name", "phone", "email", "street_address", "city", "state", "zip"}),
    "shutoff": frozenset({"full_name"}),
    "address": frozenset({"full_name", "street_address", "city", "state", "zip"}),
    "id": frozenset({"full_name", "date_of_birth", "street_address", "city", "state", "zip"}),
}

READABLE_KINDS = frozenset(KIND_FIELDS)

# What each kind's title looks like, checked against the paper's first lines.
# A paper whose title clearly belongs to another kind is not read as this one
# (note "kind_mismatch"), so a pay stub filed as a lease cannot set lease facts.
_TITLES: dict[str, re.Pattern[str]] = {
    "income": re.compile(r"pay\s*stub|earnings\s+statement|pay\s+statement|benefit\s+(?:letter|amount)|award\s+letter", re.I),
    "dob": re.compile(r"household\s+members|birth\s+(?:certificate|dates?)", re.I),
    "lease": re.compile(r"\blease\b|rental\s+agreement", re.I),
    "heat": re.compile(r"(?:electric|gas|utility|heating|energy)\s+bill", re.I),
    "shutoff": re.compile(r"disconnection|shut-?\s?off|termination\s+(?:notice|of\s+service)", re.I),
    "address": re.compile(r"(?:proof|confirming|verification)\s+of\s+address|confirming\s+address", re.I),
    "id": re.compile(r"\bid\s+card\b|identification\s+card|driver'?s\s+licen[cs]e", re.I),
}
# Papers that may also be filed as another kind (a lease or a bill proves an address).
_ALSO_FITS: dict[str, frozenset[str]] = {
    "address": frozenset({"lease", "heat", "shutoff", "id"}),
}
TITLE_LINES = 5


def title_kinds(text: str) -> set[str]:
    """Kinds whose title pattern matches one of the paper's first few lines."""
    head = [line for line in text.splitlines() if line.strip()][:TITLE_LINES]
    return {kind for kind, pattern in _TITLES.items() if any(pattern.search(line) for line in head)}


def kind_fits(kind: str, text: str) -> bool:
    """False only when the title clearly says another kind. No recognisable title: trust the choice."""
    seen = title_kinds(text)
    return not seen or kind in seen or bool(seen & _ALSO_FITS.get(kind, frozenset()))

_SSN = re.compile(r"\b\d{3}[- ]\d{2}[- ]\d{4}\b|social\s+security\s+(?:number|no\.?|#)|\bssn\b", re.I)
_PLACEHOLDER = re.compile(r"\{\{|\}\}")


def _line(label: str) -> re.Pattern[str]:
    """`Label: value` at the start of a line."""
    return re.compile(rf"(?im)^[ \t]*(?:{label})[ \t]*:[ \t]*(?P<value>[^\n]+?)[ \t]*$")


_NAME = _line(r"employee|tenant|lessee|account\s+holder|applicant|name|beneficiary")
_DOB = _line(r"date\s+of\s+birth|dob|birth\s+date")
_ADDRESS = _line(r"address|service\s+address|unit|home\s+address|mailing\s+address")
_PHONE = _line(r"phone|telephone|phone\s+number")
_EMAIL = _line(r"e-?mail")
_HEAT_INCLUDED = _line(r"heat\s+included")
_STATUS = _line(r"status|account\s+status")
_PAST_DUE = _line(r"amount\s+past\s+due")
_DISCONNECT = _line(r"disconnection\s+(?:scheduled|date)|shut-?\s?off\s+date|service\s+ends")
_EMPLOYER = _line(r"employer")
_UTILITY = _line(r"utility|company|provider|electric\s+company|gas\s+company")
_MEMBER_ROW = re.compile(
    r"(?im)^[ \t]*(?P<name>[A-Z][\w.'-]*(?:[ \t]+[A-Z][\w.'-]*){0,3})[ \t]+-[ \t]+(?P<relation>[a-z ]+?)"
    r"[ \t]+-[ \t]+born[ \t]+(?P<born>\d{2}/\d{2}/\d{4})[ \t]*$"
)
_STREET_CITY = re.compile(
    r"^(?P<street>.+?),\s*(?P<city>[A-Za-z .'-]+),\s*(?P<state>[A-Z]{2})\s+(?P<zip>\d{5})(?:-\d{4})?$"
)
_DATE = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")


@dataclass
class KindReading:
    facts: dict[str, Any] = field(default_factory=dict)  # profile field -> value
    identity: dict[str, str] = field(default_factory=dict)  # fill-sheet key -> value
    notes: list[str] = field(default_factory=list)


def clean_text(text: str) -> tuple[str, list[str]]:
    """Drop SSN-looking lines. Returns the kept text and any notes."""
    kept: list[str] = []
    notes: list[str] = []
    for line in text.splitlines():
        if _SSN.search(line):
            if "ssn_line_dropped" not in notes:
                notes.append("ssn_line_dropped")
            continue
        kept.append(line)
    return "\n".join(kept), notes


def strip_identity(text: str) -> str:
    """The text without identity lines, for a model that only needs the numbers."""
    patterns = (_NAME, _DOB, _ADDRESS, _PHONE, _EMAIL, _MEMBER_ROW)
    for pattern in patterns:
        text = pattern.sub("", text)
    return text


def _value(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    if match is None:
        return None
    value = " ".join(match.group("value").split())
    if not value or _PLACEHOLDER.search(value) or len(value) > 200:
        return None
    return value


def parse_date(value: str) -> date | None:
    match = _DATE.match(value.strip())
    if not match:
        return None
    month, day, year = (int(g) for g in match.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


def age_on(born: date, today: date) -> int:
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def age_bands(births: list[date], today: date) -> list[str]:
    """household_who option ids from birth dates: 60+, 55 to 59, under 5."""
    bands: list[str] = []
    ages = [age_on(b, today) for b in births]
    if any(a >= 60 for a in ages):
        bands.append("60")
    if any(55 <= a <= 59 for a in ages):
        bands.append("55")
    if any(0 <= a < 5 for a in ages):
        bands.append("child")
    return bands or ["none"]


_PHONE_OK = re.compile(r"^\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}$")
_EMAIL_OK = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def _identity(text: str, allowed: frozenset[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    if "full_name" in allowed and (name := _value(_NAME, text)):
        if re.fullmatch(r"[A-Za-z][A-Za-z .'-]{1,80}", name):
            found["full_name"] = name
            parts = name.split()
            if len(parts) >= 2:
                found["first_name"], found["last_name"] = parts[0], parts[-1]
    if "date_of_birth" in allowed and (dob := _value(_DOB, text)) and parse_date(dob):
        found["date_of_birth"] = dob
    if allowed & {"street_address", "city", "state", "zip"} and (address := _value(_ADDRESS, text)):
        if match := _STREET_CITY.match(address):
            found.update(
                street_address=match.group("street").strip(),
                city=match.group("city").strip(),
                state=match.group("state"),
                zip=match.group("zip"),
            )
    if "phone" in allowed and (phone := _value(_PHONE, text)) and _PHONE_OK.match(phone):
        found["phone"] = phone
    if "email" in allowed and (email := _value(_EMAIL, text)) and _EMAIL_OK.match(email):
        found["email"] = email
    return found


def read_kind(kind: str, text: str, today: date | None = None) -> KindReading:
    """Profile facts and identity details for one paper of a known kind.

    `text` must already be cleaned (clean_text). Income and household size are
    read by the shared patterns in services/documents.py and passed in by the
    caller; this covers everything else.
    """
    today = today or date.today()
    reading = KindReading()
    allowed = KIND_FIELDS.get(kind, frozenset())

    if kind == "income" and "situation" in allowed and _value(_EMPLOYER, text):
        reading.facts["situation"] = "working"

    if kind == "dob":
        rows = list(_MEMBER_ROW.finditer(text))
        births = [d for row in rows if (d := parse_date(row.group("born")))]
        if births:
            reading.facts["household_who"] = age_bands(births, today)
        reading.facts["_member_rows"] = len(rows)  # checked against the stated size
        own = next((r for r in rows if r.group("relation").strip().lower() in ("self", "applicant")), None)
        if own is not None:
            reading.identity["full_name"] = " ".join(own.group("name").split())
            reading.identity["date_of_birth"] = own.group("born")

    if kind == "lease":
        if _value(_line(r"tenant|lessee"), text):
            reading.facts["housing_status"] = "renting"
        heat = (_value(_HEAT_INCLUDED, text) or "").lower()
        if heat in ("yes", "no"):
            reading.facts["heat_included_in_rent"] = heat == "yes"

    if kind == "heat":
        status = (_value(_STATUS, text) or "").lower()
        if "past due" in status or "overdue" in status or _value(_PAST_DUE, text):
            reading.facts["utility_urgency"] = "behind"
        company = _value(_UTILITY, text) or ""
        head = " ".join(line for line in text.splitlines() if line.strip())[:300]
        if re.search(r"\beversource\b", company, re.I) or re.search(r"^\s*eversource\b", head, re.I):
            reading.facts["eversource_customer"] = "yes"

    if kind == "shutoff" and _value(_DISCONNECT, text):
        reading.facts["utility_urgency"] = "shutoff"
        reading.facts["utility_issues"] = ["shutoff"]

    for key, value in _identity(text, KIND_IDENTITY.get(kind, frozenset())).items():
        reading.identity.setdefault(key, value)
    return reading
