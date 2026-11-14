"""Fakes for the browser execution agent: a simulated form page and a scripted model.

No browser, no network. Points are (x, y) on the model's 1000 x 1000 grid.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.execution.agent import Call, ModelTurn
from app.execution.computer import Observation
from app.execution.gate import Action, Element, PageFacts

PRACTICE_URL = "http://127.0.0.1:8000/practice/"


def field(label: str, name: str, **kw: Any) -> Element:
    return Element(tag="input", type=kw.pop("type", "text"), text=label, name=name, editable=True, **kw)


# The practice form, flattened: every control the scripted model touches.
FORM: dict[tuple[int, int], Element] = {
    (100, 100): field("First name", "first_name"),
    (100, 150): field("Phone number", "phone", type="tel"),
    (100, 200): field("ZIP code", "zip"),
    (100, 250): field("Number of people in your household", "household"),
    (500, 900): Element(tag="button", text="Next"),
    (500, 950): Element(tag="button", type="submit", text="Submit application"),
    (100, 300): Element(tag="input", type="checkbox", text="I certify that the information is true"),
    (100, 350): field("Social Security Number", "ssn"),
}


class FakeComputer:
    def __init__(self, url: str = PRACTICE_URL, targets: dict[tuple[int, int], Element] | None = None,
                 text: str = "") -> None:
        self.url = url
        self.targets = FORM if targets is None else targets
        self.focused: Element | None = None
        self.typed: dict[str, str] = {}  # field name -> value
        self.executed: list[str] = []
        self.text = text

    def _target(self, args: dict[str, Any]) -> Element | None:
        if "x" in args and "y" in args:
            return self.targets.get((int(args["x"]), int(args["y"])))
        return None

    async def observe(self) -> Observation:
        return Observation(url=self.url, screenshot=b"\x89PNG fake")

    async def facts(self, action: Action) -> PageFacts:
        return PageFacts(url=self.url, target=self._target(action.args), focused=self.focused)

    async def execute(self, action: Action, value: str | None = None) -> dict[str, Any]:
        self.executed.append(action.name)
        if action.name == "click":
            target = self._target(action.args)
            self.focused = target if target and target.editable else None
        elif action.name == "type" and self.focused is not None and value is not None:
            self.typed[self.focused.name] = value
        return {}

    async def page_text(self) -> str:
        return self.text


def click(x: int, y: int, call_id: str = "") -> Call:
    return Call(id=call_id or f"c{x}-{y}", name="click", args={"x": x, "y": y})


def type_(placeholder: str, call_id: str = "") -> Call:
    return Call(id=call_id or f"t-{placeholder}", name="type", args={"text": placeholder})


class ScriptedModel:
    """Plays back one list of calls per turn and records every input it was sent."""

    def __init__(self, turns: list[list[Call]], delay: float = 0.0) -> None:
        self.turns = list(turns)
        self.inputs: list[list[dict[str, Any]]] = []
        self.delay = delay

    async def turn(self, input_parts: list[dict[str, Any]], previous_id: str | None) -> ModelTurn:
        self.inputs.append(input_parts)
        if self.delay:
            await asyncio.sleep(self.delay)
        calls = self.turns.pop(0) if self.turns else []
        return ModelTurn(interaction_id=f"i{len(self.inputs)}", calls=calls)
