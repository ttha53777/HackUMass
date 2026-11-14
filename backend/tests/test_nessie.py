"""T15: simulated bank profile — service, consent, confirmation, and effect on results."""

import json

import httpx
import pytest

from app.services.nessie import NOTICE_NOT_SEEDED, NOTICE_UNAVAILABLE, NessieService

KEY = "test-key-not-real"


def service(handler) -> NessieService:
    return NessieService(KEY, transport=httpx.MockTransport(handler), deadline=3)


def seeded_sandbox(request: httpx.Request) -> httpx.Response:
    assert request.url.params["key"] == KEY
    routes = {
        "/customers": [{"_id": "c1", "first_name": "Simulated", "last_name": "retired-fixed-income"},
                       {"_id": "blank"}],
        "/customers/c1/accounts": [{"_id": "a1", "balance": 500}],
        "/accounts/a1/deposits": [
            {"transaction_date": "2026-08-03", "amount": 1500, "status": "completed"},
            {"transaction_date": "2026-09-03", "amount": 1500, "status": "completed"},
            {"transaction_date": "2026-10-03", "amount": 1500, "status": "completed"},
            {"transaction_date": "2026-10-09", "amount": 9999, "status": "cancelled"},
        ],
        "/accounts/a1/bills": [{"payee": "Electric company", "payment_amount": 90, "status": "completed"},
                               {"payee": "Streaming", "payment_amount": 15, "status": "completed"}],
        "/accounts/a1/purchases": [{"amount": 300}],
    }
    return httpx.Response(200, json=routes.get(request.url.path, []))


# --------------------------------------------------------------------------
# Service
# --------------------------------------------------------------------------


def test_fallback_without_a_key_is_simulated_and_labelled():
    result = NessieService(None).summarize("retired-fixed-income")
    s = result.summary
    assert result.notice is None
    assert s.source == "seeded_fallback" and s.simulated is True
    assert s.avg_monthly_deposits == 1400.0
    assert "Deposits are not the same as countable income." in s.caveats
    assert "Electric company" in s.utility_bill_signals


def test_every_seeded_persona_is_labelled_simulated():
    personas = NessieService(None).personas()
    assert len(personas) == 3
    assert all(p.label.startswith("Simulated") for p in personas)


def test_live_summary_from_seeded_sandbox():
    result = service(seeded_sandbox).summarize("retired-fixed-income")
    s = result.summary
    assert result.notice is None and s.source == "nessie_sandbox"
    assert s.avg_monthly_deposits == 1500.0  # cancelled deposit ignored, 3 calendar months
    assert s.avg_monthly_outflow == pytest.approx((90 + 15 + 300) / 3, abs=0.01)
    assert s.utility_bill_signals == ["Electric company"]
    assert s.balance_snapshot == 500


def test_unseeded_sandbox_falls_back_with_a_notice():
    result = service(lambda r: httpx.Response(200, json=[])).summarize("retired-fixed-income")
    assert result.summary.source == "seeded_fallback"
    assert result.notice == ("nessie_not_seeded", NOTICE_NOT_SEEDED)


@pytest.mark.parametrize(
    "handler",
    [
        lambda r: (_ for _ in ()).throw(httpx.ReadTimeout("slow", request=r)),
        lambda r: httpx.Response(503, text="down"),
        lambda r: httpx.Response(200, text="not json"),
        lambda r: httpx.Response(200, json={"unexpected": "shape"}),
    ],
)
def test_sandbox_failure_falls_back_with_a_notice(handler):
    result = service(handler).summarize("retired-fixed-income")
    assert result.summary.source == "seeded_fallback"
    assert result.notice == ("nessie_unavailable", NOTICE_UNAVAILABLE)


def test_failed_request_is_retried_once():
    calls = []

    def flaky(request):
        calls.append(request.url.path)
        return httpx.Response(503) if len(calls) == 1 else seeded_sandbox(request)

    assert service(flaky).summarize("retired-fixed-income").summary.source == "nessie_sandbox"
    assert calls[:2] == ["/customers", "/customers"]


def test_unknown_persona_is_rejected():
    with pytest.raises(KeyError):
        NessieService(None).summarize("someone-real")


# --------------------------------------------------------------------------
# API and graph
# --------------------------------------------------------------------------


def answer(client, sid, expect=200, **body):
    r = client.post(f"/api/sessions/{sid}/answers", json=body)
    assert r.status_code == expect, r.text
    return r.json()


def evidence(client, sid, expect=(200, 202), **body):
    r = client.post(f"/api/sessions/{sid}/evidence/nessie", json=body)
    assert r.status_code in (expect if isinstance(expect, tuple) else (expect,)), r.text
    return r.json()


def to_results(client, income=None) -> str:
    sid = client.post("/api/sessions").json()["session_id"]
    answer(client, sid, question_id="needs", selected_option_ids=["food"])
    answer(client, sid, question_id="zip", value="00000")
    answer(client, sid, question_id="household_size", value=1)
    if income is None:
        answer(client, sid, question_id="monthly_income", skipped=True)
    else:
        answer(client, sid, question_id="monthly_income", value=income, period="month")
    return sid


def status(snapshot, program_id):
    return next(c for c in snapshot["programs"] if c["program"]["id"] == program_id)["assessment"]["status"]


def test_personas_route(client):
    body = client.get("/api/nessie/personas").json()
    assert {p["id"] for p in body} == {"retired-fixed-income", "part-time-irregular", "two-earner-family"}
    assert all("Simulated" in p["label"] for p in body)


@pytest.mark.parametrize("body", [{"persona_id": "retired-fixed-income"},
                                  {"persona_id": "retired-fixed-income", "consent": False},
                                  {"persona_id": "retired-fixed-income", "consent": "true"}])
def test_consent_must_be_literally_true(client, body):
    sid = to_results(client)
    r = client.post(f"/api/sessions/{sid}/evidence/nessie", json=body)
    assert r.status_code == 400 and r.json()["error"]["code"] == "consent_required"
    assert client.get(f"/api/sessions/{sid}").json()["financial_summary"] is None


def test_unknown_persona_and_session(client):
    sid = to_results(client)
    r = client.post(f"/api/sessions/{sid}/evidence/nessie", json={"persona_id": "x", "consent": True})
    assert r.status_code == 422
    r = client.post("/api/sessions/nope/evidence/nessie", json={"persona_id": "x", "consent": True})
    assert r.status_code == 404


def test_offer_then_deposit_income_waits_for_confirmation(client):
    sid = to_results(client)  # income skipped
    snap = client.get(f"/api/sessions/{sid}").json()
    assert status(snap, "fixture-food-benefit") == "insufficient_information"

    snap = evidence(client, sid, persona_id="retired-fixed-income", consent=True)
    summary = snap["financial_summary"]
    assert summary["simulated"] is True and summary["source"] == "seeded_fallback"
    assert "total_deposits" not in summary and "balance_snapshot" not in summary
    # Simulated deposits alone never make a program "likely".
    assert status(snap, "fixture-food-benefit") == "possibly_eligible"
    question = snap["pending_question"]
    assert question["id"] == "confirm_monthly_income"
    assert "$1,400 a month in deposits" in question["prompt"]
    income = next(i for i in snap["profile_summary"] if i["field"] == "monthly_income")
    assert income["provenance"] == "nessie_sandbox"

    snap = answer(client, sid, question_id="confirm_monthly_income", selected_option_ids=["yes"])
    assert status(snap, "fixture-food-benefit") == "likely_eligible"
    income = next(i for i in snap["profile_summary"] if i["field"] == "monthly_income")
    assert income["provenance"] == "user_reported"


def test_rejecting_deposit_income_forgets_it(client):
    sid = to_results(client)
    evidence(client, sid, persona_id="retired-fixed-income", consent=True)
    snap = answer(client, sid, question_id="confirm_monthly_income", selected_option_ids=["no"])
    assert status(snap, "fixture-food-benefit") == "insufficient_information"
    assert all(i["field"] != "monthly_income" for i in snap["profile_summary"])


def test_matching_deposits_corroborate_without_a_question(client):
    sid = to_results(client, income=1400)
    snap = evidence(client, sid, persona_id="retired-fixed-income", consent=True)
    assert status(snap, "fixture-food-benefit") == "likely_eligible"
    assert (snap["pending_question"] or {}).get("id") != "confirm_monthly_income"


def test_conflicting_deposits_keep_the_users_answer_until_they_decide(client):
    sid = to_results(client, income=1400)
    snap = evidence(client, sid, persona_id="two-earner-family", consent=True)
    assert snap["pending_question"]["id"] == "confirm_monthly_income"
    assert "different from what you told us" in snap["pending_question"]["reason"]
    assert status(snap, "fixture-food-benefit") == "possibly_eligible"  # flagged, not overwritten
    income = next(i for i in snap["profile_summary"] if i["field"] == "monthly_income")
    assert income["display_value"] == "$1,400 per month"

    snap = answer(client, sid, question_id="confirm_monthly_income", selected_option_ids=["no"])
    assert status(snap, "fixture-food-benefit") == "likely_eligible"


def test_sandbox_outage_gives_a_notice_and_still_works(repo):
    from fastapi.testclient import TestClient

    from app.main import create_app

    down = NessieService(KEY, transport=httpx.MockTransport(lambda r: httpx.Response(503)), deadline=2)
    with TestClient(create_app(repo, down)) as client:
        sid = to_results(client, income=1400)
        before = client.get(f"/api/sessions/{sid}").json()
        snap = evidence(client, sid, persona_id="retired-fixed-income", consent=True)
        assert "nessie_unavailable" in [n["code"] for n in snap["notices"]]
        assert status(snap, "fixture-food-benefit") == status(before, "fixture-food-benefit")
        assert KEY not in json.dumps(snap)
