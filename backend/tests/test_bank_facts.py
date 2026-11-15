"""Bank signals as unconfirmed facts: countable income, bills, income type, one review card."""

from datetime import date, datetime, timezone

import pytest

from app.agents.user_intelligence import apply_evidence_facts, apply_review, forget_bank_evidence
from app.graph.questions import bank_card_shown, confirmation_question, priority_question_ids
from app.graph.state import Fact, IntakeState, Profile, ReviewDecision
from app.services.nessie import NessieService, aggregate, bank_facts
from tests.conftest import make_profile
from tests.test_nessie import answer, evidence, status

NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)
ALL_NEEDS = ["food", "housing", "utilities", "employment"]
PERSONAS = ("retired-fixed-income", "part-time-irregular", "two-earner-family", "between-jobs")


def summary(pid):
    return NessieService(None).summarize(pid).summary


def values(facts):
    return {k: f.value for k, f in facts.items()}


# --- mapping (pure) -------------------------------------------------------------


def test_every_bank_fact_is_unconfirmed_sandbox_evidence():
    for pid in PERSONAS:
        for fact in bank_facts(summary(pid), ALL_NEEDS, NOW).values():
            assert fact.provenance == "nessie_sandbox" and fact.confirmed is False
            assert fact.source == f"bank:{pid}"


def test_rent_and_a_separate_heating_bill():
    got = values(bank_facts(summary("retired-fixed-income"), ["housing", "utilities"], NOW))
    assert got["housing_status"] == "renting"
    assert got["heat_included_in_rent"] is False  # stored value of "I pay for heat myself"
    assert got["utility_urgency"] == "behind"  # the heating oil bill is overdue
    assert "eversource_customer" not in got and "housing_need" not in got  # rent is paid


def test_eversource_payee_and_overdue_utility():
    got = values(bank_facts(summary("part-time-irregular"), ["utilities"], NOW))
    assert got["eversource_customer"] == "yes"
    assert got["utility_urgency"] == "behind"
    assert "heat_included_in_rent" not in got  # electric only: no heating payee


def test_overdue_rent_and_unemployment():
    got = values(bank_facts(summary("between-jobs"), ["housing", "employment"], NOW))
    assert got["housing_need"] == "behind"
    assert got["housing_status"] == "renting"
    assert got["situation"] == "looking_for_work"


def test_income_counts_paychecks_and_benefits_only():
    s = summary("between-jobs")
    income = bank_facts(s, [], NOW)["monthly_income"]
    assert income.value == round(455 * 13 / 3, 2)  # the savings transfer is left out
    assert income.value < s.avg_monthly_deposits and income.period == "month"


def test_income_falls_back_to_deposits_when_nothing_is_classified():
    s = aggregate(
        "x", "seeded_fallback",
        [{"transaction_date": "2026-10-03", "amount": 900, "description": "Mobile deposit", "status": "completed"}],
        [], [], None, (date(2026, 10, 1), date(2026, 10, 31)),
    )
    assert bank_facts(s, [], NOW)["monthly_income"].value == 900.0


def test_only_facts_for_the_needs_picked():
    for pid in PERSONAS:
        assert set(bank_facts(summary(pid), ["food"], NOW)) == {"monthly_income"}
    housing_only = bank_facts(summary("part-time-irregular"), ["housing"], NOW)
    assert "eversource_customer" not in housing_only and "utility_urgency" not in housing_only


def test_a_shutoff_is_never_inferred():
    for pid in PERSONAS:
        facts = bank_facts(summary(pid), ALL_NEEDS, NOW)
        assert "utility_issues" not in facts
        assert all(f.value != "shutoff" for f in facts.values())


def test_income_type_only_reorders_questions():
    assert priority_question_ids(summary("retired-fixed-income")) == {"age_60_plus", "benefits_held"}
    assert priority_question_ids(summary("between-jobs")) == {"benefits_held"}
    assert priority_question_ids(summary("part-time-irregular")) == frozenset()
    assert priority_question_ids(None) == frozenset()
    facts = bank_facts(summary("retired-fixed-income"), ALL_NEEDS, NOW)
    assert "age_60_plus" not in facts and "benefits_held" not in facts


# --- profile ------------------------------------------------------------------


def test_the_users_answer_beats_the_bank():
    profile = make_profile(needs=["housing"], housing_status="own")
    apply_evidence_facts(profile, bank_facts(summary("part-time-irregular"), ["housing"], NOW))
    kept = profile.facts["housing_status"]
    assert kept.value == "own" and kept.provenance == "user_reported" and kept.confirmed is False
    conflict = next(c for c in profile.conflicts if c.field == "housing_status")
    assert {c.value for c in conflict.candidates} == {"own", "renting"}


def test_disconnect_removes_every_bank_fact():
    profile = make_profile(needs=ALL_NEEDS, housing_status="own")
    apply_evidence_facts(profile, bank_facts(summary("between-jobs"), ALL_NEEDS, NOW))
    assert profile.facts["situation"].provenance == "nessie_sandbox"
    forget_bank_evidence(profile)
    assert not any(f.provenance == "nessie_sandbox" for f in profile.facts.values())
    assert profile.conflicts == []
    assert profile.facts["housing_status"].value == "own" and profile.facts["housing_status"].confirmed


def test_review_card_confirms_edits_and_drops():
    profile = make_profile(needs=["housing", "utilities"])
    apply_evidence_facts(profile, bank_facts(summary("part-time-irregular"), ["housing", "utilities"], NOW))
    decision = ReviewDecision(
        document_id="bank:part-time-irregular",
        accept=["housing_status", "eversource_customer"],
        edits={"monthly_income": 1200.0},
    )
    apply_review(profile, decision, [], NOW)
    for field in ("housing_status", "eversource_customer", "monthly_income"):
        assert profile.facts[field].provenance == "user_reported" and profile.facts[field].confirmed
    assert profile.facts["monthly_income"].value == 1200.0
    assert "utility_urgency" not in profile.facts  # left unticked: dropped


def test_income_alone_keeps_the_single_confirmation_question():
    source = "bank:part-time-irregular"
    alone = make_profile(needs=["food"])
    apply_evidence_facts(alone, bank_facts(summary("part-time-irregular"), ["food"], NOW))
    assert not bank_card_shown(alone, source)
    assert confirmation_question(alone, IntakeState()).id == "confirm_monthly_income"

    more = make_profile(needs=["housing"])
    apply_evidence_facts(more, bank_facts(summary("part-time-irregular"), ["housing"], NOW))
    assert bank_card_shown(more, source)
    assert confirmation_question(more, IntakeState()) is None  # the card asks instead


# --- HTTP -------------------------------------------------------------------------


def housing_session(client) -> str:
    sid = client.post("/api/sessions").json()["session_id"]
    answer(client, sid, question_id="needs", selected_option_ids=["housing"])
    answer(client, sid, question_id="zip", value="00000")
    answer(client, sid, question_id="household_size", value=1)
    snap = answer(client, sid, question_id="household_who", selected_option_ids=["none"])
    for _ in range(5):  # skip whatever follow-ups come, so only the bank can fill them
        question = snap.get("pending_question")
        if not question:
            break
        snap = answer(client, sid, question_id=question["id"], skipped=True)
    return sid


def bank_card(snap):
    return next((r for r in snap["pending_reviews"] if r["document_id"].startswith("bank:")), None)


def test_bank_card_lifts_eligibility_only_once_accepted(client):
    sid = housing_session(client)
    values = client.app.state.sessions.values(sid)
    assert "housing_status" not in values["profile"].facts

    snap = evidence(client, sid, persona_id="part-time-irregular", consent=True)
    snap = client.get(f"/api/sessions/{sid}").json()
    assert status(snap, "fixture-rent-help") == "possibly_eligible"
    card = bank_card(snap)
    assert card is not None and card["simulated"] is True and card["kind"] == "bank"
    assert {r["field"] for r in card["rows"]} == {"monthly_income", "housing_status"}
    assert (snap["pending_question"] or {}).get("id") != "confirm_monthly_income"

    r = client.post(f"/api/sessions/{sid}/evidence/review", json={
        "document_id": card["document_id"], "accept": ["monthly_income", "housing_status"], "edits": {},
    })
    assert r.status_code in (200, 202), r.text
    snap = client.get(f"/api/sessions/{sid}").json()
    assert status(snap, "fixture-rent-help") == "likely_eligible"
    assert bank_card(snap) is None
    shown = {p["field"]: p["provenance"] for p in snap["profile_summary"]}
    assert shown["housing_status"] == "user_reported" and shown["monthly_income"] == "user_reported"


def test_bank_card_for_another_persona_is_refused(client):
    sid = housing_session(client)
    evidence(client, sid, persona_id="part-time-irregular", consent=True)
    r = client.post(f"/api/sessions/{sid}/evidence/review", json={
        "document_id": "bank:two-earner-family", "accept": ["housing_status"], "edits": {},
    })
    assert r.status_code == 422


@pytest.mark.parametrize("pid", PERSONAS)
def test_bank_card_never_names_a_payee_or_transaction(client, pid):
    sid = housing_session(client)
    evidence(client, sid, persona_id=pid, consent=True)
    card = bank_card(client.get(f"/api/sessions/{sid}").json())
    text = str(card)
    assert "Payroll" not in text and "Apartment rent" not in text and "Unemployment benefit payment" not in text
