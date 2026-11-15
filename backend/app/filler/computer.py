"""Turns Gemini Computer Use actions into Playwright calls, visibly.

Every pointer action is shown to the viewer first: the cursor glides to the point
(`CURSOR_STEPS` intermediate moves, so the screencast catches it) and a `cursor`
event lets the viewer draw it over the frame. Typing goes key by key at
`TYPE_DELAY_MS`, so the person watches each field fill.

Coordinates arrive on a 1000 x 1000 grid and are scaled to the viewport (settled by
v1's spike S1). Enter is never pressed: it could send a form. Navigation only goes to
hosts the run allows. Phase 3 adds the full gate in front of `execute`.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import urlsplit

from app.filler.config import CURSOR_STEPS, GRID, TYPE_DELAY_MS, VIEWPORT_HEIGHT, VIEWPORT_WIDTH
from app.filler.gate import Action, Element, PageFacts
from app.filler.stream import LiveStream

logger = logging.getLogger(__name__)

SETTLE_SECONDS = 0.4
MAX_WAIT_SECONDS = 5

# Keys the agent may press. No Enter, on purpose.
KEYS = {
    "tab": "Tab", "shift+tab": "Shift+Tab", "arrowdown": "ArrowDown", "arrowup": "ArrowUp",
    "arrowleft": "ArrowLeft", "arrowright": "ArrowRight", "escape": "Escape", "backspace": "Backspace",
    "delete": "Delete", "home": "Home", "end": "End", "pagedown": "PageDown", "pageup": "PageUp",
    "space": "Space", " ": "Space", "spacebar": "Space",
}
POINTER_ACTIONS = {"click": 1, "double_click": 2, "triple_click": 3}

# The visible name of the control at a point: its label, aria-label, placeholder or
# button text. Never reads `value` of a text field.
_LABEL_AT = r"""
(pt) => {
  const S = (s) => (s || "").replace(/\s+/g, " ").trim();
  let el = document.elementFromPoint(pt.x, pt.y);
  if (!el) return "";
  const label = el.closest("label");
  if (label && label.control) el = label.control;
  const c = el.closest("button,a,select,textarea,input,[role=button],[role=link],[role=textbox]");
  if (c) el = c;
  const tag = el.tagName.toLowerCase();
  const isField = tag === "input" || tag === "textarea" || tag === "select";
  const labels = el.labels ? Array.from(el.labels).map((l) => l.innerText).join(" ") : "";
  const name = [labels, el.getAttribute("aria-label"), el.getAttribute("placeholder"),
    isField ? "" : el.innerText].map(S).find(Boolean) || "";
  return name.slice(0, 48);
}
"""


# Describes the element at a point (through a <label> to its control, or up to the
# nearest interactive ancestor) or the focused element, for the gate only. Never reads
# the value of a text field.
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
        "[role=checkbox],[role=radio],[role=switch],[role=option],[role=textbox],[contenteditable=''],[contenteditable=true]");
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

# Picks the option of a focused <select> whose label or value matches.
_SELECT = r"""
(wanted) => {
  const el = document.activeElement;
  if (!el || el.tagName !== "SELECT") return "not_select";
  const norm = (s) => (s || "").trim().toLowerCase();
  const opt = Array.from(el.options).find((o) => norm(o.label) === norm(wanted) || norm(o.value) === norm(wanted));
  if (!opt) return "no_match";
  el.value = opt.value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return "selected";
}
"""

# Marks the focused field as filled by the agent, so the review can highlight it.
_MARK = "() => { const el = document.activeElement; if (el && el !== document.body) el.setAttribute('data-filler-filled', '1'); }"
_HIGHLIGHT = r"""
() => {
  if (document.getElementById("filler-highlight")) return document.querySelectorAll("[data-filler-filled]").length;
  const style = document.createElement("style");
  style.id = "filler-highlight";
  style.textContent = "[data-filler-filled]{outline:3px solid #2f6fde !important;outline-offset:2px;background:#eef4ff !important}";
  document.head.appendChild(style);
  return document.querySelectorAll("[data-filler-filled]").length;
}
"""


def _element(raw: dict[str, Any] | None) -> Element | None:
    if not raw:
        return None
    return Element(**{k: raw.get(k) or ("" if k != "editable" else False)
                      for k in ("tag", "type", "role", "text", "name", "editable", "frame_host")})


def to_pixels(x: Any, y: Any, width: int = VIEWPORT_WIDTH, height: int = VIEWPORT_HEIGHT, grid: int = GRID) -> tuple[int, int]:
    def clamp(value: float, upper: int) -> int:
        return max(0, min(upper - 1, int(round(value))))

    return clamp(float(x) / grid * width, width), clamp(float(y) / grid * height, height)


def host_allowed(url: str, allowed_hosts: frozenset[str]) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return bool(host) and any(host == h or host.endswith("." + h) for h in allowed_hosts)


class Computer:
    def __init__(self, page: Any, stream: LiveStream, *, allowed_hosts: frozenset[str] = frozenset(),
                 width: int = VIEWPORT_WIDTH, height: int = VIEWPORT_HEIGHT, type_delay_ms: int = TYPE_DELAY_MS,
                 settle_seconds: float = SETTLE_SECONDS) -> None:
        self.page = page
        self._stream = stream
        self._allowed = allowed_hosts
        self._width, self._height = width, height
        self._type_delay = type_delay_ms
        self._settle_seconds = settle_seconds
        self._cursor = (width // 2, height // 2)

    async def label_at(self, x: Any, y: Any) -> str:
        """A short name for the control at a grid point, for captions. Never a field's value."""
        px, py = to_pixels(x, y, self._width, self._height)
        try:
            return str(await self.page.evaluate(_LABEL_AT, {"x": px, "y": py}) or "")
        except Exception:
            return ""

    async def facts(self, action: Action) -> PageFacts:
        """What the gate needs: the element at the point, the focused element, every frame's host."""
        page = self.page
        args = action.args
        point = to_pixels(args["x"], args["y"], self._width, self._height) if "x" in args and "y" in args else None
        target = await page.evaluate(_DESCRIBE, {"x": point[0], "y": point[1]}) if point else None
        focused = await page.evaluate(_DESCRIBE, None)
        frames = tuple(
            f"{urlsplit(f.url).hostname or ''}{urlsplit(f.url).path}"
            for f in page.frames if f.url and not f.url.startswith("about:")
        )
        return PageFacts(url=page.url, target=_element(target), focused=_element(focused), frame_hosts=frames)

    async def put(self, value: str) -> dict[str, Any]:
        """Fill the focused field in one step (the fast path): pick a dropdown option by label,
        or replace the text. The field is marked for the review highlight."""
        page = self.page
        try:
            picked = await page.evaluate(_SELECT, value)
            if picked == "no_match":
                return {"error": "No option matches."}
            if picked != "selected":
                await page.keyboard.press("ControlOrMeta+A")
                await page.keyboard.press("Backspace")
                await page.keyboard.insert_text(value)
            await page.evaluate(_MARK)
        except Exception as exc:
            logger.info("filler put failed (%s)", exc.__class__.__name__)
            return {"error": "The field did not take the value."}
        return {}

    async def glide_click(self, x: float, y: float) -> None:
        """Move the cursor visibly to a viewport point and click it."""
        px, py = int(x), int(y)
        await self._glide(px, py)
        self._stream.cursor(px, py, "click")
        await self.page.mouse.click(px, py)

    async def highlight_filled(self) -> int:
        """Outline every field the agent filled (the review step). Returns how many."""
        try:
            return int(await self.page.evaluate(_HIGHLIGHT))
        except Exception:
            return 0

    async def screenshot(self) -> bytes:
        return await self.page.screenshot(type="png")

    @property
    def url(self) -> str:
        return self.page.url

    async def _glide(self, x: int, y: int) -> None:
        await self.page.mouse.move(x, y, steps=CURSOR_STEPS)
        self._cursor = (x, y)
        self._stream.cursor(x, y, "move")

    async def execute(self, action: Action, value: str | None = None) -> dict[str, Any]:
        """Run one action. Returns {} or {"error": ...}; page errors are reported, never raised."""
        page, name, args = self.page, action.name, action.args
        try:
            if name in POINTER_ACTIONS:
                x, y = to_pixels(args["x"], args["y"], self._width, self._height)
                await self._glide(x, y)
                self._stream.cursor(x, y, "click")
                await page.mouse.click(x, y, click_count=POINTER_ACTIONS[name])
            elif name == "move":
                await self._glide(*to_pixels(args["x"], args["y"], self._width, self._height))
            elif name == "type":
                if value is None:
                    return {"error": "Nothing to type."}
                picked = await page.evaluate(_SELECT, value)
                if picked == "no_match":
                    return {"error": "No option in this dropdown matches that detail. Leave it, or call request_handoff."}
                if picked != "selected":
                    await page.keyboard.press("ControlOrMeta+A")
                    await page.keyboard.press("Backspace")
                    await page.keyboard.type(value, delay=self._type_delay)
                await page.evaluate(_MARK)
            elif name == "scroll":
                x, y = (to_pixels(args["x"], args["y"], self._width, self._height)
                        if "x" in args and "y" in args else self._cursor)
                amount = int(args.get("magnitude_in_pixels") or 300)
                dx, dy = {"up": (0, -amount), "down": (0, amount), "left": (-amount, 0), "right": (amount, 0)}.get(
                    str(args.get("direction", "down")).lower(), (0, amount))
                await self._glide(x, y)
                await page.mouse.wheel(dx, dy)
            elif name == "press_key":
                key = KEYS.get(str(args.get("key", "")).strip().lower())
                if key is None:
                    return {"error": "That key isn't allowed."}
                await page.keyboard.press(key)
            elif name == "hotkey":
                key = KEYS.get("+".join(str(k).strip().lower() for k in args.get("keys") or []))
                if key is None:
                    return {"error": "That key isn't allowed."}
                await page.keyboard.press(key)
            elif name == "navigate":
                url = str(args.get("url", ""))
                if not host_allowed(url, self._allowed):
                    return {"error": "That site is outside this form. Stay on the form's own pages."}
                await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
            elif name == "wait":
                await asyncio.sleep(min(float(args.get("seconds") or 1), MAX_WAIT_SECONDS))
            elif name in ("take_screenshot", "wait_5_seconds"):
                if name == "wait_5_seconds":
                    await asyncio.sleep(MAX_WAIT_SECONDS)
            else:
                return {"error": f"The action {name} isn't available."}
        except Exception as exc:
            logger.info("filler action %s failed (%s)", name, exc.__class__.__name__)
            return {"error": f"The action did not work ({exc.__class__.__name__})."}
        await self._settle()
        return {}

    async def _settle(self) -> None:
        try:
            await self.page.wait_for_load_state("domcontentloaded", timeout=MAX_WAIT_SECONDS * 1000)
        except Exception:
            pass
        await asyncio.sleep(self._settle_seconds)
