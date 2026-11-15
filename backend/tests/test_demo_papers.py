"""The fictional demo papers extract exactly what demo_person.json says.

The papers are generated from tests/fixtures/demo_person.json by
frontend/scripts/make-demo-papers.mjs, which also writes
demo_papers_expected.json. If a paper changes and its facts drift, this fails.
"""

import json
from pathlib import Path

import pytest

from app.services.documents import extract, read_document

ROOT = Path(__file__).resolve().parents[2]
SOURCE = json.loads((ROOT / "backend/tests/fixtures/demo_person.json").read_text())
_EXPECTED_FILE = json.loads((ROOT / "backend/tests/fixtures/demo_papers_expected.json").read_text())
EXPECTED = _EXPECTED_FILE["papers"]
EXPECTED_DETAILS = _EXPECTED_FILE["details"]
PAPERS = ROOT / "frontend/public/demo-papers" / SOURCE["slug"]


def test_expected_file_is_in_sync_with_the_source():
    assert EXPECTED == {p["file"]: p.get("expected", {}) for p in SOURCE["papers"]}, (
        "Run: cd frontend && node scripts/make-demo-papers.mjs"
    )
    assert EXPECTED_DETAILS == {p["file"]: p.get("expected_details", {}) for p in SOURCE["papers"]}, (
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


@pytest.mark.parametrize("paper", SOURCE["papers"], ids=[p["file"] for p in SOURCE["papers"]])
@pytest.mark.parametrize("ext", ["pdf", "txt"])
def test_each_paper_read_as_its_kind_gives_exactly_its_form_details(paper, ext):
    path = PAPERS / f"{paper['file']}.{ext}"
    reading = read_document(path.name, path.read_bytes(), paper["kind"])
    assert "kind_mismatch" not in reading.extraction.notes
    assert reading.identity == EXPECTED_DETAILS[paper["file"]]


def test_papers_cover_every_device_detail_the_fuel_and_food_forms_need():
    from app.execution.fields import DEVICE_KEYS

    covered = {k for details in EXPECTED_DETAILS.values() for k in details}
    assert DEVICE_KEYS - covered == set(), "a device key no demo paper fills"


def test_the_numbers_on_the_papers_add_up():
    details = {k: v for d in EXPECTED_DETAILS.values() for k, v in d.items()}
    money = lambda v: float(v.replace(",", ""))  # noqa: E731
    lines = {p["file"]: p["lines"] for p in SOURCE["papers"]}
    assert "Hourly rate: $15.50" in lines["pay-stub"] and "Hours worked: 80" in lines["pay-stub"]
    assert money(details["earned_income_monthly"]) == 15.50 * 80
    assert money(details["earned_income_monthly"]) + money(details["other_income_amount"]) == 2290
    assert "Previous balance: $142.60" in lines["electric-bill"] and "Total due: $313.85" in lines["electric-bill"]
    assert round(142.60 + 171.25, 2) == 313.85 and details["amount_past_due"] == "142.60"
    assert money(details["rent_owed"]) == 2 * money(details["monthly_rent"])
