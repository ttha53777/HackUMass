"""Read-only access to program records.

This is the storage seam for program data: agents call `ProgramsRepository`
and never touch files. Swapping the file-backed source for a database later
only changes this module.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import ValidationError

from app.graph.state import Program

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CURATED_DIR = DATA_DIR  # programs/*.json and regions.json, once curated
FIXTURE_DIR = DATA_DIR / "fixtures"


class ProgramsRepository:
    """Programs from `<root>/programs/*.json`, regions from `<root>/regions.json`.

    `regions.json` maps each supported ZIP code to `{"city", "county", "state"}`.
    """

    def __init__(self, root: Path, *, is_fixture: bool = False) -> None:
        self.is_fixture = is_fixture
        self._programs: list[Program] = []
        self._regions: dict[str, dict[str, str]] = {}

        regions_file = root / "regions.json"
        if regions_file.exists():
            self._regions = json.loads(regions_file.read_text())["supported_zips"]

        for path in sorted((root / "programs").glob("*.json")):
            try:
                self._programs.append(Program.model_validate_json(path.read_text()))
            except (ValidationError, ValueError):
                # A malformed record is skipped, never guessed at.
                logger.error("skipping malformed program record %s", path.name)

    def is_supported(self, zip_code: str) -> bool:
        return zip_code in self._regions

    def get(self, program_id: str) -> Program | None:
        return next((p for p in self._programs if p.id == program_id), None)

    def list(self, zip_code: str, categories: list[str]) -> list[Program]:
        """Programs serving this ZIP in any of the categories, in file order."""
        region = self._regions.get(zip_code)
        if region is None:
            return []
        wanted = set(categories)
        matches = []
        for program in self._programs:
            if not wanted & set(program.categories):
                continue
            area = program.service_area
            serves = (
                zip_code in area.zips
                or region.get("county") in area.counties
                or (area.statewide and area.state == region.get("state"))
            )
            if serves:
                matches.append(program)
        return matches


def repository_from_env(source: str | None) -> ProgramsRepository:
    """`fixtures` loads the fictional development set; anything else the curated set."""
    if (source or "").lower() == "fixtures":
        return ProgramsRepository(FIXTURE_DIR, is_fixture=True)
    return ProgramsRepository(CURATED_DIR)
