"""Dev-only session persistence (services/dev_sessions.py)."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import create_app
from app.services import dev_sessions
from app.services.nessie import NessieService


def _app(repo):
    return create_app(repo, NessieService(None))


def test_off_without_env(monkeypatch, repo, tmp_path):
    monkeypatch.delenv(dev_sessions.ENV_VAR, raising=False)
    with TestClient(_app(repo)) as client:
        assert client.post("/api/sessions").status_code == 201
    assert not list(tmp_path.iterdir())


def test_session_survives_restart(monkeypatch, repo, tmp_path):
    path = tmp_path / "sessions.json"
    monkeypatch.setenv(dev_sessions.ENV_VAR, str(path))

    with TestClient(_app(repo)) as client:
        first = client.post("/api/sessions").json()
        session_id = first["session_id"]
        question = first["pending_question"]
        client.post(
            f"/api/sessions/{session_id}/answers",
            json={"question_id": question["id"], "selected_option_ids": [question["options"][0]["id"]]},
        )
        before = client.get(f"/api/sessions/{session_id}").json()
        client.post(
            f"/api/sessions/{session_id}/evidence/nessie",
            json={"persona_id": "between-jobs", "consent": True},
        )
        with_bank = client.get(f"/api/sessions/{session_id}").json()

    assert path.exists() and (path.stat().st_mode & 0o777) == 0o600
    assert before["answered"]

    with TestClient(_app(repo)) as restarted:
        after = restarted.get(f"/api/sessions/{session_id}")
        assert after.status_code == 200
        after = after.json()
        assert after["answered"] == with_bank["answered"]
        assert after["financial_summary"] == with_bank["financial_summary"]
        assert after["pending_question"] == with_bank["pending_question"]
        # And it keeps working after the restart.
        assert after["pending_question"]["id"] == "zip"
        body = {"question_id": "zip", "value": "01002"}
        assert restarted.post(f"/api/sessions/{session_id}/answers", json=body).status_code in (200, 202)
        assert restarted.get(f"/api/sessions/{session_id}").json()["pending_question"]["id"] != "zip"


def test_corrupt_file_starts_clean(monkeypatch, repo, tmp_path):
    path = tmp_path / "sessions.json"
    path.write_text(json.dumps({"version": 1, "storage": {"$d": "nope"}}))
    monkeypatch.setenv(dev_sessions.ENV_VAR, str(path))
    with TestClient(_app(repo)) as client:
        assert client.post("/api/sessions").status_code == 201


def test_round_trip_encoding():
    value = {("a", "", "1"): {("t", 0): ("t", "ch", ("msgpack", b"\x00\xff"), "p")}, "k": [b"x", (1, 2)]}
    assert dev_sessions._dec(json.loads(json.dumps(dev_sessions._enc(value)))) == value
