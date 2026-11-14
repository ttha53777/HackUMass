"""T18: the scripted demo, end to end over HTTP, with real curated data and LLM_MODE=off.

Script (docs/demo-script.md):
  Food + Utilities -> ZIP 01002 -> "I'm behind on a bill" -> household of 1
  -> $1,400 a month -> results and plan -> follow-up "I own my home"
  -> results update -> decline the simulated bank profile -> complete.

Parametrised to run five times in a row; every run uses a fresh app.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.nessie import NessieService
from app.services.programs_repo import repository_from_env

REPAIR = "capv-heating-system-repair"


@pytest.fixture(scope="module")
def curated():
    return repository_from_env("curated")


@pytest.fixture
def client(curated):
    with TestClient(create_app(curated, NessieService(None))) as test_client:
        yield test_client


def post(client, sid, **body) -> dict:
    response = client.post(f"/api/sessions/{sid}/answers", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def statuses(snapshot) -> dict[str, str]:
    return {c["program"]["id"]: c["assessment"]["status"] for c in snapshot["programs"]}


def assert_grounded(snapshot):
    """Every link in the plan is on its program record; nothing is stale."""
    records = {c["program"]["id"]: c["program"] for c in snapshot["programs"]}
    for item in snapshot["action_plan"]:
        record = records[item["program_id"]]
        assert item["link"] in {record["info_url"], record["apply_url"]}
        assert item["documents"] == record["documents_needed"]
    assert all(not c["stale"] for c in snapshot["programs"]) and not snapshot["plan_stale"]
    assert all(c["assessment"]["disclaimer"] for c in snapshot["programs"])


@pytest.mark.parametrize("run", range(5))
def test_scripted_demo(client, run):
    created = client.post("/api/sessions")
    assert created.status_code == 201
    snap = created.json()
    sid = snap["session_id"]

    # The first question is there before the person types anything.
    assert snap["pending_question"]["id"] == "needs" and snap["answered"] == []

    snap = post(client, sid, question_id="needs", selected_option_ids=["food", "utilities"])
    assert snap["pending_question"]["id"] == "zip"
    snap = post(client, sid, question_id="zip", value="01002")
    assert snap["region"]["city"] == "Amherst"
    assert snap["pending_question"]["id"] == "utility_urgency"
    snap = post(client, sid, question_id="utility_urgency", selected_option_ids=["behind"])
    assert snap["pending_question"]["id"] == "household_size"
    snap = post(client, sid, question_id="household_size", value=1)
    assert snap["pending_question"]["id"] == "monthly_income"
    snap = post(client, sid, question_id="monthly_income", value=1400, period="month")

    # Results and a plan, with both kinds of provider, before any follow-up.
    assert snap["phase"] == "awaiting_user"
    assert {c["program"]["type"] for c in snap["programs"]} == {"government", "community"}
    assert snap["action_plan"]
    assert_grounded(snap)
    before = statuses(snap)
    assert before[REPAIR] == "insufficient_information"
    assert before["ma-good-neighbor-energy-fund"] == "likely_ineligible"
    plan_before = [i["program_id"] for i in snap["action_plan"]]

    # Exactly one eligibility follow-up, and it changes a result and the plan.
    assert snap["pending_question"]["id"] == "housing_status"
    snap = post(client, sid, question_id="housing_status", selected_option_ids=["own"])
    after = statuses(snap)
    assert after[REPAIR] == "possibly_eligible"
    assert {k for k in before if before[k] != after[k]} == {REPAIR}
    plan_after = [i["program_id"] for i in snap["action_plan"]]
    assert plan_after.index(REPAIR) < plan_before.index(REPAIR)
    assert_grounded(snap)

    # Then only the optional simulated bank offer; declining it completes the session.
    assert snap["pending_question"]["id"] == "evidence_offer"
    snap = post(client, sid, question_id="evidence_offer", selected_option_ids=["no"])
    assert snap["phase"] == "complete" and snap["pending_question"] is None
    followups = [a["question_id"] for a in snap["answered"]
                 if a["question_id"] not in ("needs", "zip", "utility_urgency", "household_size",
                                             "monthly_income", "evidence_offer")]
    assert followups == ["housing_status"]
    assert_grounded(snap)


def test_editing_zip_within_coverage_refreshes_results(client):
    sid = client.post("/api/sessions").json()["session_id"]
    post(client, sid, question_id="needs", selected_option_ids=["food"])
    snap = post(client, sid, question_id="zip", value="01002")
    snap = post(client, sid, question_id="household_size", value=1)
    snap = post(client, sid, question_id="monthly_income", value=1400, period="month")
    amherst = {c["program"]["id"] for c in snap["programs"]}
    assert "asc-campus-pantry" in amherst  # Amherst ZIPs only

    snap = post(client, sid, question_id="zip", value="01060")  # Northampton
    assert snap["region"]["city"] == "Northampton"
    northampton = {c["program"]["id"] for c in snap["programs"]}
    assert "asc-campus-pantry" not in northampton
    assert northampton and northampton != amherst
    assert all(c["assessment"] for c in snap["programs"])
    assert {i["program_id"] for i in snap["action_plan"]} <= northampton
    assert_grounded(snap)
