"""What the Document Agent may read from each kind of paper (Phase 3).

Deterministic in every mode: labelled lines only, and a label must start its
line, so a sentence planted in the middle of a paper cannot match. Each kind
may set only its own profile fields (KIND_FIELDS); identity and form details
for the fill sheet (KIND_DETAILS) are returned separately, checked like typed
answers, and never enter graph state.

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
    # Another household member's income (a benefit letter): added to the wages
    # on the household's own income paper by the Profile Agent, not compared.
    "member_income": frozenset({"monthly_income"}),
    "address": frozenset(),
    "id": frozenset(),
    # Read for form details only; they set no profile facts this pass.
    "liheap": frozenset(),
    "notices": frozenset(),
}

_ADDRESS_KEYS = {"street_address", "city", "state", "zip"}
# Fill-sheet keys (identity and form details) each kind may give the person's device.
KIND_DETAILS: dict[str, frozenset[str]] = {
    "income": frozenset({"full_name", "employer_name", "employer_address", "employer_phone",
                         "earned_income_monthly", "hours_per_week"}),
    "dob": frozenset({"full_name", "date_of_birth", "member_2_name", "member_2_relation", "member_2_dob",
                      "member_3_name", "member_3_relation", "member_3_dob"}),
    "lease": frozenset({"full_name", *_ADDRESS_KEYS, "monthly_rent", "heat_included", "heating_fuel",
                        "landlord_name", "landlord_address", "landlord_phone"}),
    "heat": frozenset({"full_name", "phone", "email", *_ADDRESS_KEYS, "utility_company", "utility_account_number"}),
    "shutoff": frozenset({"full_name", "utility_account_number", "amount_past_due"}),
    # Someone else's paper: no identity detail is the person's own, only the income line.
    "member_income": frozenset({"other_income_source", "other_income_amount", "other_income_person"}),
    "address": frozenset({"full_name", *_ADDRESS_KEYS}),
    "id": frozenset({"full_name", "date_of_birth", *_ADDRESS_KEYS}),
    "liheap": frozenset({"full_name", "liheap_number"}),
    "notices": frozenset({"rent_owed", "notice_date", "landlord_name"}),
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
    "member_income": frozenset({"income"}),
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
_BENEFIT = _line(r"benefit\s+amount(?:\s+each\s+month)?|monthly\s+benefit(?:\s+amount)?|amount\s+each\s+month")
_DOLLARS = re.compile(r"^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?$")
_UTILITY = _line(r"utility|company|provider|electric\s+company|gas\s+company")
_EMPLOYER_ADDRESS = _line(r"employer\s+address")
_EMPLOYER_PHONE = _line(r"employer\s+phone")
_GROSS_MONTHLY = _line(r"gross\s+monthly\s+pay|gross\s+pay\s+this\s+month")
_WEEKLY_HOURS = _line(r"(?:scheduled\s+)?hours\s+per\s+week")
_BENEFICIARY = _line(r"beneficiary")
_RENT = _line(r"monthly\s+rent|rent\s+amount")
_HEATING = _line(r"heating\s+(?:type|fuel)|heat\s+source")
_LANDLORD = _line(r"landlord")
_LANDLORD_ADDRESS = _line(r"landlord\s+address")
_LANDLORD_PHONE = _line(r"landlord\s+phone")
_ACCOUNT_NO = _line(r"account\s+(?:number|no\.?|#)")
_LIHEAP_NO = _line(r"fuel\s+assistance\s+(?:number|no\.?|#)|liheap\s+(?:number|no\.?|#)")
_RENT_OWED = _line(r"rent\s+owed|back\s+rent|amount\s+owed")
_NOTICE_DATE = _line(r"date\s+of\s+notice|notice\s+date")
_FROM = _line(r"from")
_LEADING_DOLLARS = re.compile(r"^\$?\s*(\d{1,3}(?:,\d{3})+|\d+(?!,\d))(?:\.(\d{2}))?\b")
_LONG_DATE = re.compile(r"^(?P<month>[A-Za-z]+)\.?\s+(?P<day>\d{1,2}),\s*(?P<year>\d{4})$")
_MONTHS = {m: i for i, m in enumerate(
    ("january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"), start=1)}
# First match wins, so "natural gas" is tried before "gas".
_FUELS = (("natural gas", "Natural gas"), ("oil", "Oil"), ("electric", "Electric"), ("propane", "Propane"),
          ("wood", "Wood"), ("gas", "Natural gas"))
_INCOME_SOURCES = ((r"social\s+security|\bssa\b", "Social Security"), (r"\bssi\b|supplemental\s+security", "SSI"),
                   (r"unemployment", "Unemployment"), (r"child\s+support", "Child support"))
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


def _money(value: str | None) -> str | None:
    """"$1,240" -> "1,240", "$900, due on the 1st" -> "900", "$142.60" -> "142.60"."""
    match = _LEADING_DOLLARS.match((value or "").strip())
    if not match:
        return None
    return match.group(1) + (f".{match.group(2)}" if match.group(2) else "")


def _us_date(value: str | None) -> str | None:
    """"November 10, 2026" or "11/10/2026" -> "11/10/2026"."""
    value = (value or "").strip()
    if parse_date(value):
        return value
    match = _LONG_DATE.match(value)
    month = _MONTHS.get(match.group("month").lower()) if match else None
    if not match or not month:
        return None
    try:
        when = date(int(match.group("year")), month, int(match.group("day")))
    except ValueError:
        return None
    return when.strftime("%m/%d/%Y")


def _form_details(kind: str, text: str, allowed: frozenset[str]) -> dict[str, str]:
    """Form details a kind may read, deterministic and labelled-line only."""
    found: dict[str, str | None] = {}
    if kind == "income":
        employer = _value(_EMPLOYER, text) or ""
        name, _, rest = employer.partition(",")
        found["employer_name"] = name.strip() or None
        # "Employer: Valley Grocers, 1 Sample Way, Amherst, MA 01002" carries the address too.
        found["employer_address"] = _value(_EMPLOYER_ADDRESS, text) or (
            rest.strip() if rest and _STREET_CITY.match(rest.strip()) else None)
        found["employer_phone"] = _value(_EMPLOYER_PHONE, text)
        found["earned_income_monthly"] = _money(_value(_GROSS_MONTHLY, text))
        found["hours_per_week"] = _value(_WEEKLY_HOURS, text)
    elif kind == "member_income":
        found["other_income_amount"] = _money(_value(_BENEFIT, text))
        found["other_income_person"] = _value(_BENEFICIARY, text)
        head = " ".join([line for line in text.splitlines() if line.strip()][:TITLE_LINES])
        found["other_income_source"] = next(
            (label for pattern, label in _INCOME_SOURCES if re.search(pattern, head, re.I)), None)
    elif kind == "dob":
        others = [r for r in _MEMBER_ROW.finditer(text)
                  if r.group("relation").strip().lower() not in ("self", "applicant")]
        for n, row in enumerate(others[:2], start=2):
            found[f"member_{n}_name"] = " ".join(row.group("name").split())
            found[f"member_{n}_relation"] = " ".join(row.group("relation").split()).lower()
            found[f"member_{n}_dob"] = row.group("born")
    elif kind == "lease":
        found["monthly_rent"] = _money(_value(_RENT, text))
        heat = (_value(_HEAT_INCLUDED, text) or "").lower()
        found["heat_included"] = heat.capitalize() if heat in ("yes", "no") else None
        heating = (_value(_HEATING, text) or "").lower()
        found["heating_fuel"] = next((label for word, label in _FUELS if re.search(rf"\b{word}\b", heating)), None)
        found["landlord_name"] = _value(_LANDLORD, text)
        found["landlord_address"] = _value(_LANDLORD_ADDRESS, text)
        found["landlord_phone"] = _value(_LANDLORD_PHONE, text)
    elif kind == "heat":
        found["utility_company"] = _value(_UTILITY, text)
        found["utility_account_number"] = _value(_ACCOUNT_NO, text)
    elif kind == "shutoff":
        found["utility_account_number"] = _value(_ACCOUNT_NO, text)
        found["amount_past_due"] = _money(_value(_PAST_DUE, text))
    elif kind == "liheap":
        found["liheap_number"] = _value(_LIHEAP_NO, text)
    elif kind == "notices":
        found["rent_owed"] = _money(_value(_RENT_OWED, text))
        found["notice_date"] = _us_date(_value(_NOTICE_DATE, text))
        found["landlord_name"] = _value(_FROM, text)

    from app.execution.fields import CATALOGUE, InvalidAnswer, clean_answer  # no import cycle: fields needs only state

    kept: dict[str, str] = {}
    for key, value in found.items():
        if key not in allowed or not value or key not in CATALOGUE:
            continue
        try:
            kept[key] = clean_answer(key, value)  # a paper's value is checked like a typed answer
        except InvalidAnswer:
            continue
    return kept


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

    if kind == "member_income":
        reading.notes.append("income_adds_to_household")
        amount = _DOLLARS.match(_value(_BENEFIT, text) or "")
        if amount:
            reading.facts["monthly_income"] = float(amount.group(1).replace(",", "") + "." + (amount.group(2) or "00"))

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

    if kind == "shutoff":
        if _value(_DISCONNECT, text):
            reading.facts["utility_urgency"] = "shutoff"
            reading.facts["utility_issues"] = ["shutoff"]
        elif _value(_PAST_DUE, text):
            # A past-due notice with no disconnection date: behind, not facing a shutoff.
            reading.facts["utility_urgency"] = "behind"

    allowed_details = KIND_DETAILS.get(kind, frozenset())
    for key, value in _identity(text, allowed_details).items():
        reading.identity.setdefault(key, value)
    for key, value in _form_details(kind, text, allowed_details).items():
        reading.identity.setdefault(key, value)
    return reading
