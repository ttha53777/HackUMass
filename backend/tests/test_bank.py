"""Bank connector: a richer simulated profile, suggestions to confirm, and disconnect."""

from datetime import date

from app.api.bank import bank_suggestions, countable_monthly
from app.graph.state import FinancialSummary, Option, Question
from app.services.nessie import NessieService, aggregate
from tests.test_nessie import answer, evidence, to_results


def summary(pid):
    return NessieService(None).summarize(pid).summary


def test_profile_groups_income_bills_and_spending_without_raw_descriptions():
    s = summary("part-time-irregular")
    assert [i.label for i in s.income_sources] == ["Paychecks"]
    rent = next(b for b in s.bills if b.category == "rent")
    assert rent.avg_monthly == 900.0 and rent.status == "paid"
    assert any(b.category == "utilities" and b.status == "overdue" for b in s.bills)
    assert {x.category for x in s.spending} >= {"groceries", "transport"}
    assert all("Payroll deposit" not in i.label for i in s.income_sources)  # our label, not theirs


def test_benefit_deposits_are_signalled():
    s = summary("retired-fixed-income")
    assert s.benefit_signals == ["social_security"]
    assert s.income_sources[0].kind == "benefit"


def test_overdue_needs_a_pending_bill_past_its_date():
    s = aggregate(
        "x", "seeded_fallback",
        [{"transaction_date": "2026-10-01", "amount": 1000, "description": "Payroll", "status": "completed"}],
        [
            {"payment_date": "2026-10-05", "payee": "Electric company", "payment_amount": 80, "status": "pending"},
            {"payment_date": "2026-11-20", "payee": "Phone company", "payment_amount": 40, "status": "pending"},
        ],
        [], None, (date(2026, 10, 1), date(2026, 10, 31)),
    )
    status = {b.payee: b.status for b in s.bills}
    assert status == {"Electric company": "overdue", "Phone company": "pending"}


def test_countable_income_leaves_out_other_deposits():
    s = aggregate(
        "x", "seeded_fallback",
        [
            {"transaction_date": "2026-10-01", "amount": 1000, "description": "Payroll", "status": "completed"},
            {"transaction_date": "2026-10-09", "amount": 300, "description": "Transfer from savings", "status": "completed"},
        ],
        [], [], None, (date(2026, 10, 1), date(2026, 10, 31)),
    )
    assert countable_monthly(s) == 1000.0


def _q(qid, *ids):
    return Question(id=qid, prompt=qid, type="single_select", options=[Option(id=i, label=i.title()) for i in ids],
                    target_field=qid, origin="eligibility_followup")


def test_suggestions_only_for_open_questions_and_valid_answers():
    s = summary("part-time-irregular")
    open_qs = [
        _q("situation", "working", "looking_for_work", "retired", "student", "unable_to_work"),
        _q("housing_status", "renting", "own", "staying_with_others", "no_stable_housing"),
        _q("utility_urgency", "behind", "shutoff", "reduce"),
        _q("income_band", "0-20000", "20000-40000", "40000-inf", "unsure"),
    ]
    got = {x.question_id: x for x in bank_suggestions(s, open_qs)}
    assert got["situation"].answer.selected_option_ids == ["working"]
    assert got["housing_status"].answer.selected_option_ids == ["renting"]
    assert got["utility_urgency"].answer.selected_option_ids == ["behind"]
    assert got["income_band"].answer.selected_option_ids == ["0-20000"]  # 1,350.67 x 12 = 16,208
    assert "$1,351 a month" in got["income_band"].reason
    assert bank_suggestions(s, []) == [] and bank_suggestions(None, open_qs) == []


def test_reasons_never_quote_single_transactions():
    for pid in ("retired-fixed-income", "part-time-irregular", "two-earner-family"):
        for x in bank_suggestions(summary(pid), [_q("utility_urgency", "behind", "shutoff", "reduce")]):
            assert "Payroll deposit" not in x.reason


# --- HTTP ---------------------------------------------------------------------


def test_connect_suggest_then_disconnect(client):
    sid = to_results(client)
    snap = evidence(client, sid, persona_id="part-time-irregular", consent=True)
    snap = client.get(f"/api/sessions/{sid}").json()
    assert snap["financial_summary"]["income_sources"][0]["label"] == "Paychecks"
    open_ids = {o["question"]["id"] for o in snap["open_questions"]}
    assert all(x["question_id"] in open_ids for x in snap["bank_suggestions"])

    r = client.post(f"/api/sessions/{sid}/evidence/nessie/disconnect")
    assert r.status_code in (200, 202)
    after = client.get(f"/api/sessions/{sid}").json()
    assert after["financial_summary"] is None and after["bank_suggestions"] == []
    income = [p for p in after["profile_summary"] if p["field"] == "monthly_income"]
    assert not any(p["provenance"] == "nessie_sandbox" for p in income)


def test_disconnect_keeps_a_confirmed_income(client):
    sid = to_results(client, income=1200)
    client.post(f"/api/sessions/{sid}/evidence/nessie/disconnect")
    after = client.get(f"/api/sessions/{sid}").json()
    assert any(p["field"] == "monthly_income" for p in after["profile_summary"])
    answer(client, sid, question_id="needs", selected_option_ids=["food"])  # the session still works


def _cards(snap):
    return {c["program"]["id"]: c for c in snap["programs"]}


def test_disconnect_reassesses_what_used_the_bank_income(client):
    """Regression: disconnecting used to leave results computed from the deleted income."""
    sid = to_results(client)  # income skipped: only the bank supplies it
    evidence(client, sid, persona_id="part-time-irregular", consent=True)
    before = _cards(client.get(f"/api/sessions/{sid}").json())

    client.post(f"/api/sessions/{sid}/evidence/nessie/disconnect")
    after = client.get(f"/api/sessions/{sid}").json()
    cards = _cards(after)
    assert not any(c["stale"] for c in cards.values()) and not after["plan_stale"]
    food = cards["fixture-food-benefit"]["assessment"]
    assert food["status"] != before["fixture-food-benefit"]["assessment"]["status"]
    assert food["status"] == "insufficient_information"


def test_disconnect_closes_a_conflict_with_the_bank(client):
    sid = to_results(client, income=500)  # far from the persona's deposits
    evidence(client, sid, persona_id="part-time-irregular", consent=True)
    values = client.app.state.sessions.values(sid)
    assert [c.field for c in values["profile"].conflicts] == ["monthly_income"]

    client.post(f"/api/sessions/{sid}/evidence/nessie/disconnect")
    values = client.app.state.sessions.values(sid)
    income = values["profile"].facts["monthly_income"]
    assert values["profile"].conflicts == []
    assert income.value == 500 and income.provenance == "user_reported" and income.confirmed
    assert values["consents"]["nessie"] is False
    pending = client.get(f"/api/sessions/{sid}").json()["pending_question"]
    assert pending is None or "deposits" not in pending["prompt"]


def test_disconnect_unknown_session(client):
    assert client.post("/api/sessions/nope/evidence/nessie/disconnect").status_code == 404
