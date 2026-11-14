"""Validation, normalisation and display of answers to registry questions.

Shared by the API (to reject bad input with a clear message before the graph
runs) and by User Intelligence (to store the normalised value).
"""

from __future__ import annotations

import math
import re
from typing import Any

from app.graph.questions import OTHER_OPTION_ID, QuestionSpec
from app.graph.state import AnswerIn, Fact

# Five digits, optionally ZIP+4. Kept as a string: Massachusetts ZIPs start with 0.
_ZIP = re.compile(r"^(\d{5})(?:-?\d{4})?$")
_PERIOD_TO_MONTH = {"week": 52 / 12, "month": 1.0, "year": 1 / 12}


class AnswerError(ValueError):
    """The answer does not fit the question. The message is safe to show."""


def _number(raw: Any) -> float:
    if isinstance(raw, bool) or raw is None:
        raise AnswerError("Enter a number.")
    try:
        value = float(str(raw).replace(",", "").replace("$", "").strip())
    except ValueError as exc:
        raise AnswerError("Enter a number.") from exc
    # "nan" and "inf" parse as floats; NaN slips past every min/max comparison.
    if not math.isfinite(value):
        raise AnswerError("Enter a number.")
    return value


def _check_options(spec: QuestionSpec, answer: AnswerIn) -> list[str]:
    question = spec.question
    valid = {option.id for option in question.options}
    if question.allow_other:
        valid.add(OTHER_OPTION_ID)
    chosen = list(dict.fromkeys(answer.selected_option_ids))
    unknown = [option_id for option_id in chosen if option_id not in valid]
    if unknown:
        raise AnswerError("Choose one of the listed options.")
    if OTHER_OPTION_ID in chosen and not (answer.text or "").strip():
        raise AnswerError("Tell us a little more about “Other”.")
    return chosen


def normalize_answer(spec: QuestionSpec, answer: AnswerIn) -> Any:
    """Return the value to store for a non-skipped answer, or raise AnswerError."""
    question = spec.question
    kind = question.type

    if kind == "multi_select":
        chosen = _check_options(spec, answer)
        if not chosen:
            raise AnswerError("Choose at least one option.")
        return chosen

    if kind == "single_select":
        chosen = _check_options(spec, answer)
        if len(chosen) != 1:
            raise AnswerError("Choose one option.")
        return spec.value_map.get(chosen[0], chosen[0])

    if kind == "zip":
        if not isinstance(answer.value, str):
            # A JSON number would already have lost a leading zero (01002 -> 1002).
            raise AnswerError("Enter a 5-digit ZIP code.")
        match = _ZIP.match(answer.value.strip())
        if not match:
            raise AnswerError("Enter a 5-digit ZIP code.")
        return match.group(1)

    if kind in ("number", "currency"):
        value = _number(answer.value)
        if kind == "currency":
            value *= _PERIOD_TO_MONTH[answer.period or "month"]
        if question.min is not None and value < question.min:
            raise AnswerError(f"Enter a number of at least {question.min:g}.")
        if question.max is not None and value > question.max:
            raise AnswerError(f"Enter a number no larger than {question.max:g}.")
        if spec.integer:
            if value != int(value):
                raise AnswerError("Enter a whole number.")
            return int(value)
        return round(value, 2)

    # text
    text = " ".join((answer.text or str(answer.value or "")).split())
    if not text:
        raise AnswerError("Enter an answer, or skip this question.")
    return text


def validate_answer(spec: QuestionSpec, answer: AnswerIn) -> None:
    """Raise AnswerError if the answer cannot be accepted for this question."""
    if answer.skipped:
        if not spec.question.skippable:
            raise AnswerError("This question is needed to continue.")
        return
    normalize_answer(spec, answer)


def display_value(spec: QuestionSpec, fact: Fact) -> str:
    """Human-readable form of a stored value."""
    question = spec.question
    labels = {option.id: option.label for option in question.options}
    labels.setdefault(OTHER_OPTION_ID, "Other")
    value = fact.value

    if question.type == "multi_select" and isinstance(value, list):
        return ", ".join(labels.get(item, str(item)) for item in value)
    if question.type == "single_select":
        for option_id, stored in spec.value_map.items():
            if stored == value and type(stored) is type(value):
                return labels.get(option_id, option_id)
        return labels.get(value, str(value))
    if question.type == "currency":
        return f"${value:,.0f} per month"
    return str(value)
