"""Browser hosts. Same agent code drives a cloud browser or a local one.

  SteelProvider  Steel cloud session over CDP, with an embeddable live view that
                 can be switched to interactive for takeover (the demo path).
  LocalProvider  Chrome on this machine (development). No embeddable view: the
                 run panel falls back to the latest screenshot, and a headed
                 window can be used for takeover.
  FakeProvider   tests; no browser, no network.

Steel is called through its REST API with httpx rather than its SDK. The API key
and the live-view URL are credentials: never logged, and the live view is
returned only to the session that owns the run. Every exit path releases the
cloud session (`close` is idempotent and never raises).
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Protocol
from urllib.parse import urlencode

from app.execution.computer import SETTLE_SECONDS, Computer, PlaywrightComputer, install_allowlist
from app.execution.config import SCREEN_HEIGHT, SCREEN_WIDTH, SESSION_SECONDS, AgentSettings, RunTarget
from app.services.log_safety import describe_exception

logger = logging.getLogger(__name__)

STEEL_API = "https://api.steel.dev/v1"
STEEL_CONNECT = "wss://connect.steel.dev"
OPEN_TIMEOUT_MS = 30_000


class ProviderError(Exception):
    """The browser could not be started. The message is safe to show."""


class BrowserSession(Protocol):
    computer: Computer

    def live_view_url(self, interactive: bool) -> str | None: ...

    async def close(self) -> None: ...


class BrowserProvider(Protocol):
    name: str

    async def open(self, target: RunTarget) -> BrowserSession: ...


class _PlaywrightSession:
    """Shared teardown for sessions backed by Playwright."""

    def __init__(self) -> None:
        self.computer: Computer
        self._playwright: Any = None
        self._browser: Any = None
        self._closed = False

    def live_view_url(self, interactive: bool) -> str | None:
        return None

    async def _release(self) -> None:  # provider-specific cleanup
        return None

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        for step in (self._close_browser, self._release, self._stop_playwright):
            try:
                await step()
            except Exception as exc:
                logger.warning("browser cleanup step failed: %s", describe_exception(exc))

    async def _close_browser(self) -> None:
        if self._browser is not None:
            await self._browser.close()

    async def _stop_playwright(self) -> None:
        if self._playwright is not None:
            await self._playwright.stop()

    async def _start_page(self, context: Any, target: RunTarget, settle_seconds: float = SETTLE_SECONDS) -> None:
        await install_allowlist(context, target.allowed_hosts, strict=target.mode == "practice")
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(target.start_url, wait_until="domcontentloaded", timeout=OPEN_TIMEOUT_MS)
        self.page = page  # for spikes and tests; the agent uses self.computer
        self.computer = PlaywrightComputer(page, settle_seconds=settle_seconds)


class LocalSession(_PlaywrightSession):
    pass


class LocalProvider:
    name = "local"

    def __init__(self, channel: str | None, headless: bool, *, settle_seconds: float = SETTLE_SECONDS) -> None:
        self._channel, self._headless, self._settle = channel, headless, settle_seconds
        self.sessions: list[LocalSession] = []

    async def open(self, target: RunTarget) -> BrowserSession:
        from playwright.async_api import async_playwright  # imported only when a run starts

        session = LocalSession()
        try:
            session._playwright = await async_playwright().start()
            session._browser = await session._playwright.chromium.launch(
                channel=self._channel, headless=self._headless
            )
            context = await session._browser.new_context(
                viewport={"width": SCREEN_WIDTH, "height": SCREEN_HEIGHT}, accept_downloads=False
            )
            await session._start_page(context, target, self._settle)
            self.sessions.append(session)
            return session
        except Exception as exc:
            await session.close()
            logger.error("local browser failed to start: %s", describe_exception(exc))
            raise ProviderError("We couldn't open the browser. Please try again.") from exc


class SteelSession(_PlaywrightSession):
    def __init__(self, api_key: str) -> None:
        super().__init__()
        self._api_key = api_key
        self.session_id: str | None = None
        self.debug_url: str | None = None

    def live_view_url(self, interactive: bool) -> str | None:
        if not self.debug_url:
            return None
        query = {"interactive": "true", "showControls": "true"} if interactive else {"interactive": "false", "showControls": "false"}
        separator = "&" if "?" in self.debug_url else "?"
        return f"{self.debug_url}{separator}{urlencode(query)}"

    async def _release(self) -> None:
        if not self.session_id:
            return
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{STEEL_API}/sessions/{self.session_id}/release", headers={"steel-api-key": self._api_key}
            )
            response.raise_for_status()
        self.session_id = None


class SteelProvider:
    name = "steel"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ProviderError("The cloud browser isn't configured.")
        self._api_key = api_key

    async def open(self, target: RunTarget) -> BrowserSession:
        import httpx
        from playwright.async_api import async_playwright

        session = SteelSession(self._api_key)
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{STEEL_API}/sessions",
                    headers={"steel-api-key": self._api_key},
                    json={
                        "timeout": SESSION_SECONDS * 1000,
                        "dimensions": {"width": SCREEN_WIDTH, "height": SCREEN_HEIGHT},
                        "solveCaptcha": False,  # never solve a CAPTCHA for the person
                        "blockAds": True,
                    },
                )
                response.raise_for_status()
                body = response.json()
            session.session_id = body["id"]
            session.debug_url = body.get("debugUrl") or body.get("debug_url")
            session._playwright = await async_playwright().start()
            endpoint = f"{STEEL_CONNECT}?{urlencode({'apiKey': self._api_key, 'sessionId': session.session_id})}"
            session._browser = await session._playwright.chromium.connect_over_cdp(endpoint, timeout=OPEN_TIMEOUT_MS)
            context = session._browser.contexts[0] if session._browser.contexts else await session._browser.new_context()
            await session._start_page(context, target)
            return session
        except Exception as exc:
            await session.close()
            logger.error("cloud browser failed to start: %s", describe_exception(exc))
            raise ProviderError("We couldn't open the cloud browser. Please try again in a moment.") from exc


class FakeSession:
    def __init__(self, computer: Computer, live_view: str | None) -> None:
        self.computer = computer
        self._live_view = live_view
        self.closed = False

    def live_view_url(self, interactive: bool) -> str | None:
        if self._live_view is None:
            return None
        return f"{self._live_view}?interactive={'true' if interactive else 'false'}"

    async def close(self) -> None:
        self.closed = True


class FakeProvider:
    """Tests: hands out a fake computer and records every session it opened."""

    name = "fake"

    def __init__(self, make_computer: Callable[[RunTarget], Computer], live_view: str | None = "https://live.test/s",
                 fail: bool = False) -> None:
        self._make, self._live_view, self._fail = make_computer, live_view, fail
        self.sessions: list[FakeSession] = []

    async def open(self, target: RunTarget) -> BrowserSession:
        if self._fail:
            raise ProviderError("We couldn't open the browser. Please try again.")
        session = FakeSession(self._make(target), self._live_view)
        self.sessions.append(session)
        return session


def make_provider(settings: AgentSettings) -> BrowserProvider | None:
    if settings.provider == "steel":
        return SteelProvider(settings.steel_api_key)
    if settings.provider == "local":
        return LocalProvider(settings.local_channel, settings.local_headless)
    return None
