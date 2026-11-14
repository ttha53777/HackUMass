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
    )
}

# Keys filled from what the person already told us; the rest are asked during a run.
FROM_PROFILE = ("zip", "household_size", "monthly_income", "city", "state")

ASK_REASON = "The form asks for this. We use it only to fill in this application and forget it when you're done."
MAX_ANSWER_LENGTH = 120

PLACEHOLDER = re.compile(r"^\{\{([a-z_]{1,40})\}\}$")


def question_for(key: str) -> Question:
    """The question shown to the person. Wording comes from the catalogue, never the model."""
    spec = CATALOGUE[key]
    reason = ASK_REASON + (f" Format: {spec.hint}." if spec.hint else "")
    return Question(
        id=f"agent:{key}", prompt=f"What should we put for “{spec.label}”?", reason=reason,
        type="text", target_field=key, skippable=True,
    )


class FieldStore:
    """Private values for one run. Never logged, never serialized."""

    __slots__ = ("_values",)

    def __init__(self) -> None:
        self._values: dict[str, str] = {}

    def __repr__(self) -> str:  # never print values, even in a traceback or debugger
        return f"FieldStore(keys={sorted(self._values)})"

    def known(self) -> set[str]:
        return set(self._values)

    def value(self, key: str) -> str | None:
        return self._values.get(key)

    def put(self, key: str, value: str) -> None:
        if key not in CATALOGUE:
            raise KeyError(key)
        self._values[key] = value
        # Forms that ask for one name field get it from the two the person gave.
        if key in ("first_name", "last_name") and "full_name" not in self._values:
            first, last = self._values.get("first_name"), self._values.get("last_name")
            if first and last:
                self._values["full_name"] = f"{first} {last}"

    def clear(self) -> None:
        self._values.clear()


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
    zip_fact = facts.get("zip")
    if zip_fact is not None and re.fullmatch(r"\d{5}", str(zip_fact.value)):
        store.put("zip", str(zip_fact.value))
        region = region_for(str(zip_fact.value))
        if region:
            if region.get("city"):
                store.put("city", region["city"])
            if region.get("state"):
                store.put("state", region["state"])
    size = facts.get("household_size")
    if size is not None and isinstance(size.value, (int, float)) and not isinstance(size.value, bool) and size.value > 0:
        store.put("household_size", str(int(size.value)))
    income = facts.get("monthly_income")
    # Only a confirmed figure: an unconfirmed document reading is not the person's answer.
    if income is not None and income.confirmed and isinstance(income.value, (int, float)) and not isinstance(income.value, bool):
        store.put("monthly_income", f"{round(income.value):,}")
    return store


def sheet_lines(store: FieldStore) -> list[str]:
    """Keys and labels for the system prompt. Values are never included."""
    known = store.known()
    return [
        f"{{{{{spec.key}}}}} = {spec.label} ({'known' if spec.key in known else 'not known yet: call ask_user'})"
        for spec in CATALOGUE.values()
    ]
