"""Answers a connected (simulated) bank points to, for the person to confirm.

Never applied on their own: each suggestion is shown with its reason and goes
through the normal answers endpoint only if the person taps Confirm. Only
questions that are open right now are suggested, every answer is validated like
a typed one, and reasons use monthly totals, never single transactions.
"""

from __future__ import annotations

import re

from app.api.schemas import BankSuggestion
from app.graph.answers import AnswerError, validate_answer
from app.graph.questions import get_spec
from app.graph.state import AnswerIn, FinancialSummary, Question


def _money(value: float) -> str:
    return f"${round(value):,}"


def countable_monthly(summary: FinancialSummary) -> float:
    """Wages and benefit deposits, the part that looks like income. Other deposits
    (transfers, refunds) are left out; they are not income."""
    return round(sum(s.avg_monthly for s in summary.income_sources if s.kind in ("wages", "benefit")), 2)


def _band_for(question: Question, yearly: float) -> str | None:
    for option in question.options:
        match = re.fullmatch(r"(\d+)-(\d+|inf)", option.id)
        if not match:
            continue
        low = float(match.group(1))
        high = float("inf") if match.group(2) == "inf" else float(match.group(2))
        if low <= yearly < high:
            return option.id
    return None


def _valid(answer: AnswerIn) -> bool:
    spec = get_spec(answer.question_id)
    if spec is None:
        return False
    try:
        validate_answer(spec, answer)
    except AnswerError:
        return False
    return True


def bank_suggestions(summary: FinancialSummary | None, open_questions: list[Question]) -> list[BankSuggestion]:
    if summary is None:
        return []
    by_id = {q.id: q for q in open_questions}
    out: list[BankSuggestion] = []

    def add(question_id: str, option_id: str, reason: str) -> None:
        question = by_id.get(question_id)
        if question is None:
            return
        option = next((o for o in question.options if o.id == option_id), None)
        answer = AnswerIn(question_id=question_id, selected_option_ids=[option_id])
        if option and _valid(answer):
            out.append(BankSuggestion(question_id=question_id, answer=answer, shown=option.label, reason=reason))

    kinds = {s.kind for s in summary.income_sources}
    if "wages" in kinds:
        add("situation", "working", "Your connected bank shows paychecks coming in.")
    elif "unemployment" in summary.benefit_signals:
        add("situation", "looking_for_work", "Your connected bank shows unemployment benefit deposits.")

    if any(b.category == "rent" for b in summary.bills):
        add("housing_status", "renting", "Your connected bank shows a rent payment each month.")

    overdue = [b for b in summary.bills if b.category == "utilities" and b.status == "overdue"]
    if overdue:
        add("utility_urgency", "behind", f"Your connected bank shows an unpaid {overdue[0].payee} bill.")

    income = by_id.get("income_band")
    monthly = countable_monthly(summary)
    if income is not None and monthly > 0:
        band = _band_for(income, monthly * 12)
        if band:
            add("income_band", band, f"About {_money(monthly)} a month comes in, so about {_money(monthly * 12)} a year.")
    return out
