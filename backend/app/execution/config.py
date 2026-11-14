"""Settings and curated automation records for the browser execution agent.

Importing this module never loads Playwright, the Gemini SDK or a provider SDK:
with `BROWSER_PROVIDER=off` (the default) the feature is hidden and nothing new
is imported, the same way `LLM_MODE=off` works.

Automation records (`app/data/automation/*.json`) are curated by hand like
program records. The model never supplies a URL: the start URL and the hosts a
run may visit come only from these files (or, for the practice form, from
`PRACTICE_BASE_URL`, which the server operator sets).
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from app.execution.models import AutomationRecord

logger = logging.getLogger(__name__)

AUTOMATION_DIR = Path(__file__).resolve().parents[1] / "data" / "automation"

PROVIDERS = ("steel", "local", "off")

# Model id for Gemini Computer Use. Google's own samples use this id; keep it
# overridable because the docs list several (docs/browser-agent-plan.md, section 6).
DEFAULT_AGENT_MODEL = "gemini-4-hydrogen"
DEFAULT_PRACTICE_BASE_URL = "http://127.0.0.1:8000"

# Run limits (plan section 3).
MAX_STEPS = 40
AGENT_SECONDS = 8 * 60  # model and browser time, pauses excluded
PAUSE_SECONDS = 5 * 60  # longest wait for one answer or one takeover
SESSION_SECONDS = 15 * 60  # Steel's free tier caps a session at 15 minutes
MAX_CONCURRENT_RUNS = 2
SCREEN_WIDTH = 1440
SCREEN_HEIGHT = 900


def browser_provider_name() -> str:
    name = os.environ.get("BROWSER_PROVIDER", "off").strip().lower() or "off"
    if name not in PROVIDERS:
        logger.warning("unknown BROWSER_PROVIDER; the browser agent is off")
        return "off"
    return name


@dataclass(frozen=True)
class AgentSettings:
    provider: str
    gemini_api_key: str
    model: str
    steel_api_key: str
    practice_base_url: str
    local_channel: str | None
    local_headless: bool

    @classmethod
    def from_env(cls) -> AgentSettings:
        env = os.environ.get
        return cls(
            provider=browser_provider_name(),
            gemini_api_key=env("GEMINI_API_KEY", "").strip(),
            model=env("BROWSER_AGENT_MODEL", "").strip() or DEFAULT_AGENT_MODEL,
            steel_api_key=env("STEEL_API_KEY", "").strip(),
            practice_base_url=(env("PRACTICE_BASE_URL", "").strip() or DEFAULT_PRACTICE_BASE_URL).rstrip("/"),
            # "chrome" drives the installed Google Chrome; empty uses Playwright's
            # own Chromium (needs `playwright install chromium`).
            local_channel=env("LOCAL_BROWSER_CHANNEL", "chrome").strip() or None,
            local_headless=env("LOCAL_BROWSER_HEADLESS", "").strip().lower() in ("1", "true", "yes"),
        )


def host_of(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def practice_url(base_url: str) -> str:
    return f"{base_url}/practice/"


@lru_cache(maxsize=1)
def _load_records(directory: str, include_disabled: bool) -> dict[str, AutomationRecord]:
    records: dict[str, AutomationRecord] = {}
    seen: set[str] = set()
    for path in sorted(Path(directory).glob("*.json")):
        record = AutomationRecord.model_validate(json.loads(path.read_text()))
        if record.program_id in seen:
            raise ValueError(f"duplicate automation record for {record.program_id}")
        seen.add(record.program_id)
        if record.enabled or include_disabled:
            records[record.program_id] = record
    return records


def automation_records(directory: Path = AUTOMATION_DIR, *, include_disabled: bool = False) -> dict[str, AutomationRecord]:
    """Curated automation records by program id (enabled ones unless asked). All are validated on load."""
    return _load_records(str(directory), include_disabled)


@dataclass(frozen=True)
class RunTarget:
    """Where one run starts and which hosts it may visit, resolved server-side."""

    program_id: str
    mode: str  # "practice" or "stop_before_submit"
    start_url: str
    allowed_hosts: frozenset[str]


def resolve_target(record: AutomationRecord, settings: AgentSettings) -> RunTarget:
    if record.mode == "practice":
        start = practice_url(settings.practice_base_url)
        return RunTarget(record.program_id, record.mode, start, frozenset({host_of(start)}))
    assert record.start_url is not None  # enforced by AutomationRecord
    return RunTarget(
        record.program_id,
        record.mode,
        record.start_url,
        frozenset(h.lower() for h in record.allowed_hosts),
    )
