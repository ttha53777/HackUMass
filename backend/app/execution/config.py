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

from app.execution.models import AutomationRecord, FormManifest

logger = logging.getLogger(__name__)

AUTOMATION_DIR = Path(__file__).resolve().parents[1] / "data" / "automation"
FORMS_DIR = AUTOMATION_DIR / "forms"  # field maps; the pages are app/execution/forms/<form_id>.html
FORM_PAGES_DIR = Path(__file__).resolve().parent / "forms"

PROVIDERS = ("steel", "local", "off")
# How a practice form with a manifest is filled (docs/document-to-form-demo-plan.md, 5.1):
#   gemini_map    one Gemini call per step maps the page's labels to fill-sheet keys
#                 (never values); falls back to the manifest after 8 s or an error.
#                 The default whenever GEMINI_API_KEY is set.
#   manifest      the curated field map; no model, works offline (the default with no key)
#   computer_use  the screenshot loop, as for forms without a manifest
FORM_ENGINES = ("manifest", "gemini_map", "computer_use")
DEFAULT_FORM_ENGINE = "manifest"  # with no key; with a key the default is gemini_map
DEFAULT_TYPE_DELAY_MS = 30  # visible typing for the demo; 0 types instantly

# Model id for Gemini Computer Use, overridable with BROWSER_AGENT_MODEL. Measured
# 2026-11-14 on the practice form: gemini-3.5-flash answered a screenshot turn in
# 5-135 s; gemini-4-hydrogen (Google's sample id, used for spike S1) took 100 s to
# over 240 s and could not finish a run.
DEFAULT_AGENT_MODEL = "gemini-3.5-flash"
DEFAULT_PRACTICE_BASE_URL = "http://127.0.0.1:8000"

# Run limits (plan section 3).
MAX_STEPS = 80  # a field costs two (click, type); AGENT_SECONDS still bounds the run
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
    form_engine: str = DEFAULT_FORM_ENGINE
    type_delay_ms: int = 0
    local_debug_port: int | None = None  # rehearsal only (LOCAL_BROWSER_DEBUG_PORT)

    @property
    def needs_gemini(self) -> bool:
        """Forms without a manifest always use Gemini Computer Use; so does that engine."""
        return self.form_engine == "computer_use"

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
            form_engine=_form_engine(env("FORM_AGENT_ENGINE", ""), bool(env("GEMINI_API_KEY", "").strip())),
            type_delay_ms=_int(env("FORM_TYPE_DELAY_MS", ""), DEFAULT_TYPE_DELAY_MS, 0, 200),
            local_debug_port=_int(env("LOCAL_BROWSER_DEBUG_PORT", ""), 0, 0, 65535) or None,
        )


def engine_for(form_id: str | None, settings: AgentSettings) -> str:
    """Which engine fills this form: a form with a field map uses the chosen fast engine
    (or computer_use when that is chosen and a key exists); any other form, computer_use."""
    if form_id and (settings.form_engine != "computer_use" or not settings.gemini_api_key):
        return settings.form_engine
    return "computer_use"


def _form_engine(raw: str, has_key: bool) -> str:
    name = raw.strip().lower() or ("gemini_map" if has_key else DEFAULT_FORM_ENGINE)
    if name not in FORM_ENGINES:
        logger.warning("unknown FORM_AGENT_ENGINE; using %s", DEFAULT_FORM_ENGINE)
        return DEFAULT_FORM_ENGINE
    if name != "manifest" and not has_key:
        logger.warning("FORM_AGENT_ENGINE=%s needs GEMINI_API_KEY; using manifest", name)
        return "manifest"
    return name


def _int(raw: str, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(raw)))
    except ValueError:
        return default


def host_of(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def practice_url(base_url: str, form_id: str | None = None) -> str:
    return f"{base_url}/practice/{form_id}/" if form_id else f"{base_url}/practice/"


@lru_cache(maxsize=32)
def form_manifest(form_id: str) -> FormManifest:
    """A practice form's curated field map. Raises for an unknown form."""
    from app.execution.models import FORM_ID

    if not FORM_ID.match(form_id):
        raise ValueError("bad form_id")
    path = FORMS_DIR / f"{form_id}.json"
    if not path.is_file() or not (FORM_PAGES_DIR / f"{form_id}.html").is_file():
        raise ValueError(f"no practice form {form_id}")
    manifest = FormManifest.model_validate(json.loads(path.read_text()))
    if manifest.form_id != form_id:
        raise ValueError("form_id does not match its file name")
    return manifest


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
    form_id: str | None = None  # a practice form with a manifest


def resolve_target(record: AutomationRecord, settings: AgentSettings) -> RunTarget:
    if record.mode == "practice":
        start = practice_url(settings.practice_base_url, record.form_id)
        return RunTarget(record.program_id, record.mode, start, frozenset({host_of(start)}), record.form_id)
    assert record.start_url is not None  # enforced by AutomationRecord
    return RunTarget(
        record.program_id,
        record.mode,
        record.start_url,
        frozenset(h.lower() for h in record.allowed_hosts),
    )
