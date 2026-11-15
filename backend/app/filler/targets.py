"""Which programs the Filler can fill, and how (`app/data/filler/targets/<program_id>.json`).

Curated by hand like program records. The model never supplies a URL: a run's start URL
and the hosts it may visit come only from here.

  practice            our own practice form, labelled as practice; a submit by the
                      person is harmless
  stop_before_submit  a real provider form: fill-and-stop. The first Submit or
                      attestation ends the run read-only, and nothing is ever sent

A record with "enabled": false is validated on load but never offered. Real-site records
ship disabled until the team agrees to fill-and-stop on a real site and the form is
checked from the cloud browser (spec: open questions).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, model_validator

TARGETS_DIR = Path(__file__).resolve().parents[1] / "data" / "filler" / "targets"
Mode = Literal["practice", "stop_before_submit"]


class FillTarget(BaseModel):
    program_id: str
    mode: Mode
    start_url: str | None = None
    allowed_hosts: list[str] = Field(default_factory=list)
    form_map: str | None = None  # app/data/filler/maps/<form_map>.json
    enabled: bool = True
    note: str = ""

    @model_validator(mode="after")
    def _real_sites_are_pinned(self) -> FillTarget:
        if self.mode == "stop_before_submit":
            if not self.start_url or urlsplit(self.start_url).scheme != "https":
                raise ValueError(f"{self.program_id}: a real site needs an https start_url")
            host = (urlsplit(self.start_url).hostname or "").lower()
            if host not in [h.lower() for h in self.allowed_hosts]:
                raise ValueError(f"{self.program_id}: the start_url host must be in allowed_hosts")
        elif self.start_url:
            raise ValueError(f"{self.program_id}: a practice record has no start_url")
        return self


@lru_cache(maxsize=4)
def _load(directory: str) -> dict[str, FillTarget]:
    targets: dict[str, FillTarget] = {}
    for path in sorted(Path(directory).glob("*.json")):
        target = FillTarget.model_validate(json.loads(path.read_text()))
        if target.program_id in targets:
            raise ValueError(f"duplicate filler target {target.program_id}")
        if target.program_id != path.stem:
            raise ValueError(f"{path.name}: program_id must match the file name")
        targets[target.program_id] = target
    return targets


def all_targets(directory: Path = TARGETS_DIR) -> dict[str, FillTarget]:
    """Every record, enabled or not (all validated)."""
    return _load(str(directory))


def enabled_targets(directory: Path = TARGETS_DIR) -> dict[str, FillTarget]:
    return {pid: t for pid, t in all_targets(directory).items() if t.enabled}
