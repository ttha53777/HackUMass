"""Parity: the backend reproduces the OpenDoor demo's results for the demo's personas.

`fixtures/demo_parity.json` holds, per persona, the answers the demo was given and
the status the demo's own rule engine (docs/ui-reference/opendoor-demo.html) gave
each program. The same answers go through the real API here, with the curated
program records, and every program's status must agree.

A difference is either a bug here or an intentional, documented divergence
(INTENTIONAL below). Nothing else is allowed to differ.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.nessie import NessieService
from app.services.programs_repo import repository_from_env

PERSONAS = json.loads((Path(__file__).parent / "fixtures" / "demo_parity.json").read_text())

NEED = {"food": "food", "utilities": "utilities", "housing": "housing", "health": "healthcare", "transport": "transportation"}
HOME = {"rent": "renting", "own": "own", "none": "no_stable_housing"}
# demo answer key -> (question id, how to send it)
SINGLE = {
    "housing": "housing_need", "eversource": "eversource_customer", "umass": "umass_affiliation",
    "disability": "disability_bus", "busroute": "near_bus_route", "college": "college_student",
    "raftfor": "raft_use",
}
MULTI = {"util": "utility_issues", "benefits": "benefits_held"}

# The demo treats a provider that "does not state" its audience as a hard yes or no;
# the records mark those rules unverified, so the backend says "call to confirm" instead.
# (program id, the demo's status) -> extra backend statuses accepted for it.
INTENTIONAL = {
    ("hves-benefits-support", "out"): {"possibly_eligible"},
    ("hves-benefits-support", "fit"): {"possibly_eligible"},
    ("hves-information-referral", "out"): {"possibly_eligible"},
}

TO_BACKEND = {
    "have": {"already_receiving"},
    "out": {"likely_ineligible"},
    "later": {"opens_later"},
    "open": {"likely_eligible"},
    "fit": {"likely_eligible"},
    "maybe": {"insufficient_information", "possibly_eligible"},
}


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


def run_persona(client, pf: dict) -> dict:
    sid = client.post("/api/sessions").json()["session_id"]
    post(client, sid, question_id="needs", selected_option_ids=[NEED[n] for n in pf["needs"]])
    post(client, sid, question_id="zip", value=pf["zip"])
    post(client, sid, question_id="household_size", value=pf["hh"]["n"])
    snap = post(client, sid, question_id="household_who", selected_option_ids=pf["hh"]["who"])
    for key, value in pf["a"].items():
        if key == "income":
            snap = post(client, sid, question_id="income_band", selected_option_ids=[value])
        elif key == "home":
            snap = post(client, sid, question_id="housing_status", selected_option_ids=[HOME[value]])
        elif key in MULTI:
            snap = post(client, sid, question_id=MULTI[key], selected_option_ids=value)
        else:
            snap = post(client, sid, question_id=SINGLE[key], selected_option_ids=[value])
    return snap


@pytest.mark.parametrize("name", sorted(PERSONAS))
def test_statuses_match_the_demo(client, name):
    persona = PERSONAS[name]
    snap = run_persona(client, persona["pf"])
    got = {c["program"]["id"]: c["assessment"]["status"] for c in snap["programs"]}
    problems = []
    for program_id, demo_status in persona["statuses"].items():
        if program_id not in got:
            problems.append(f"{program_id}: demo shows it ({demo_status}), backend did not match it")
            continue
        allowed = TO_BACKEND[demo_status] | INTENTIONAL.get((program_id, demo_status), set())
        if got[program_id] not in allowed:
            problems.append(f"{program_id}: demo {demo_status}, backend {got[program_id]}")
    assert not problems, f"{name}:\n  " + "\n  ".join(problems)
