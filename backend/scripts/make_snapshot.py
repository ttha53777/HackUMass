"""Regenerates tests/fixtures/snapshot.json from the real curated programs.

The snapshot is a mid-journey session: the four core questions answered, then one
follow-up, so it carries ranked open questions, typed checks and a `last_change`.
Run from backend/, then run `npm run sync:fixture` in frontend/:

    .venv/bin/python scripts/make_snapshot.py
"""

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.execution.config import automation_records  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.nessie import NessieService  # noqa: E402
from app.services.programs_repo import repository_from_env  # noqa: E402

TARGET = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "snapshot.json"

# Maya's journey: food + utilities in Amherst, a household of 2 with someone 60+,
# who then says she has a shut-off notice.
STEPS = [
    {"question_id": "needs", "selected_option_ids": ["food", "utilities"]},
    {"question_id": "zip", "value": "01002"},
    {"question_id": "household_size", "value": 2},
    {"question_id": "household_who", "selected_option_ids": ["60"]},
    {"question_id": "utility_issues", "selected_option_ids": ["shutoff"]},
]


def main() -> None:
    app = create_app(repository_from_env("curated"), NessieService(None))
    # Show the browser agent's button in the UI fixture, as if BROWSER_PROVIDER were set.
    app.state.automation_modes = {pid: r.mode for pid, r in automation_records().items()}
    with TestClient(app) as client:
        session_id = client.post("/api/sessions").json()["session_id"]
        snapshot: dict = {}
        for step in STEPS:
            response = client.post(f"/api/sessions/{session_id}/answers", json=step)
            response.raise_for_status()
            snapshot = response.json()
    snapshot["session_id"] = "00000000-0000-4000-8000-000000000001"
    for status in snapshot["agent_statuses"].values():
        status["updated_at"] = "2026-11-14T12:00:00Z"
    TARGET.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {TARGET}: {len(snapshot['programs'])} programs, {len(snapshot['open_questions'])} open questions")


if __name__ == "__main__":
    main()
