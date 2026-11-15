"""Settings for the Filler. Importing this never loads Playwright or the Gemini SDK.

    FILLER_ENABLED   1 to mount the Filler routes (off by default)
    FILLER_PROVIDER  local (Chrome on this machine) or steel (cloud browser)
    FILLER_MODEL     Gemini Computer Use model id
    FILLER_READ_MODEL  Gemini model that reads papers (multimodal)
    GEMINI_API_KEY, STEEL_API_KEY, LOCAL_BROWSER_CHANNEL, LOCAL_BROWSER_HEADLESS are shared with v1.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)

PROVIDERS = ("local", "steel")
# v1 measured gemini-3.5-flash at 5-135 s per screenshot turn on 2026-11-14; it is
# the only model that finished a run, so it is the default here too.
DEFAULT_MODEL = "gemini-3.5-flash"
# Reads the three sample papers in 1.4-2.2 s with every key right (2026-11-15), and has its
# own free-tier quota, separate from the computer-use model.
DEFAULT_READ_MODEL = "gemini-3.5-flash-lite"

VIEWPORT_WIDTH = 1280
VIEWPORT_HEIGHT = 800
GRID = 1000  # Gemini returns coordinates on a 1000 x 1000 grid (v1 spike S1)
SESSION_SECONDS = 15 * 60  # Steel's free tier caps a session at 15 minutes

# Live stream.
SCREENCAST_QUALITY = 60  # JPEG
TYPE_DELAY_MS = 35  # per character, so typing is visible to the person watching
# mouse.move steps. Each step is a round trip to the browser (about 100-200 ms to Steel), and
# the viewer animates the cursor dot itself, so one step is enough.
CURSOR_STEPS = 1


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes")


@dataclass(frozen=True)
class FillerSettings:
    enabled: bool
    provider: str
    model: str
    read_model: str
    gemini_api_key: str
    steel_api_key: str
    local_channel: str | None
    local_headless: bool

    @classmethod
    def from_env(cls) -> FillerSettings:
        env = os.environ.get
        provider = env("FILLER_PROVIDER", "local").strip().lower() or "local"
        if provider not in PROVIDERS:
            logger.warning("unknown FILLER_PROVIDER; using local")
            provider = "local"
        return cls(
            enabled=_flag("FILLER_ENABLED"),
            provider=provider,
            model=env("FILLER_MODEL", "").strip() or DEFAULT_MODEL,
            read_model=env("FILLER_READ_MODEL", "").strip() or DEFAULT_READ_MODEL,
            gemini_api_key=env("GEMINI_API_KEY", "").strip(),
            steel_api_key=env("STEEL_API_KEY", "").strip(),
            local_channel=env("LOCAL_BROWSER_CHANNEL", "chrome").strip() or None,
            local_headless=_flag("LOCAL_BROWSER_HEADLESS"),
        )
