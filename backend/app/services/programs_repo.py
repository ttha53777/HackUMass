"""Read-only access to program records.

This is the storage seam for program data: agents call `ProgramsRepository`
and never touch files. Swapping the file-backed source for a database later
only changes this module.

Record quality rules (foundation plan B.7, step 6): a record is loaded only if
it parses, has an https `info_url`, an https `apply_url` (when given), an https
`source_url` on every requirement, and a unique id. Anything else is skipped
and logged by file name — never repaired or guessed at.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import ValidationError

from app.graph.state import Program

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CURATED_DIR = DATA_DIR  # programs/*.json and regions.json
FIXTURE_DIR = DATA_DIR / "fixtures"

# How specifically a program's service area matches the user's ZIP.
# Lower sorts first: local programs before county-wide before statewide.
MATCH_ZIP, MATCH_COUNTY, MATCH_STATE = 0, 1, 2


class RecordError(ValueError):
    """A program record breaks a quality rule. The message names the rule."""


def _norm_county(name: str | None) -> str:
    """'Hampshire County' and 'hampshire' name the same county."""
    name = (name or "").strip().lower()
    return name[: -len(" county")] if name.endswith(" county") else name


def check_record(program: Program) -> None:
    """Raise RecordError if a parsed record must not be served."""
    urls = [("info_url", program.info_url)]
    if program.apply_url is not None:
        urls.append(("apply_url", program.apply_url))
    urls += [(f"requirement {r.id} source_url", r.source_url) for r in program.requirements]
    for label, url in urls:
        if not url.startswith("https://"):
            raise RecordError(f"{label} must be an https URL")
    if not program.categories:
        raise RecordError("no categories")
    area = program.service_area
    if not (area.statewide or area.counties or area.zips):
        raise RecordError("empty service area")
    if area.statewide and not area.state:
        raise RecordError("statewide service area needs a state")


def load_programs(directory: Path) -> tuple[list[Program], list[tuple[str, str]]]:
    """Load every valid record in `directory`. Returns (programs, [(file, reason)])."""
    programs: list[Program] = []
    rejected: list[tuple[str, str]] = []
    seen: set[str] = set()
    for path in sorted(directory.glob("*.json")):
        try:
            program = Program.model_validate_json(path.read_text())
            check_record(program)
            if program.id in seen:
                raise RecordError(f"duplicate id {program.id}")
        except (ValidationError, ValueError) as exc:
            reason = exc.__class__.__name__ if isinstance(exc, ValidationError) else str(exc)
            rejected.append((path.name, reason))
            continue
        seen.add(program.id)
        programs.append(program)
    return programs, rejected


class ProgramsRepository:
    """Programs from `<root>/programs/*.json`, regions from `<root>/regions.json`.

    `regions.json` maps each supported ZIP code to `{"city", "county", "state"}`.
    """

    def __init__(self, root: Path, *, is_fixture: bool = False) -> None:
        self.is_fixture = is_fixture
        self._regions: dict[str, dict[str, str]] = {}

        regions_file = root / "regions.json"
        if regions_file.exists():
            self._regions = json.loads(regions_file.read_text())["supported_zips"]

        self._programs, rejected = load_programs(root / "programs")
        for name, reason in rejected:
            # File name and rule only; record contents are not logged.
            logger.error("skipping program record %s: %s", name, reason)

    def is_supported(self, zip_code: str) -> bool:
        return zip_code in self._regions

    def region(self, zip_code: str) -> dict[str, str] | None:
        return self._regions.get(zip_code)

    def get(self, program_id: str) -> Program | None:
        return next((p for p in self._programs if p.id == program_id), None)

    def all(self) -> list[Program]:
        return list(self._programs)

    def _match(self, program: Program, zip_code: str, region: dict[str, str]) -> int | None:
        area = program.service_area
        if zip_code in area.zips:
            return MATCH_ZIP
        county = _norm_county(region.get("county"))
        if county and county in {_norm_county(c) for c in area.counties}:
            # A county list is scoped by the program's state when it names one.
            if area.state is None or area.state == region.get("state"):
                return MATCH_COUNTY
        if area.statewide and area.state == region.get("state"):
            return MATCH_STATE
        return None

    def list(self, zip_code: str, categories: list[str]) -> list[Program]:
        """Programs serving this ZIP in any of the categories.

        Order: programs for the earliest-listed need first (the user's first
        choice is their most pressing), then local before county-wide before
        statewide, then by name. Each program appears once.
        """
        region = self._regions.get(zip_code)
        if region is None:
            return []
        rank = {category: i for i, category in enumerate(dict.fromkeys(categories))}
        scored = []
        for program in self._programs:
            need_rank = min((rank[c] for c in program.categories if c in rank), default=None)
            if need_rank is None:
                continue
            match = self._match(program, zip_code, region)
            if match is None:
                continue
            scored.append(((need_rank, match, program.name.lower()), program))
        return [program for _, program in sorted(scored, key=lambda item: item[0])]


def repository_from_env(source: str | None) -> ProgramsRepository:
    """`fixtures` loads the fictional development set; anything else the curated set."""
    if (source or "").lower() == "fixtures":
        return ProgramsRepository(FIXTURE_DIR, is_fixture=True)
    return ProgramsRepository(CURATED_DIR)
