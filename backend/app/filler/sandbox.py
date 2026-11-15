"""The cloud computer: one isolated browser per run, behind one protocol.

    SteelBrowser  Steel cloud session, attached over CDP (the demo path)
    LocalBrowser  Chrome on this machine (development)

Both hand back a `BrowserHandle` holding a Playwright page. The live view does not
come from the provider's debug iframe: `stream.LiveStream` screencasts the page over
CDP, so every provider looks the same to the viewer and no unauthenticated provider
URL ever reaches the browser. Steel is called over REST with httpx (no SDK). The API
key is never logged. `close` is idempotent, never raises, and always releases the
cloud session.
"""

from __future__ import annotations

import logging
from typing import Any, Protocol
from urllib.parse import urlencode

from app.filler.config import SESSION_SECONDS, VIEWPORT_HEIGHT, VIEWPORT_WIDTH, FillerSettings
from app.services.log_safety import describe_exception

logger = logging.getLogger(__name__)

STEEL_API = "https://api.steel.dev/v1"
STEEL_CONNECT = "wss://connect.steel.dev"
CONNECT_TIMEOUT_MS = 30_000

STEEL_STATUS_MESSAGES = {
    401: "The cloud browser isn't set up correctly on this server.",
    403: "The cloud browser isn't set up correctly on this server.",
    402: "The cloud browser has run out of credit.",
    429: "The cloud browser is busy. Try again in a few minutes.",
}
GENERIC_MESSAGE = "We couldn't open the browser. Please try again in a moment."


class SandboxError(Exception):
    """The browser could not be opened. The message is safe to show."""


class BrowserHandle:
    """A started browser with one page. Subclasses add provider cleanup."""

    def __init__(self) -> None:
        self.page: Any = None
        self._playwright: Any = None
        self._browser: Any = None
        self._closed = False

    async def _release(self) -> None:
        return None

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        for step in (self._close_browser, self._release, self._stop_playwright):
            try:
                await step()
            except Exception as exc:
                logger.warning("filler browser cleanup step failed: %s", describe_exception(exc))

    async def _close_browser(self) -> None:
        if self._browser is not None:
            await self._browser.close()

    async def _stop_playwright(self) -> None:
        if self._playwright is not None:
            await self._playwright.stop()


class CloudBrowser(Protocol):
    name: str

    async def open(self) -> BrowserHandle: ...


class LocalBrowser:
    name = "local"

    def __init__(self, channel: str | None = "chrome", headless: bool = False) -> None:
        self._channel, self._headless = channel, headless

    async def open(self) -> BrowserHandle:
        from playwright.async_api import async_playwright  # only when a run starts

        handle = BrowserHandle()
        try:
            handle._playwright = await async_playwright().start()
            handle._browser = await handle._playwright.chromium.launch(channel=self._channel, headless=self._headless)
            context = await handle._browser.new_context(
                viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT}, accept_downloads=False
            )
            handle.page = await context.new_page()
            return handle
        except Exception as exc:
            await handle.close()
            logger.error("filler local browser failed to start: %s", describe_exception(exc))
            raise SandboxError(GENERIC_MESSAGE) from exc


class SteelHandle(BrowserHandle):
    def __init__(self, api_key: str) -> None:
        super().__init__()
        self._api_key = api_key
        self.session_id: str | None = None

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


class SteelBrowser:
    name = "steel"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise SandboxError("The cloud browser isn't configured.")
        self._api_key = api_key

    async def open(self) -> BrowserHandle:
        import httpx
        from playwright.async_api import async_playwright

        handle = SteelHandle(self._api_key)
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{STEEL_API}/sessions",
                    headers={"steel-api-key": self._api_key},
                    json={
                        "timeout": SESSION_SECONDS * 1000,
                        "dimensions": {"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
                        "solveCaptcha": False,  # never solve a CAPTCHA for the person
                        "blockAds": True,
                    },
                )
                response.raise_for_status()
                handle.session_id = response.json()["id"]
            handle._playwright = await async_playwright().start()
            endpoint = f"{STEEL_CONNECT}?{urlencode({'apiKey': self._api_key, 'sessionId': handle.session_id})}"
            handle._browser = await handle._playwright.chromium.connect_over_cdp(endpoint, timeout=CONNECT_TIMEOUT_MS)
            context = handle._browser.contexts[0] if handle._browser.contexts else await handle._browser.new_context()
            handle.page = context.pages[0] if context.pages else await context.new_page()
            await handle.page.set_viewport_size({"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT})
            return handle
        except Exception as exc:
            await handle.close()
            logger.error("filler cloud browser failed to start: %s", describe_exception(exc))
            status = getattr(getattr(exc, "response", None), "status_code", None)
            raise SandboxError(STEEL_STATUS_MESSAGES.get(status, GENERIC_MESSAGE)) from exc


def make_browser(settings: FillerSettings) -> CloudBrowser:
    if settings.provider == "steel":
        return SteelBrowser(settings.steel_api_key)
    return LocalBrowser(settings.local_channel, settings.local_headless)
