"""Checks model-written wording before it is shown (foundation plan B.4, "LLM output guard").

A sentence from the model may only rephrase facts we already have. It is
rejected if it contains a link, a dollar amount, a phone number, a date or year
that does not appear in the source text it was written from (the program record
and our own template), or if it states eligibility as settled. On rejection the
caller keeps its template.
"""

from __future__ import annotations

import re

MAX_LENGTH = 600

_URL = re.compile(r"(?:https?://|www\.)\S+|\b[\w-]+\.(?:org|com|gov|net|edu|us|io)\b(?:/\S*)?", re.I)
_MONEY = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?")
_PHONE = re.compile(r"\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
_NUM_DATE = re.compile(r"\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b")
_MONTH_DATE = re.compile(
    r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b", re.I
)
# A preliminary result must never read as a decision.
_OVERCLAIM = re.compile(
    r"\b(?:guarantee[ds]?|definitely|certainly|approved|you (?:are|will be|'re) (?:eligible|accepted|approved)"
    r"|you (?:will|do) qualify)\b",
    re.I,
)


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower())


def is_safe_wording(text: str, sources: list[str]) -> bool:
    """True if `text` adds no link, amount, phone number or date absent from `sources`."""
    text = (text or "").strip()
    if not text or len(text) > MAX_LENGTH or "\n\n" in text:
        return False
    if _OVERCLAIM.search(text):
        return False
    source = _norm(" ".join(sources))
    source_digits = {_digits(m) for m in _PHONE.findall(source)}
    source_money = {_digits(m) for m in _MONEY.findall(source)}

    for url in _URL.findall(text):
        if _norm(url).rstrip(".,;:)") not in source:
            return False
    for amount in _MONEY.findall(text):
        if _digits(amount) not in source_money:
            return False
    for phone in _PHONE.findall(text):
        if _digits(phone) not in source_digits:
            return False
    for pattern in (_YEAR, _NUM_DATE, _MONTH_DATE):
        for found in pattern.findall(text):
            if _norm(found) not in source:
                return False
    return True
