"""Phase 5: what a form needs before a run, device details into the run, and the conflict block."""

import pytest

from app.execution.fields import FieldStore, InvalidAnswer, add_device_details, readiness, store_from_profile
from app.execution.models import AutomationRecord
from app.graph.state import Conflict, Fact, Profile
from tests.execution_fakes import click, type_
from tests.test_api import run_food_intake
from tests.test_execution_api import PROGRAM, harness, runs_url, wait_for  # noqa: F401  (fixture)

FIELDS = ["first_name", "last_name", "date_of_birth", "phone", "street_address", "city", "state", "zip",
          "household_size", "monthly_income"]
DETAILS = {"first_name": "Maya", "last_name": "Rivera", "date_of_birth": "03/14/1994",
           "street_address": "12 Example Street, Apt 3"}
# The run parks on a question (phone is not supplied), so its store can be inspected.
PARK = {"turns": [[click(100, 100)], [type_("{{phone}}")], []]}


def with_fields(h):
    h.client.app.state.automation[PROGRAM] = AutomationRecord(
        program_id=PROGRAM, mode="practice", fields=FIELDS, fields_optional=["email"])


def ready_url(sid):
    return runs_url(sid, "readiness") + f"?program_id={PROGRAM}"


def test_readiness_sorts_keys_by_source(harness):
    with_fields(harness)
    sid, _ = run_food_intake(harness.client)
    r = harness.client.get(ready_url(sid))
    assert r.status_code == 200
    body = r.json()
    assert set(body["from_profile"]) >= {"zip", "household_size", "monthly_income"}
    assert {"first_name", "phone", "email"} <= set(body["from_device_needed"])
    assert body["blocked_by"] == [] and body["unconfirmed"] == [] and body["will_ask"] == []
    assert "1400" not in r.text and "1,400" not in r.text  # keys only, never values


def test_readiness_for_a_program_not_on_the_list_is_refused(harness):
    with_fields(harness)
    sid, _ = run_food_intake(harness.client)
    r = harness.client.get(runs_url(sid, "readiness") + "?program_id=somewhere-else")
    assert r.status_code == 422


def test_a_disputed_answer_the_form_needs_blocks_the_start(harness):
    with_fields(harness)
    client = harness.client
    sid, _ = run_food_intake(client)  # typed household of 1
    client.post(f"/api/sessions/{sid}/evidence/document",
                files={"file": ("h.txt", b"Household size: 3", "text/plain")}, data={"consent": "true", "kind": "dob"})
    ready = client.get(ready_url(sid)).json()
    assert ready["blocked_by"] == ["household_size"] and "household_size" not in ready["will_ask"]
    r = client.post(runs_url(sid), json={"program_id": PROGRAM, "consent": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "facts_in_conflict"


@pytest.mark.parametrize("harness", [PARK], indirect=True)
def test_device_details_fill_the_run_and_never_reach_state(harness, caplog):
    with_fields(harness)
    client = harness.client
    sid, _ = run_food_intake(client)
    view = client.post(runs_url(sid), json={"program_id": PROGRAM, "consent": True, "details": DETAILS}).json()
    wait_for(client, sid, view["run_id"], "needs_answer")
    store = harness.manager.require(sid, view["run_id"]).store
    assert {"first_name", "last_name", "full_name", "date_of_birth", "street_address"} <= store.known()
    assert store.value("full_name") == "Maya Rivera"
    values = str(client.app.state.sessions.values(sid))
    assert "Maya" not in values and "Example Street" not in values
    assert "Maya" not in caplog.text and "03/14/1994" not in caplog.text


@pytest.mark.parametrize("body,message", [
    ({"household_size": "9"}, "can't use"),  # owned by the profile
    ({"date_of_birth": "1994-03-14"}, "Date of birth"),  # checked like a typed answer
])
def test_bad_device_details_are_refused_without_echoing_them(harness, body, message):
    with_fields(harness)
    sid, _ = run_food_intake(harness.client)
    r = harness.client.post(runs_url(sid), json={"program_id": PROGRAM, "consent": True, "details": body})
    assert r.status_code == 422 and message in r.json()["error"]["message"]
    assert "1994-03-14" not in r.text


def test_the_profile_value_stands_over_a_device_value():
    now = Fact(value="01002", provenance="user_reported", confirmed=True, updated_at="2026-11-14T00:00:00Z")
    store = store_from_profile(Profile(facts={"zip": now}))
    assert add_device_details(store, {"zip": "02139", "phone": "413-555-0142"}) == ["phone"]
    assert store.value("zip") == "01002"


def test_unconfirmed_and_unknown_keys():
    reading = Fact(value=1240, provenance="document_extracted", confirmed=False, updated_at="2026-11-14T00:00:00Z")
    typed = Fact(value=2, provenance="user_reported", confirmed=True, updated_at="2026-11-14T00:00:00Z")
    paper = Fact(value=3, provenance="document_extracted", confirmed=False, updated_at="2026-11-14T00:00:00Z")
    profile = Profile(facts={"monthly_income": reading, "household_size": typed},
                      conflicts=[Conflict(field="household_size", candidates=[typed, paper])])
    ready = readiness(profile, store_from_profile(profile), ["monthly_income", "household_size", "phone"], [])
    assert ready.unconfirmed == ["monthly_income"] and ready.blocked_by == ["household_size"]
    assert ready.from_device_needed == ["phone"]
    with pytest.raises(InvalidAnswer):
        add_device_details(FieldStore(), {"ssn": "x"})


def test_records_name_only_known_keys():
    with pytest.raises(ValueError):
        AutomationRecord(program_id="x", mode="practice", fields=["ssn"])
