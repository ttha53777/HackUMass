"""The computer: turns Gemini Computer Use actions into Playwright calls.

`Computer` is the protocol the agent loop uses; `PlaywrightComputer` drives a real
page (local Chrome or a cloud browser over CDP); tests use a fake.

Coordinates: Gemini returns x and y on a 1000 x 1000 grid, scaled here to the
viewport (Google's own sample does the same; the docs also mention pixels, so
spike S1 checks one click at a known position, see scripts/spikes/s1_gemini_cu.py).

Element descriptions read here go only to the gate, never to the model or a log.
A text field's current value is never read.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlsplit

from app.execution.config import SCREEN_HEIGHT, SCREEN_WIDTH
from app.execution.gate import CAPTCHA_HOSTS, Action, Element, PageFacts, host_allowed

logger = logging.getLogger(__name__)

GRID = 1000
SETTLE_SECONDS = 0.6
MAX_WAIT_SECONDS = 5
PAGE_TEXT_LIMIT = 6000

_KEYS = {
    "tab": "Tab", "shift+tab": "Shift+Tab", "arrowdown": "ArrowDown", "arrowup": "ArrowUp",
    "arrowleft": "ArrowLeft", "arrowright": "ArrowRight", "escape": "Escape",
    "backspace": "Backspace", "delete": "Delete", "home": "Home", "end": "End",
    "pagedown": "PageDown", "pageup": "PageUp", "space": "Space", " ": "Space", "spacebar": "Space",
}


@dataclass(frozen=True)
class Observation:
    url: str
    screenshot: bytes  # PNG, held in memory only


class Computer(Protocol):
    async def observe(self) -> Observation: ...

    async def facts(self, action: Action) -> PageFacts: ...

    async def execute(self, action: Action, value: str | None = None) -> dict[str, Any]: ...

    async def page_text(self) -> str: ...


# Describes the element at a point (resolved through a <label> to its control, or
# up to the nearest interactive ancestor) or the focused element. Never reads the
# value of a text field.
_DESCRIBE = r"""
(pt) => {
  const S = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 240);
  let el = pt ? document.elementFromPoint(pt.x, pt.y) : document.activeElement;
  while (pt && el && el.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(pt.x, pt.y);
    if (!inner || inner === el) break;
    el = inner;
  }
  if (!el || el === document.body || el === document.documentElement) return null;
  if (pt) {
    const label = el.closest("label");
    if (label && label.control) el = label.control;
    else {
      const c = el.closest("button,a,summary,select,textarea,input,canvas,iframe,[role=button],[role=link]," +
        "[role=checkbox],[role=radio],[role=switch],[role=textbox],[contenteditable=''],[contenteditable=true]");
      if (c) el = c;
    }
  }
  const tag = el.tagName.toLowerCase();
  const type = tag === "input" ? (el.getAttribute("type") || "text").toLowerCase() : "";
  const buttonLike = ["submit", "button", "image", "reset"].includes(type);
  const labels = el.labels ? Array.from(el.labels).map((l) => l.innerText).join(" ") : "";
  const legend = el.closest("fieldset")?.querySelector("legend")?.innerText || "";
  const own = tag === "input" || tag === "select" || tag === "textarea" ? "" : el.innerText;
  const text = [own, buttonLike ? el.value : "", el.getAttribute("aria-label"), labels, legend,
    el.getAttribute("placeholder"), el.getAttribute("title"), el.getAttribute("alt")].map(S).filter(Boolean).join(" | ");
  const name = [el.getAttribute("name"), el.id, el.getAttribute("autocomplete")].map(S).filter(Boolean).join(" ");
  const editable = !!(el.isContentEditable || ((tag === "input" || tag === "textarea" || tag === "select") &&
    !el.disabled && !el.readOnly));
  let frame_host = "";
  if (tag === "iframe") { try { const u = new URL(el.src, location.href); frame_host = u.host + u.pathname; } catch (e) {} }
  return { tag, type, role: (el.getAttribute("role") || "").toLowerCase(), text: S(text), name, editable, frame_host };
}
"""

# Selects the option of a focused <select> whose label (or value) matches.
_SELECT = r"""
(wanted) => {
  const el = document.activeElement;
  if (!el || el.tagName !== "SELECT") return false;
  const norm = (s) => (s || "").trim().toLowerCase();
  const opt = Array.from(el.options).find((o) => norm(o.label) === norm(wanted) || norm(o.value) === norm(wanted));
  if (!opt) return false;
  el.value = opt.value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
"""


def _element(raw: dict[str, Any] | None) -> Element | None:
    if not raw:
        return None
    return Element(**{k: raw.get(k) or ("" if k != "editable" else False) for k in
                      ("tag", "type", "role", "text", "name", "editable", "frame_host")})


def _clamp(value: float, upper: int) -> int:
    return max(0, min(upper - 1, int(value)))


class PlaywrightComputer:
    def __init__(self, page: Any, width: int = SCREEN_WIDTH, height: int = SCREEN_HEIGHT, grid: int = GRID,
                 settle_seconds: float = SETTLE_SECONDS) -> None:
        self._page = page
        self._width, self._height, self._grid = width, height, grid
        self._settle_seconds = settle_seconds

    def to_pixels(self, x: Any, y: Any) -> tuple[int, int]:
        return (
            _clamp(float(x) / self._grid * self._width, self._width),
            _clamp(float(y) / self._grid * self._height, self._height),
        )

    def _point(self, args: dict[str, Any]) -> tuple[int, int] | None:
        if "x" in args and "y" in args:
            return self.to_pixels(args["x"], args["y"])
        return None

    async def observe(self) -> Observation:
        return Observation(url=self._page.url, screenshot=await self._page.screenshot(type="png"))

    async def facts(self, action: Action) -> PageFacts:
        page = self._page
        point = self._point(action.args)
        target = await page.evaluate(_DESCRIBE, {"x": point[0], "y": point[1]}) if point else None
        focused = await page.evaluate(_DESCRIBE, None)
        frames = tuple(
            f"{urlsplit(frame.url).hostname or ''}{urlsplit(frame.url).path}"
            for frame in page.frames
            if frame.url and not frame.url.startswith("about:")
        )
        return PageFacts(url=page.url, target=_element(target), focused=_element(focused), frame_hosts=frames)

    async def execute(self, action: Action, value: str | None = None) -> dict[str, Any]:
        """Run one action already allowed by the gate. Returns {} or {"error": ...}."""
        page, name, args = self._page, action.name, action.args
        point = self._point(args)
        try:
            if name in ("click", "double_click", "triple_click"):
                count = {"click": 1, "double_click": 2, "triple_click": 3}[name]
                await page.mouse.click(*point, click_count=count)
            elif name == "move":
                await page.mouse.move(*point)
            elif name == "type":
                if value is None:
                    return {"error": "no value"}
                if not await page.evaluate(_SELECT, value):
                    # Replace the field's content. Enter is never pressed: it could send the form.
                    await page.keyboard.press("ControlOrMeta+A")
                    await page.keyboard.press("Backspace")
                    await page.keyboard.insert_text(value)
            elif name == "scroll":
                x, y = point or (self._width // 2, self._height // 2)
                amount = int(args.get("magnitude_in_pixels") or 300)
                dx, dy = {"up": (0, -amount), "down": (0, amount), "left": (-amount, 0), "right": (amount, 0)}.get(
                    str(args.get("direction", "down")).lower(), (0, amount)
                )
                await page.mouse.move(x, y)
                await page.mouse.wheel(dx, dy)
            elif name == "navigate":
                await page.goto(str(args["url"]), wait_until="domcontentloaded", timeout=20_000)
            elif name == "go_back":
                await page.go_back(wait_until="domcontentloaded", timeout=10_000)
            elif name == "go_forward":
                await page.go_forward(wait_until="domcontentloaded", timeout=10_000)
            elif name == "wait":
                await asyncio.sleep(min(float(args.get("seconds") or 1), MAX_WAIT_SECONDS))
            elif name == "press_key":
                await page.keyboard.press(_KEYS[str(args.get("key", "")).strip().lower()])
            elif name == "hotkey":
                await page.keyboard.press(_KEYS["+".join(str(k).strip().lower() for k in args.get("keys") or [])])
            elif name == "take_screenshot":
                pass
            else:
                return {"error": f"unsupported action {name}"}
        except Exception as exc:  # a page error is reported to the model, never raised
            logger.info("browser action %s failed (%s)", name, exc.__class__.__name__)
            return {"error": f"The action did not work ({exc.__class__.__name__})."}
        await self._settle()
        return {}

    async def _settle(self) -> None:
        try:
            await self._page.wait_for_load_state("domcontentloaded", timeout=MAX_WAIT_SECONDS * 1000)
        except Exception:
            pass
        await asyncio.sleep(self._settle_seconds)

    async def page_text(self) -> str:
        try:
            return (await self._page.inner_text("body"))[:PAGE_TEXT_LIMIT]
        except Exception:
            return ""


async def install_allowlist(context: Any, allowed_hosts: frozenset[str], *, strict: bool) -> None:
    """Abort requests that leave the provider's site (plan section 4).

    Navigations (top page and frames) to another host are always aborted, except
    CAPTCHA frames, which must load so the gate can see them and hand off. With
    `strict` (the practice form) every other request off the allowlist is aborted
    too; real sites keep their CDN assets.
    """

    async def handle(route: Any) -> None:
        request = route.request
        url = request.url
        if url.startswith(("data:", "blob:", "about:")) or host_allowed(url, allowed_hosts):
            await route.continue_()
            return
        parts = urlsplit(url)
        where = f"{parts.hostname or ''}{parts.path}"
        if any(c in where for c in CAPTCHA_HOSTS):
            await route.continue_()
        elif request.is_navigation_request() or strict:
            await route.abort("blockedbyclient")
        else:
            await route.continue_()

    await context.route("**/*", handle)
