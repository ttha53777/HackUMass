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


# --- Chat replies -------------------------------------------------------------

REPLY_MAX_LENGTH = 280

# Benefit names the model might know from training. Program facts come only from
# the curated records, so a chat reply may never name a program at all.
_BENEFIT_NAMES = re.compile(
    r"\b(?:snap|wic|ebt|tanf|liheap|ssi|ssdi|medicaid|medicare|masshealth|section\s*8|food\s*stamps"
    r"|fuel\s*assistance|head\s*start|raft|dta)\b",
    re.I,
)
# A reply acknowledges; it never promises an outcome.
_PROMISE = re.compile(
    r"\b(?:you(?:'ll| will) (?:get|receive|be able to get)|we(?:'ll| will) get you|i(?:'ll| will) get you"
    r"|you(?:'re| are) (?:eligible|covered|approved)|you qualify|make sure you get)\b",
    re.I,
)


def is_safe_reply(text: str, user_text: str, program_names: list[str]) -> bool:
    """True if a model-written chat reply may be shown.

    On top of `is_safe_wording` (no new links, amounts, phone numbers or dates,
    nothing that reads as a decision), a reply must be short, ask nothing (the app
    asks the next question itself), name no program, benefit or place the person did
    not name, and promise nothing.
    """
    text = (text or "").strip()
    if not text or len(text) > REPLY_MAX_LENGTH or "?" in text or "\n" in text:
        return False
    if len(re.findall(r"[.!]+(?:\s|$)", text)) > 2:
        return False
    if not is_safe_wording(text, [user_text]):
        return False
    if _PROMISE.search(text) or _BENEFIT_NAMES.search(text):
        return False
    lowered, said = _norm(text), _norm(user_text)
    for name in program_names:
        name = _norm(name).strip()
        # A name the person used themselves may be echoed back; any other is a new fact.
        if len(name) >= 4 and name in lowered and name not in said:
            return False
    return True
