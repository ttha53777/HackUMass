"""T18: the scripted demo, end to end over HTTP, with real curated data and LLM_MODE=off.

Script (docs/demo-script.md):
  Food + Utilities -> ZIP 01002 -> household of 1, nobody 60+ -> results and plan
  right away -> answer open questions in any order (broken heating system, own
  my home, get Fuel Assistance) -> results move, and the response says what moved
  -> skip the rest and decline the simulated bank profile -> complete.

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
    assert snap["pending_question"]["id"] == "household_size"
    snap = post(client, sid, question_id="household_size", value=1)
    assert snap["pending_question"]["id"] == "household_who"
    assert snap["programs"], "programs are found before the household is known"
    snap = post(client, sid, question_id="household_who", selected_option_ids=["none"])

    # Results and a plan, with both kinds of provider, as soon as the 4 core questions are done.
    assert snap["phase"] == "awaiting_user"
    assert {c["program"]["type"] for c in snap["programs"]} == {"government", "community"}
    assert snap["action_plan"]
    assert_grounded(snap)
    # The app asks one question at a time, but lists every open one, ranked.
    queue = [item["question"]["id"] for item in snap["open_questions"]]
    assert queue and queue[0] == snap["pending_question"]["id"]
    assert {"income_band", "benefits_held", "utility_issues"} <= set(queue)
    before = statuses(snap)
    assert before[REPAIR] == "insufficient_information"
    assert before["capv-fuel-assistance"] == "insufficient_information"

    # Open questions can be answered in any order, not only the pending one.
    snap = post(client, sid, question_id="utility_issues", selected_option_ids=["broken"])
    snap = post(client, sid, question_id="housing_status", selected_option_ids=["own"])
    snap = post(client, sid, question_id="benefits_held", selected_option_ids=["fuel"])
    after = statuses(snap)
    assert after["capv-fuel-assistance"] == "already_receiving"
    assert after[REPAIR] == "likely_eligible"  # a broken system, an owner, and Fuel Assistance
    assert after["capv-weatherization"] == "likely_eligible"
    assert after["ma-good-neighbor-energy-fund"] == "likely_ineligible"  # people on Fuel Assistance are out
    assert REPAIR in snap["last_change"]["moved_to_fit"]
    assert_grounded(snap)

    # Every "why" line is typed, and an unanswered line names the question that settles it.
    repair = next(c for c in snap["programs"] if c["program"]["id"] == REPAIR)
    assert {c["kind"] for c in repair["assessment"]["checks"]} <= {"pass", "ask", "fail", "later", "have", "note", "unsure"}
    asks = [c["question_id"] for c in snap["programs"][0]["assessment"]["checks"] if c["kind"] == "ask"]
    assert all(q in {i["question"]["id"] for i in snap["open_questions"]} for q in asks)

    # Skip what is left; only the optional simulated bank offer remains, and declining completes.
    for _ in range(30):
        pending = snap["pending_question"]
        if pending is None:
            break
        if pending["id"] == "evidence_offer":
            snap = post(client, sid, question_id="evidence_offer", selected_option_ids=["no"])
        else:
            snap = post(client, sid, question_id=pending["id"], skipped=True)
    assert snap["phase"] == "complete" and snap["pending_question"] is None
    assert snap["open_questions"] == []
    assert_grounded(snap)


def test_editing_zip_within_coverage_refreshes_results(client):
    sid = client.post("/api/sessions").json()["session_id"]
    post(client, sid, question_id="needs", selected_option_ids=["food"])
    post(client, sid, question_id="zip", value="01002")
    post(client, sid, question_id="household_size", value=1)
    snap = post(client, sid, question_id="household_who", selected_option_ids=["none"])
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
