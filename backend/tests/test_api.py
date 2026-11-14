"""T5: session API, error codes, and the guided flow over HTTP."""

import threading
import time

from fastapi.testclient import TestClient

from app.agents.action_planning import action_planning
from app.agents.discovery import make_discovery
from app.agents.eligibility import eligibility
from app.agents.user_intelligence import user_intelligence
from app.graph.build import build_graph
from app.main import create_app
from app.services import session_store
from app.services.session_store import SessionManager, get_checkpointer


def start(client) -> dict:
    response = client.post("/api/sessions")
    assert response.status_code == 201
    return response.json()


def answer(client, session_id: str, expect: int = 200, **body) -> dict:
    response = client.post(f"/api/sessions/{session_id}/answers", json=body)
    assert response.status_code == expect, response.text
    return response.json()


def run_food_intake(client) -> tuple[str, dict]:
    session_id = start(client)["session_id"]
    answer(client, session_id, question_id="needs", selected_option_ids=["food"])
    answer(client, session_id, question_id="zip", value="00000")
    answer(client, session_id, question_id="household_size", value=1)
    answer(client, session_id, question_id="household_who", selected_option_ids=["none"])
    snapshot = answer(client, session_id, question_id="monthly_income", value=1400, period="month")
    return session_id, snapshot


def test_new_session_returns_first_question_before_any_input(client):
    snapshot = start(client)
    assert snapshot["pending_question"]["id"] == "needs"
    assert snapshot["pending_question"]["type"] == "multi_select"
    assert snapshot["phase"] == "intake"
    assert snapshot["busy"] is False
    assert snapshot["answered"] == [] and snapshot["programs"] == []


def test_answer_returns_next_question_and_keeps_earlier_answers(client):
    session_id = start(client)["session_id"]
    snapshot = answer(client, session_id, question_id="needs", selected_option_ids=["food"])
    assert snapshot["pending_question"]["id"] == "zip"

    snapshot = answer(client, session_id, question_id="zip", value="00000")
    assert snapshot["pending_question"]["id"] == "household_size"
    assert [item["question_id"] for item in snapshot["answered"]] == ["needs", "zip"]
    assert snapshot["answered"][0]["display_value"] == "Food & groceries"

    # A separate read sees the same state.
    assert client.get(f"/api/sessions/{session_id}").json() == snapshot


def test_full_flow_produces_sourced_results_and_a_plan(client):
    session_id, snapshot = run_food_intake(client)

    assert snapshot["phase"] == "awaiting_user"
    assert snapshot["pending_question"]["id"] == "age_60_plus"
    assert {card["program"]["type"] for card in snapshot["programs"]} == {"government", "community"}
    assert all(card["assessment"] and not card["stale"] for card in snapshot["programs"])
    assert snapshot["plan_stale"] is False

    known_urls = {
        url
        for card in snapshot["programs"]
        for url in (card["program"]["info_url"], card["program"]["apply_url"])
        if url
    }
    assert snapshot["action_plan"] and all(i["link"] in known_urls for i in snapshot["action_plan"])
    assert set(snapshot["agent_statuses"]) == {
        "user_intelligence", "program_discovery", "eligibility", "action_planning",
    }
    assert "fixture_data" in [notice["code"] for notice in snapshot["notices"]]

    snapshot = answer(client, session_id, question_id="age_60_plus", selected_option_ids=["yes"])
    assert snapshot["pending_question"]["id"] == "evidence_offer"
    snapshot = answer(client, session_id, question_id="evidence_offer", skipped=True)
    assert snapshot["phase"] == "complete" and snapshot["pending_question"] is None
    pantry = next(c for c in snapshot["programs"] if c["program"]["id"] == "fixture-senior-pantry")
    assert pantry["assessment"]["missing_fields"] == []


def test_snapshot_does_not_leak_internal_state(client):
    _, snapshot = run_food_intake(client)
    text = str(snapshot)
    for internal in ("inputs_hash", "run_counts", "dispatched", "dirty", "user_answer"):
        assert internal not in text


def test_skipping_income_still_gives_qualified_results(client):
    session_id = start(client)["session_id"]
    answer(client, session_id, question_id="needs", selected_option_ids=["food"])
    answer(client, session_id, question_id="zip", value="00000")
    answer(client, session_id, question_id="household_size", value=1)
    answer(client, session_id, question_id="household_who", selected_option_ids=["none"])
    snapshot = answer(client, session_id, question_id="monthly_income", skipped=True)

    assert snapshot["programs"] and snapshot["action_plan"]
    benefit = next(c for c in snapshot["programs"] if c["program"]["id"] == "fixture-food-benefit")
    assert benefit["assessment"]["status"] == "insufficient_information"
    assert benefit["assessment"]["missing_fields"] == ["monthly_income"]
    skipped = [item for item in snapshot["answered"] if item["skipped"]]
    assert [item["question_id"] for item in skipped] == ["monthly_income"]
    # The skipped question is not asked again.
    assert snapshot["pending_question"]["id"] != "monthly_income"


def test_editing_zip_to_unsupported_area_clears_results(client):
    session_id, _ = run_food_intake(client)
    snapshot = answer(client, session_id, question_id="zip", value="99999")

    assert snapshot["coverage"] == "unsupported"
    assert snapshot["programs"] == [] and snapshot["action_plan"] == []
    assert [notice["code"] for notice in snapshot["notices"]] == ["unsupported_region"]

    # Changing back restores results without restarting the interview.
    snapshot = answer(client, session_id, question_id="zip", value="00000")
    assert snapshot["coverage"] == "supported" and len(snapshot["programs"]) == 2
    assert [i["question_id"] for i in snapshot["answered"]][:5] == [
        "needs", "zip", "household_size", "household_who", "monthly_income",
    ]


def test_editing_needs_asks_only_the_newly_relevant_question(client):
    session_id, _ = run_food_intake(client)
    snapshot = answer(client, session_id, question_id="needs", selected_option_ids=["housing"])
    assert snapshot["pending_question"]["id"] == "housing_status"
    assert [card["program"]["id"] for card in snapshot["programs"]] == ["fixture-rent-help"]


def test_no_matches_is_reported_not_invented(client):
    session_id = start(client)["session_id"]
    answer(client, session_id, question_id="needs", selected_option_ids=["healthcare"])
    snapshot = answer(client, session_id, question_id="zip", value="00000")
    assert snapshot["programs"] == [] and snapshot["phase"] == "complete"
    assert [notice["code"] for notice in snapshot["notices"]] == ["no_matches"]


def test_unknown_session_is_404(client):
    for response in (
        client.get("/api/sessions/does-not-exist"),
        client.post("/api/sessions/does-not-exist/answers", json={"question_id": "needs"}),
    ):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "session_not_found"


def test_question_that_was_never_asked_is_409(client):
    session_id = start(client)["session_id"]
    body = answer(client, session_id, expect=409, question_id="zip", value="00000")
    assert body["error"]["code"] == "stale_question"


def test_invalid_answers_are_422_with_a_usable_message(client):
    session_id = start(client)["session_id"]
    body = answer(client, session_id, expect=422, question_id="nonsense")
    assert body["error"]["code"] == "validation_error"

    body = answer(client, session_id, expect=422, question_id="needs", skipped=True)
    assert body["error"]["message"] == "This question is needed to continue."

    answer(client, session_id, question_id="needs", selected_option_ids=["food"])
    body = answer(client, session_id, expect=422, question_id="zip", value="12")
    assert body["error"]["message"] == "Enter a 5-digit ZIP code."

    # Malformed bodies get the same error shape and do not echo the input.
    response = client.post(f"/api/sessions/{session_id}/answers", json={"question_id": ["x"]})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"

    # A rejected answer changes nothing.
    assert client.get(f"/api/sessions/{session_id}").json()["pending_question"]["id"] == "zip"


def test_sessions_are_isolated(client):
    first, second = start(client)["session_id"], start(client)["session_id"]
    assert first != second
    answer(client, first, question_id="needs", selected_option_ids=["food"])
    untouched = client.get(f"/api/sessions/{second}").json()
    assert untouched["pending_question"]["id"] == "needs" and untouched["answered"] == []


def test_slow_run_returns_202_then_409_while_busy_then_finishes(repo, monkeypatch):
    monkeypatch.setattr(session_store, "FAST_PATH_SECONDS", 0.05)
    release = threading.Event()

    def slow_discovery(state):
        release.wait(timeout=5)
        return make_discovery(repo)(state)

    app = create_app(repo)
    checkpointer = get_checkpointer()
    graph = build_graph(
        checkpointer=checkpointer,
        user_intelligence=user_intelligence,
        discovery=slow_discovery,
        eligibility=eligibility,
        action_planning=action_planning,
    )
    app.state.sessions = SessionManager(graph, checkpointer)

    with TestClient(app) as client:
        session_id = start(client)["session_id"]
        answer(client, session_id, question_id="needs", selected_option_ids=["transportation"])

        pending = answer(client, session_id, expect=202, question_id="zip", value="00000")
        assert pending["busy"] is True

        # Progress is visible while the run is still going.
        polled = client.get(f"/api/sessions/{session_id}").json()
        assert polled["busy"] is True
        assert polled["phase"] == "discovering"
        assert polled["agent_statuses"]["program_discovery"]["status"] == "running"

        busy = answer(client, session_id, expect=409, question_id="zip", value="00000")
        assert busy["error"]["code"] == "session_busy"

        release.set()
        deadline = time.monotonic() + 5
        while (snapshot := client.get(f"/api/sessions/{session_id}").json())["busy"]:
            assert time.monotonic() < deadline, "run never finished"
            time.sleep(0.02)
        # Discovery finished; the household questions come before any results.
        assert snapshot["phase"] == "intake"
        assert snapshot["pending_question"]["id"] == "household_size"
        assert [card["program"]["id"] for card in snapshot["programs"]] == ["fixture-ride-service"]


def test_idle_sessions_expire(client, monkeypatch):
    session_id = start(client)["session_id"]
    monkeypatch.setattr(session_store, "IDLE_EXPIRY_SECONDS", -1)
    start(client)  # creating a session sweeps idle ones
    assert client.get(f"/api/sessions/{session_id}").status_code == 404


def test_curated_source_with_no_data_reports_unsupported(tmp_path):
    from app.services.programs_repo import ProgramsRepository

    (tmp_path / "programs").mkdir()
    with TestClient(create_app(ProgramsRepository(tmp_path))) as client:
        session_id = start(client)["session_id"]
        answer(client, session_id, question_id="needs", selected_option_ids=["food"])
        snapshot = answer(client, session_id, question_id="zip", value="00000")
        assert snapshot["coverage"] == "unsupported" and snapshot["programs"] == []


def test_snapshot_names_the_region_and_labels_missing_facts(client):
    session_id = start(client)["session_id"]
    answer(client, session_id, question_id="needs", selected_option_ids=["food"])
    snapshot = answer(client, session_id, question_id="zip", value="00000")
    assert snapshot["region"] == {
        "zip": "00000", "city": "Fixtureville", "county": "Fixture County", "state": "ZZ",
    }
    answer(client, session_id, question_id="household_size", value=1)
    answer(client, session_id, question_id="household_who", selected_option_ids=["none"])
    snapshot = answer(client, session_id, question_id="monthly_income", skipped=True)
    missing = {f for c in snapshot["programs"] for f in (c["assessment"] or {}).get("missing_fields", [])}
    assert missing and set(snapshot["field_labels"]) == missing
    assert snapshot["field_labels"]["monthly_income"] == "Monthly income"


def test_unsupported_zip_has_no_region(client):
    session_id = start(client)["session_id"]
    answer(client, session_id, question_id="needs", selected_option_ids=["food"])
    snapshot = answer(client, session_id, question_id="zip", value="99999")
    assert snapshot["coverage"] == "unsupported" and snapshot["region"] is None


# --- open questions: any follow-up may be answered, in any order -----------------


def test_core_questions_cannot_be_answered_before_they_are_asked(client):
    session_id = start(client)["session_id"]
    stale = answer(client, session_id, expect=409, question_id="household_who", selected_option_ids=["none"])
    assert stale["error"]["code"] == "stale_question"
    unknown = answer(client, session_id, expect=422, question_id="nope", value=1)
    assert unknown["error"]["code"] == "validation_error"


def test_snapshot_lists_open_questions_and_what_the_last_answer_changed(client):
    session_id, snapshot = run_food_intake(client)
    open_ids = [item["question"]["id"] for item in snapshot["open_questions"]]
    assert open_ids == ["age_60_plus"]  # income was answered while running the intake
    assert snapshot["open_questions"][0]["affects"] == ["fixture-senior-pantry"]
    assert snapshot["pending_question"]["id"] == open_ids[0]

    snapshot = answer(client, session_id, question_id="age_60_plus", selected_option_ids=["yes"])
    assert snapshot["last_change"]["moved_to_fit"] == ["fixture-senior-pantry"]
    # The next input clears it, and its own change replaces it.
    snapshot = answer(client, session_id, question_id="evidence_offer", selected_option_ids=["no"])
    assert snapshot["last_change"] == {
        "moved_to_fit": [], "opens_later": [], "no_longer_fit": [], "updated": [],
    }


def test_checks_name_the_question_that_would_settle_them(client):
    session_id = start(client)["session_id"]
    answer(client, session_id, question_id="needs", selected_option_ids=["food"])
    answer(client, session_id, question_id="zip", value="00000")
    answer(client, session_id, question_id="household_size", value=1)
    snapshot = answer(client, session_id, question_id="household_who", selected_option_ids=["none"])
    benefit = next(c for c in snapshot["programs"] if c["program"]["id"] == "fixture-food-benefit")
    asks = [c for c in benefit["assessment"]["checks"] if c["kind"] == "ask"]
    assert [c["question_id"] for c in asks] == ["income_band"]
    queue = {i["question"]["id"]: i["question"] for i in snapshot["open_questions"]}
    # The income question carries ranges built from the program's own table.
    assert queue["income_band"]["options"][-1]["id"] == "unsure"
    assert len(queue["income_band"]["options"]) > 2

    # A band answer settles income: the program is decided.
    first = queue["income_band"]["options"][0]["id"]
    snapshot = answer(client, session_id, question_id="income_band", selected_option_ids=[first])
    benefit = next(c for c in snapshot["programs"] if c["program"]["id"] == "fixture-food-benefit")
    assert benefit["assessment"]["status"] == "likely_eligible"
    assert "income_band" not in [i["question"]["id"] for i in snapshot["open_questions"]]


def test_followups_are_not_accepted_before_there_are_results(client):
    session_id = start(client)["session_id"]
    early = answer(client, session_id, expect=409, question_id="benefits_held", selected_option_ids=["snap"])
    assert early["error"]["code"] == "stale_question"
    # Once intake is over, a never-asked follow-up (a guide tailoring question) is fine.
    session_id, _ = run_food_intake(client)
    answer(client, session_id, question_id="college_student", selected_option_ids=["no"])


def test_status_changes_are_classified_and_ignore_new_programs():
    from app.services.session_store import status_changes

    change = status_changes(
        {"a": "insufficient_information", "b": "possibly_eligible", "c": "likely_eligible", "d": "likely_eligible"},
        {"a": "likely_eligible", "b": "opens_later", "c": "likely_ineligible", "d": "likely_eligible", "new": "likely_eligible"},
    )
    assert change == {"moved_to_fit": ["a"], "opens_later": ["b"], "no_longer_fit": ["c"], "updated": []}


def test_already_receiving_is_not_reported_as_a_new_fit():
    from app.services.session_store import status_changes

    change = status_changes(
        {"snap": "insufficient_information", "fuel": "likely_eligible"},
        {"snap": "already_receiving", "fuel": "already_receiving"},
    )
    assert change == {"moved_to_fit": [], "opens_later": [], "no_longer_fit": [], "updated": ["snap", "fuel"]}
