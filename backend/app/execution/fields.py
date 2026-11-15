"""The fill sheet: which details a form may need, and the private values for one run.

The model only ever sees field *keys* and labels ("phone: Phone number, known").
To fill a field it types a placeholder such as `{{phone}}`; the gate checks the
key and the server substitutes the value. A value never enters a prompt, a log,
a LangGraph checkpoint or an API response.

Values come from two places only:
  * the person's profile facts (household size, ZIP, monthly income) and the
    city and state of their ZIP from our curated regions file;
  * the person's own answers to the agent's questions during the run
    (name, address, phone, email, date of birth: the profile never holds these).

`FieldStore` lives in the execution manager's memory for one run and is wiped
when the run ends.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

from app.graph.state import Profile, Question


_DATE_OK = r"^(0?[1-9]|1[0-2])/(0?[1-9]|[12]\d|3[01])/(19|20)\d\d$"
_PHONE_OK = r"^[\d\s().+-]{10,20}$"
_MONEY_OK = r"^\$?(\d{1,3}(,\d{3})+|\d+)(\.\d\d)?$"
_NAME_OK = r"^[A-Za-z][A-Za-z .'-]{1,80}$"
_RELATION_OK = r"^[A-Za-z][A-Za-z -]{1,30}$"
_TEXT_OK = r"^[\w][\w .,'&#/():-]{0,119}$"


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label: str
    phrase: str  # for the step log: "Typed your {phrase}"
    pattern: str | None = None  # an answer must match, when set
    hint: str | None = None  # shown under the question


CATALOGUE: dict[str, FieldSpec] = {
    spec.key: spec
    for spec in (
        FieldSpec("first_name", "First name", "first name"),
        FieldSpec("last_name", "Last name", "last name"),
        FieldSpec("full_name", "Full name", "full name"),
        FieldSpec(
            "date_of_birth", "Date of birth", "date of birth",
            pattern=r"^(0?[1-9]|1[0-2])/(0?[1-9]|[12]\d|3[01])/(19|20)\d\d$", hint="MM/DD/YYYY",
        ),
        FieldSpec("street_address", "Street address", "street address"),
        FieldSpec("city", "City or town", "city"),
        FieldSpec("state", "State", "state", pattern=r"^[A-Za-z .]{2,20}$"),
        FieldSpec("zip", "ZIP code", "ZIP code", pattern=r"^\d{5}$"),
        FieldSpec("phone", "Phone number", "phone number", pattern=r"^[\d\s().+-]{10,20}$"),
        FieldSpec("email", "Email address", "email address", pattern=r"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$"),
        FieldSpec("household_size", "People in your household", "household size", pattern=r"^\d{1,2}$"),
        FieldSpec("monthly_income", "Monthly household income", "monthly income", pattern=r"^\$?[\d,]{1,9}(\.\d\d)?$"),
        # Form details read from papers (docs/document-to-form-demo-plan.md, 3.5).
        FieldSpec("member_2_name", "Person 2 name", "second household member's name", pattern=_NAME_OK),
        FieldSpec("member_2_relation", "Person 2 relationship to you", "second household member's relationship", pattern=_RELATION_OK),
        FieldSpec("member_2_dob", "Person 2 date of birth", "second household member's birth date", pattern=_DATE_OK, hint="MM/DD/YYYY"),
        FieldSpec("member_3_name", "Person 3 name", "third household member's name", pattern=_NAME_OK),
        FieldSpec("member_3_relation", "Person 3 relationship to you", "third household member's relationship", pattern=_RELATION_OK),
        FieldSpec("member_3_dob", "Person 3 date of birth", "third household member's birth date", pattern=_DATE_OK, hint="MM/DD/YYYY"),
        FieldSpec("employer_name", "Employer name", "employer", pattern=_TEXT_OK),
        FieldSpec("employer_address", "Employer address", "employer's address", pattern=_TEXT_OK),
        FieldSpec("employer_phone", "Employer phone", "employer's phone", pattern=_PHONE_OK),
        FieldSpec("earned_income_monthly", "Your monthly pay before taxes ($)", "monthly pay", pattern=_MONEY_OK),
        FieldSpec("hours_per_week", "Hours worked per week", "hours per week", pattern=r"^\d{1,2}(\.\d{1,2})?$"),
        FieldSpec("other_income_source", "Other income: kind", "other income source", pattern=_TEXT_OK),
        FieldSpec("other_income_amount", "Other income: amount each month ($)", "other income amount", pattern=_MONEY_OK),
        FieldSpec("other_income_person", "Other income: who gets it", "other income's recipient", pattern=_NAME_OK),
        FieldSpec("monthly_rent", "Monthly rent ($)", "monthly rent", pattern=_MONEY_OK),
        FieldSpec("heat_included", "Is heat included in your rent?", "answer on heat in rent", pattern=r"^(?i:yes|no)$", hint="Yes or No"),
        FieldSpec("heating_fuel", "Main heating fuel", "heating fuel", pattern=r"^(?i:oil|natural gas|electric|propane|wood|other)$"),
        FieldSpec("landlord_name", "Landlord name", "landlord's name", pattern=_TEXT_OK),
        FieldSpec("landlord_address", "Landlord address", "landlord's address", pattern=_TEXT_OK),
        FieldSpec("landlord_phone", "Landlord phone", "landlord's phone", pattern=_PHONE_OK),
        FieldSpec("utility_company", "Utility company", "utility company", pattern=_TEXT_OK),
        FieldSpec("utility_account_number", "Utility account number", "account number", pattern=r"^[A-Za-z0-9-]{3,30}$"),
        FieldSpec("amount_past_due", "Amount past due ($)", "amount past due", pattern=_MONEY_OK),
        FieldSpec("rent_owed", "Rent owed ($)", "rent owed", pattern=_MONEY_OK),
        FieldSpec("notice_date", "Date of the landlord's notice", "notice date", pattern=_DATE_OK, hint="MM/DD/YYYY"),
        FieldSpec("liheap_number", "Last season's Fuel Assistance number", "Fuel Assistance number", pattern=r"^[A-Za-z0-9-]{3,30}$"),
        # No paper holds this: the helper always asks.
        FieldSpec("best_time_to_call", "Best time to reach you", "best time to reach you", pattern=_TEXT_OK),
    )
}

# Keys filled from what the person already told us; the rest are asked during a run.
FROM_PROFILE = ("zip", "household_size", "monthly_income", "city", "state")
# Keys the person's device may supply (confirmed on its "My details" card). The
# profile owns household size and income: a device value never replaces those,
# and never replaces a key the profile already filled.
IDENTITY_KEYS = (
    "first_name", "last_name", "full_name", "date_of_birth", "street_address",
    "city", "state", "zip", "phone", "email",
)
# Form details a paper may give the device (document_patterns.KIND_DETAILS).
PAPER_DETAIL_KEYS = (
    "member_2_name", "member_2_relation", "member_2_dob", "member_3_name", "member_3_relation", "member_3_dob",
    "employer_name", "employer_address", "employer_phone", "earned_income_monthly", "hours_per_week",
    "other_income_source", "other_income_amount", "other_income_person",
    "monthly_rent", "heat_included", "heating_fuel", "landlord_name", "landlord_address", "landlord_phone",
    "utility_company", "utility_account_number", "amount_past_due", "rent_owed", "notice_date", "liheap_number",
)
DEVICE_KEYS = frozenset(IDENTITY_KEYS + PAPER_DETAIL_KEYS)
# Fill-sheet key -> the profile field it comes from (city and state follow the ZIP).
PROFILE_FIELD = {"zip": "zip", "city": "zip", "state": "zip",
                 "household_size": "household_size", "monthly_income": "monthly_income"}

ASK_REASON = "The form asks for this. We use it only to fill in this application and forget it when you're done."
MAX_ANSWER_LENGTH = 120

PLACEHOLDER = re.compile(r"^\{\{([a-z][a-z0-9_]{0,39})\}\}$")


def question_for(key: str) -> Question:
    """The question shown to the person. Wording comes from the catalogue, never the model."""
    spec = CATALOGUE[key]
    reason = ASK_REASON + (f" Format: {spec.hint}." if spec.hint else "")
    return Question(
        id=f"agent:{key}", prompt=f"What should we put for “{spec.label}”?", reason=reason,
        type="text", target_field=key, skippable=True,
    )


# Where a value came from, for the step log ("Typed your phone number (from your electric bill)").
FROM_ANSWERS = "from your answers"
FROM_DETAILS = "from your details"
TOLD_US = "you told us"


class FieldStore:
    """Private values for one run. Never logged, never serialized.

    Each value may carry an origin ("from your lease"): a paper title or a fixed
    phrase, never a value, so it is safe in the step log.
    """

    __slots__ = ("_values", "_origins")

    def __init__(self) -> None:
        self._values: dict[str, str] = {}
        self._origins: dict[str, str] = {}

    def __repr__(self) -> str:  # never print values, even in a traceback or debugger
        return f"FieldStore(keys={sorted(self._values)})"

    def known(self) -> set[str]:
        return set(self._values)

    def value(self, key: str) -> str | None:
        return self._values.get(key)

    def origin(self, key: str) -> str | None:
        return self._origins.get(key)

    def put(self, key: str, value: str, origin: str | None = None) -> None:
        if key not in CATALOGUE:
            raise KeyError(key)
        self._values[key] = value
        if origin:
            self._origins[key] = origin
        else:
            self._origins.pop(key, None)
        # Forms that ask for one name field get it from the two the person gave.
        if key in ("first_name", "last_name") and "full_name" not in self._values:
            first, last = self._values.get("first_name"), self._values.get("last_name")
            if first and last:
                self._values["full_name"] = f"{first} {last}"
                if origin:
                    self._origins["full_name"] = origin

    def clear(self) -> None:
        self._values.clear()
        self._origins.clear()


class InvalidAnswer(ValueError):
    """The message is safe to show; it never repeats the answer."""


def clean_answer(key: str, text: str | None) -> str:
    value = " ".join((text or "").split())
    if not value:
        raise InvalidAnswer("Please type an answer, or skip it.")
    if len(value) > MAX_ANSWER_LENGTH:
        raise InvalidAnswer("That answer is too long.")
    spec = CATALOGUE[key]
    if spec.pattern and not re.match(spec.pattern, value):
        raise InvalidAnswer(f"That doesn't look like a {spec.phrase}." + (f" Use {spec.hint}." if spec.hint else ""))
    return value


def store_from_profile(
    profile: Profile, region_for: Callable[[str], dict[str, str] | None] = lambda _zip: None
) -> FieldStore:
    store = FieldStore()
    facts = profile.facts
    disputed = {c.field for c in profile.conflicts}

    def usable(name: str):
        """A fact the person gave or confirmed, and not in dispute: an unconfirmed
        reading from a document or the bank is not the person's answer."""
        fact = facts.get(name)
        return fact if fact is not None and fact.confirmed and name not in disputed else None

    zip_fact = usable("zip")
    if zip_fact is not None and re.fullmatch(r"\d{5}", str(zip_fact.value)):
        store.put("zip", str(zip_fact.value), FROM_ANSWERS)
        region = region_for(str(zip_fact.value))
        if region:
            if region.get("city"):
                store.put("city", region["city"], FROM_ANSWERS)
            if region.get("state"):
                store.put("state", region["state"], FROM_ANSWERS)
    size = usable("household_size")
    if size is not None and isinstance(size.value, (int, float)) and not isinstance(size.value, bool) and size.value > 0:
        store.put("household_size", str(int(size.value)), FROM_ANSWERS)
    income = usable("monthly_income")
    if income is not None and isinstance(income.value, (int, float)) and not isinstance(income.value, bool):
        store.put("monthly_income", f"{round(income.value):,}", FROM_ANSWERS)
    return store


def sheet_lines(store: FieldStore) -> list[str]:
    """Keys and labels for the system prompt. Values are never included."""
    known = store.known()
    return [
        f"{{{{{spec.key}}}}} = {spec.label} ({'known' if spec.key in known else 'not known yet: call ask_user'})"
        for spec in CATALOGUE.values()
    ]


def add_device_details(store: FieldStore, details: dict[str, str], sources: dict[str, str] | None = None) -> list[str]:
    """Put the person's confirmed device details into one run's store.

    Only DEVICE_KEYS, only where the profile hasn't filled the key, each checked
    like a typed answer. Raises InvalidAnswer (naming the field, never the value).
    `sources` names the paper each detail came from, for the step log. Returns the
    keys added.
    """
    sources = sources or {}
    added: list[str] = []
    for key, raw in details.items():
        if key not in DEVICE_KEYS:
            raise InvalidAnswer("We can't use that detail for this form.")
        if key in store.known():
            continue  # the profile's own value stands
        try:
            value = clean_answer(key, raw)
        except InvalidAnswer as exc:
            raise InvalidAnswer(f"{CATALOGUE[key].label}: {exc}") from None
        title = sources.get(key)
        store.put(key, value, f"from {title}" if title else FROM_DETAILS)
        added.append(key)
    return added


@dataclass(frozen=True)
class Readiness:
    """What a form needs and where each key will come from. Keys only, never values."""

    from_profile: list[str]
    from_device_needed: list[str]
    will_ask: list[str]
    unconfirmed: list[str]
    blocked_by: list[str]


def readiness(profile: Profile, store: FieldStore, required: list[str], optional: list[str]) -> Readiness:
    """Sort a form's keys by source. `store` is store_from_profile(profile, ...).

    * from_profile: already filled from confirmed, undisputed answers;
    * from_device_needed: identity details the person's device may hold;
    * will_ask: anything else, asked during the run;
    * unconfirmed: profile-owned keys we have only an unconfirmed reading for;
    * blocked_by: profile fields in conflict that this form needs (start is refused).
    """
    known = store.known()
    disputed = {c.field for c in profile.conflicts}
    wanted = [*required, *optional]
    from_profile = [k for k in wanted if k in known]
    missing = [k for k in wanted if k not in known]
    blocked = sorted({PROFILE_FIELD[k] for k in required if k in PROFILE_FIELD and PROFILE_FIELD[k] in disputed})
    unconfirmed = [
        k for k in missing
        if k in PROFILE_FIELD and PROFILE_FIELD[k] in profile.facts and PROFILE_FIELD[k] not in disputed
    ]
    held = {k for k in missing if k in PROFILE_FIELD and PROFILE_FIELD[k] in disputed}  # settled first
    from_device = [k for k in missing if k in DEVICE_KEYS and k not in unconfirmed and k not in held]
    will_ask = [k for k in missing if k not in DEVICE_KEYS and k not in unconfirmed and k not in held]
    return Readiness(from_profile, from_device, will_ask, unconfirmed, blocked)
