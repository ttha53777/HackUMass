"""The fictional demo papers extract exactly what demo_person.json says.

The papers are generated from tests/fixtures/demo_person.json by
frontend/scripts/make-demo-papers.mjs, which also writes
demo_papers_expected.json. If a paper changes and its facts drift, this fails.
"""

import json
from pathlib import Path

import pytest

from app.services.documents import extract

ROOT = Path(__file__).resolve().parents[2]
SOURCE = json.loads((ROOT / "backend/tests/fixtures/demo_person.json").read_text())
EXPECTED = json.loads((ROOT / "backend/tests/fixtures/demo_papers_expected.json").read_text())["papers"]
PAPERS = ROOT / "frontend/public/demo-papers" / SOURCE["slug"]


def test_expected_file_is_in_sync_with_the_source():
    assert EXPECTED == {p["file"]: p.get("expected", {}) for p in SOURCE["papers"]}, (
        "Run: cd frontend && node scripts/make-demo-papers.mjs"
    )


@pytest.mark.parametrize("paper", [p["file"] for p in SOURCE["papers"]])
@pytest.mark.parametrize("ext", ["pdf", "txt"])
def test_each_paper_extracts_exactly_its_facts(paper, ext):
    path = PAPERS / f"{paper}.{ext}"
    assert path.exists(), f"{path} is missing. Run: cd frontend && node scripts/make-demo-papers.mjs"
    result = extract(path.name, path.read_bytes())
    got = {name: fact.value for name, fact in result.extracted_facts.items()}
    assert got == EXPECTED[paper]
    assert all(not fact.confirmed for fact in result.extracted_facts.values())  # nothing is used unconfirmed


def test_every_page_is_marked_fictional():
    for paper in SOURCE["papers"]:
        text = (PAPERS / f"{paper['file']}.txt").read_text()
        assert "SAMPLE" in text and "FICTIONAL" in text


def test_the_deliberate_household_conflict_is_in_the_data():
    on_paper = EXPECTED["household-members"]["household_size"]
    assert on_paper == len(SOURCE["household"])
    assert SOURCE["chat"]["typed_household_size"] != on_paper


def test_pay_stub_does_not_carry_a_household_size():
    # The household figure comes only from the household paper, so the conflict is clear.
    assert "household_size" not in EXPECTED["pay-stub"]
