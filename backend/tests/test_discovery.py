"""Program Discovery and the programs repository (T9), plus dataset checks (T8)."""

import json
from datetime import datetime, timezone

import pytest

from app.agents.discovery import make_discovery
from app.graph.questions import REGISTRY
from app.graph.state import Fact, Profile
from app.services.programs_repo import (
    CURATED_DIR,
    FIXTURE_DIR,
    ProgramsRepository,
    load_programs,
)

NOW = datetime(2026, 11, 14, tzinfo=timezone.utc)


def state_for(**facts) -> dict:
    return {"profile": Profile(facts={
        k: Fact(value=v, provenance="user_reported", updated_at=NOW) for k, v in facts.items()
    })}


def record(pid: str, **overrides) -> dict:
    base = {
        "id": pid,
        "name": pid.replace("-", " ").title(),
        "provider": "Test Provider",
        "type": "community",
        "categories": ["food"],
        "service_area": {"statewide": False, "state": "MA", "counties": ["Hampshire"], "zips": []},
        "description": "Test record.",
        "info_url": f"https://example.org/{pid}",
        "requirements": [],
        "verified_on": "2026-11-14",
    }
    base.update(overrides)
    return base


@pytest.fixture
def make_repo(tmp_path):
    def build(*records: dict, raw_files: dict[str, str] | None = None) -> ProgramsRepository:
        (tmp_path / "programs").mkdir(exist_ok=True)
        (tmp_path / "regions.json").write_text(json.dumps({"supported_zips": {
            "01002": {"city": "Amherst", "county": "Hampshire County", "state": "MA"},
            "01060": {"city": "Northampton", "county": "Hampshire County", "state": "MA"},
        }}))
        for rec in records:
            (tmp_path / "programs" / f"{rec['id']}.json").write_text(json.dumps(rec))
        for name, text in (raw_files or {}).items():
            (tmp_path / "programs" / name).write_text(text)
        return ProgramsRepository(tmp_path)
    return build


# --------------------------------------------------------------------------
# Discovery agent
# --------------------------------------------------------------------------


def test_supported_zip_returns_government_and_community_matches(repo):
    out = make_discovery(repo)(state_for(zip="00000", needs=["food", "utilities"]))
    assert out["coverage"] == "supported"
    assert {p.type for p in out["programs"]} == {"government", "community"}
    assert all({"food", "utilities"} & set(p.categories) for p in out["programs"])


def test_unsupported_zip_returns_nothing_and_says_so(repo):
    out = make_discovery(repo)(state_for(zip="99999", needs=["food"]))
    assert out == {"programs": [], "coverage": "unsupported"}


def test_missing_zip_or_needs_does_not_crash(repo):
    assert make_discovery(repo)(state_for(needs=["food"]))["coverage"] == "unknown"
    assert make_discovery(repo)({})["programs"] == []


def test_other_alone_matches_no_programs(repo):
    out = make_discovery(repo)(state_for(zip="00000", needs=["other"]))
    assert out == {"programs": [], "coverage": "supported"}


def test_returned_programs_are_the_records_unchanged(repo):
    out = make_discovery(repo)(state_for(zip="00000", needs=["food"]))
    for program in out["programs"]:
        assert program == repo.get(program.id)


# --------------------------------------------------------------------------
# Repository: matching and ordering
# --------------------------------------------------------------------------


def test_county_names_match_with_or_without_suffix(make_repo):
    repo = make_repo(
        record("a", service_area={"state": "MA", "counties": ["Hampshire"]}),
        record("b", service_area={"state": "MA", "counties": ["Hampshire County"]}),
        record("c", service_area={"state": "MA", "counties": ["Franklin"]}),
    )
    assert [p.id for p in repo.list("01002", ["food"])] == ["a", "b"]


def test_county_match_respects_state(make_repo):
    repo = make_repo(record("ct", service_area={"state": "CT", "counties": ["Hampshire"]}))
    assert repo.list("01002", ["food"]) == []


def test_order_is_first_need_then_local_then_name(make_repo):
    repo = make_repo(
        record("state-food", name="A State Food", service_area={"statewide": True, "state": "MA"}),
        record("zip-food", name="Z Zip Food", service_area={"zips": ["01002"]}),
        record("county-heat", name="B Heat", categories=["utilities"]),
        record("county-food", name="M County Food"),
    )
    order = [p.id for p in repo.list("01002", ["food", "utilities"])]
    assert order == ["zip-food", "county-food", "state-food", "county-heat"]
    # Reversing the needs puts utilities first.
    assert repo.list("01002", ["utilities", "food"])[0].id == "county-heat"


def test_zip_specific_program_is_not_shown_elsewhere(make_repo):
    repo = make_repo(record("amherst-only", service_area={"zips": ["01002"]}))
    assert repo.list("01060", ["food"]) == []


def test_multi_category_program_appears_once(make_repo):
    repo = make_repo(record("both", categories=["food", "utilities"]))
    assert [p.id for p in repo.list("01002", ["food", "utilities"])] == ["both"]


# --------------------------------------------------------------------------
# Repository: record quality rules
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "overrides",
    [
        {"info_url": "http://example.org/x"},
        {"apply_url": "ftp://example.org/x"},
        {"requirements": [{"id": "r", "kind": "text_only", "text": "t",
                           "source_url": "example.org", "verified": True}]},
        {"categories": []},
        {"service_area": {"statewide": False, "counties": [], "zips": []}},
        {"service_area": {"statewide": True}},
        {"verified_on": None},
    ],
)
def test_bad_records_are_skipped_not_served(make_repo, overrides):
    repo = make_repo(record("good"), record("bad", **overrides))
    assert [p.id for p in repo.all()] == ["good"]


def test_malformed_and_duplicate_files_do_not_break_loading(make_repo):
    repo = make_repo(
        record("good"),
        raw_files={"broken.json": "{not json", "zz-dupe.json": json.dumps(record("good"))},
    )
    assert [p.id for p in repo.all()] == ["good"]


# --------------------------------------------------------------------------
# Dataset checks: these fail the build on a bad curated or fixture record
# --------------------------------------------------------------------------

FIELDS_WITH_QUESTIONS = {spec.question.target_field for spec in REGISTRY.values()}


@pytest.mark.parametrize("root", [CURATED_DIR, FIXTURE_DIR], ids=["curated", "fixtures"])
def test_every_record_file_loads(root):
    _, rejected = load_programs(root / "programs")
    assert rejected == []


@pytest.mark.parametrize("root", [CURATED_DIR, FIXTURE_DIR], ids=["curated", "fixtures"])
def test_structured_requirements_reference_askable_fields(root):
    programs, _ = load_programs(root / "programs")
    for program in programs:
        for req in program.requirements:
            if req.kind in ("text_only", "open_access", "residency", "info"):
                continue
            assert req.field in FIELDS_WITH_QUESTIONS, (program.id, req.id, req.field)


def test_curated_records_cover_supported_region():
    programs, _ = load_programs(CURATED_DIR / "programs")
    if not programs:
        pytest.skip("no curated records yet")
    repo = ProgramsRepository(CURATED_DIR)
    assert repo.is_supported("01002"), "Amherst must be in regions.json"
    for program in programs:
        assert program.type in ("government", "community")
        assert not program.info_url.startswith("https://example.")


@pytest.mark.parametrize(("need", "expected"), [
    ("seniors", {"hves-home-delivered-meals", "pvta-senior-dial-a-ride"}),
    ("pregnancy_baby", {"capv-wic"}),
    ("disability", {"pvta-ada-paratransit"}),
])
def test_added_needs_find_curated_programs(need, expected):
    discovery = make_discovery(ProgramsRepository(CURATED_DIR))
    out = discovery(state_for(zip="01002", needs=[need]))
    assert out["coverage"] == "supported"
    assert expected <= {p.id for p in out["programs"]}


def test_every_needs_option_is_a_category_with_a_curated_program():
    """Every need offered in the picker has at least one curated record behind it."""
    categories = {c for p in load_programs(CURATED_DIR / "programs")[0] for c in p.categories}
    options = {o.id for o in REGISTRY["needs"].question.options} - {"other"}
    assert options <= categories, options - categories
