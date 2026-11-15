"""The fast path (phase 3.5): fill a form page by page from its HTML, with no model turns.

For each page:
  1. read the visible fields (`dom_map.collect`) and match them to fill-sheet keys;
  2. fill each matched field that is empty: the cursor glides to it, it fills in one step
     and stays highlighted for `DWELL_SECONDS`, so the person still sees every field land.
     Every field goes through the gate first (`classify_typing`), exactly like a model's
     action would: a signature, an SSN field or a sign-in field is handed to the person;
  3. a required field still empty after that (a checkbox, a choice, a signature, a field
     we couldn't match) goes to the person in ONE hand-off for the whole page;
  4. click the page's Next/Continue button (gated too); if the page doesn't change (the
     form showed an error), stop and let the Gemini loop or the person take over;
  5. a Submit button and no Next: the form is ready for the person's review.

`plan()` describes the first page before anything is typed, for the pre-flight card.
Returns "review" when it reaches the final Submit, "stuck" when the slower Gemini loop
should take over from the current page.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Callable

from app.filler.computer import Computer
from app.filler.dom_map import Field, FieldMapper, Mapping, collect, map_fields
from app.filler.gate import CAPTCHA_HOSTS, GatePolicy, classify_press, classify_typing, host_allowed
from app.filler.loop import FillSheet, RunHooks
from app.filler.models import CATALOGUE
from app.filler.stream import LiveStream

logger = logging.getLogger(__name__)

DWELL_SECONDS = 0.2
SETTLE_SECONDS = 0.5
MAX_PAGES = 12
NEXT = re.compile(r"\b(next|continue|proceed|next step|save and continue|go on)\b")


class FastFiller:
    def __init__(self, computer: Computer, stream: LiveStream, sheet: FillSheet, hooks: RunHooks, *,
                 allowed_hosts: frozenset[str], askable: frozenset[str], curated: dict[str, str] | None = None,
                 mapper: FieldMapper | None = None, dwell: float = DWELL_SECONDS,
                 on_typed: Callable[[str], None] | None = None) -> None:
        self.computer, self.stream, self.sheet, self.hooks = computer, stream, sheet, hooks
        self.allowed_hosts, self.askable = allowed_hosts, askable
        self.curated, self.mapper, self.dwell = curated or {}, mapper, dwell
        self.on_typed = on_typed
        self.typed_keys: list[str] = []
        self._cache: dict[str, Mapping] = {}

    @property
    def page(self) -> Any:
        return self.computer.page

    def policy(self) -> GatePolicy:
        known = frozenset(self.sheet.entries)
        return GatePolicy(self.allowed_hosts, known, known | self.askable)

    async def _mapping(self, fields: list[Field]) -> Mapping:
        signature = "|".join(f.fid for f in fields)
        if signature not in self._cache:  # one model call at most per page
            self._cache[signature] = await map_fields(fields, curated=self.curated, mapper=self.mapper,
                                                      keys=sorted(self.askable))
        return self._cache[signature]

    # -- pre-flight ------------------------------------------------------------------

    async def plan(self) -> list[dict[str, Any]]:
        """What the first page asks for and how each field will be handled."""
        fields = await collect(self.page)
        mapping = await self._mapping(fields)
        known = self.sheet.entries
        rows: list[dict[str, Any]] = []
        for f in fields:
            if f.element.is_button_like:
                continue
            label = (f.label or f.placeholder or f.html_name or "A field")[:80]
            key = mapping.keys.get(f.fid)
            if key and key in known:
                rows.append({"label": label, "how": "fill", "key": key, "source": known[key].source})
            elif key:
                rows.append({"label": label, "how": "ask" if f.required else "skip", "key": key})
            elif f.required:
                rows.append({"label": label, "how": "yours"})
        return rows

    # -- run -------------------------------------------------------------------------

    async def run(self) -> str:
        for _ in range(MAX_PAGES):
            if not host_allowed(self.page.url, self.allowed_hosts):
                return "stuck"
            frames = [f.url for f in self.page.frames if f.url and not f.url.startswith("about:")]
            if any(any(c in u for c in CAPTCHA_HOSTS) for u in frames):
                await self.hooks.handoff("captcha")
            await self.hooks.checkpoint()
            fields = await collect(self.page)
            await self._fill_page(fields, await self._mapping(fields))
            fields = await collect(self.page)
            await self._persons_part(fields)

            fields = await collect(self.page)
            buttons = [f for f in fields if f.element.is_button_like]
            nexts = [b for b in buttons if NEXT.search(b.element.words) and classify_press(b.element).kind == "allow"]
            if nexts:
                before = self._signature(fields)
                await self.hooks.checkpoint()
                label = nexts[-1].element.text.split(" | ")[0][:40] or "Next"
                self.stream.step(f"Clicking {label}")
                await self._click(nexts[-1])
                await asyncio.sleep(SETTLE_SECONDS)
                if self._signature(await collect(self.page)) == before:
                    self.stream.step("The form didn't move on. Taking a closer look.")
                    return "stuck"
                continue
            if any(classify_press(b.element).reason == "submit" for b in buttons):
                return "review"
            return "stuck"
        return "stuck"

    @staticmethod
    def _signature(fields: list[Field]) -> str:
        return "|".join(sorted(f.fid for f in fields if not f.element.is_button_like))

    async def _fill_page(self, fields: list[Field], mapping: Mapping) -> None:
        for f in fields:
            key = mapping.keys.get(f.fid)
            if key is None or f.filled:
                continue
            verdict = classify_typing(key, f.element, self.policy())
            if verdict.kind == "handoff":
                continue  # left empty; step 3 gives it to the person with the rest
            if verdict.kind == "block":
                continue
            if verdict.kind == "ask":
                if not f.required or not await self._ask(key):
                    continue
            await self.hooks.checkpoint()
            await self._fill(f, key)

    async def _fill(self, f: Field, key: str) -> None:
        entry = self.sheet.entries.get(key)
        if entry is None:  # consent went away a moment ago
            return
        source = f" from {entry.source}" if entry.source else ""
        self.stream.step(f"Typing your {entry.label}{source}", key)
        if self.on_typed:
            self.on_typed(key)
        await self._click(f)
        if not await self.computer.put(entry.value):
            if key not in self.typed_keys:
                self.typed_keys.append(key)
            self.stream.publish({"type": "checklist", "filled": list(self.typed_keys)})
        await asyncio.sleep(self.dwell)

    async def _click(self, f: Field) -> None:
        locator = self.page.locator(f.selector)
        await locator.scroll_into_view_if_needed(timeout=3000)
        box = await locator.bounding_box()
        x, y = (box["x"] + box["width"] / 2, box["y"] + box["height"] / 2) if box else (f.x, f.y)
        await self.computer.glide_click(x, y)

    async def _persons_part(self, fields: list[Field]) -> None:
        """Required fields still empty after filling: the person does them, in one hand-off."""
        waiting = [f for f in fields if f.required and not f.filled and not f.element.is_button_like]
        if not waiting:
            return
        first = waiting[0]
        reason = classify_press(first.element).reason or (
            classify_typing("full_name", first.element, self.policy()).reason) or "unknown_field"
        # Bring it into view for the person; never click it (a click would tick a box for them).
        try:
            await self.page.locator(first.selector).scroll_into_view_if_needed(timeout=3000)
        except Exception:
            pass
        await self.hooks.handoff(reason)

    async def _ask(self, key: str) -> bool:
        self.stream.step(f"Asked you for your {CATALOGUE[key].label}")
        return await self.hooks.ask(key)

