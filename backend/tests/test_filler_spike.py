"""Filler phase 1: the live stream, the action mapping, and a spike run in real Chrome.

The browser tests use headless Google Chrome (LOCAL_BROWSER_CHANNEL) and a scripted
model, so no network or API key is needed; they skip when Playwright or Chrome is
missing. The live check against Gemini is scripts/spikes/filler_phase1.py.
"""

import asyncio
import os

import pytest
from fastapi.testclient import TestClient

from app.filler.computer import host_allowed, to_pixels
from app.filler.loop import AgentLoop, Call, FillSheet, ModelTurn, SheetEntry
from app.filler.stream import QUEUE_SIZE, LiveStream
from app.main import create_app
from app.services.nessie import NessieService

CHANNEL = os.environ.get("LOCAL_BROWSER_CHANNEL", "chrome") or None


# -- pure pieces ---------------------------------------------------------------


def test_grid_coordinates_scale_to_the_viewport():
    assert to_pixels(500, 500, 1280, 800) == (640, 400)
    assert to_pixels(0, 0, 1280, 800) == (0, 0)
    assert to_pixels(1000, 1000, 1280, 800) == (1279, 799)  # clamped inside


def test_fill_sheet_accepts_exactly_one_known_placeholder():
    sheet = FillSheet({"first_name": SheetEntry("Maya", "first name")})
    assert sheet.resolve("{{first_name}}") == ("first_name", "Maya")
    assert sheet.resolve(" {{ first_name }} ") == ("first_name", "Maya")
    assert sheet.resolve("Maya") == (None, None)
    assert sheet.resolve("{{ssn}}") == (None, None)
    assert sheet.resolve("{{first_name}} {{first_name}}") == (None, None)
    assert all("Maya" not in line for line in sheet.lines())


def test_navigation_stays_on_allowed_hosts():
    hosts = frozenset({"forms.example.org"})
    assert host_allowed("https://forms.example.org/a", hosts)
    assert host_allowed("https://www.forms.example.org/a", hosts)
    assert not host_allowed("https://evil.example.com/forms.example.org", hosts)


def test_late_viewer_gets_latest_frame_and_status_first():
    async def scenario():
        stream = LiveStream()
        stream.status("running")
        stream.publish({"type": "frame", "data": "a", "width": 1, "height": 1})
        stream.publish({"type": "frame", "data": "b", "width": 1, "height": 1})
        queue = stream.subscribe()
        return [queue.get_nowait() for _ in range(queue.qsize())]

    events = asyncio.run(scenario())
    assert [e["type"] for e in events] == ["status", "frame"]
    assert events[1]["data"] == "b"


def test_slow_viewer_drops_old_frames_but_keeps_steps():
    async def scenario():
        stream = LiveStream()
        queue = stream.subscribe()
        stream.step("Typing your first name", "first_name")
        for i in range(QUEUE_SIZE * 2):
            stream.publish({"type": "frame", "data": str(i), "width": 1, "height": 1})
        events = [queue.get_nowait() for _ in range(queue.qsize())]
        return events

    events = asyncio.run(scenario())
    assert len(events) == QUEUE_SIZE
    assert events[0]["type"] == "step"
    assert events[-1]["data"] == str(QUEUE_SIZE * 2 - 1)


def test_closed_stream_ends_every_viewer():
    async def scenario():
        stream = LiveStream()
        queue = stream.subscribe()
        await stream.close()
        late = stream.subscribe()
        return queue.get_nowait(), queue.get_nowait(), late.get_nowait(), late.get_nowait()

    first, sentinel, late_first, late_sentinel = asyncio.run(scenario())
    assert first == {"type": "end"} and sentinel is None
    assert late_first == {"type": "end"} and late_sentinel is None


def test_peak_fps_measures_the_busiest_window():
    stream = LiveStream()
    stream._frame_times.extend([0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 10.0])
    assert stream.peak_fps(window=1.0) == 10.0


class _FakeComputer:
    url = "about:blank"

    def __init__(self):
        self.done = []

    async def screenshot(self):
        return b"png"

    async def label_at(self, x, y):
        return "First name"

    async def execute(self, action, value=None):
        self.done.append((action.name, value))
        return {}


def test_loop_types_values_only_through_the_sheet_and_never_captions_them():
    calls = [
        [Call("1", "click", {"x": 100, "y": 100})],
        [Call("2", "type", {"text": "{{first_name}}"})],
        [Call("3", "type", {"text": "free text the model made up"})],
        [Call("4", "finish", {})],
    ]

    class Model:
        async def turn(self, parts, previous):
            return ModelTurn(f"i{len(calls)}", calls.pop(0))

    async def scenario():
        stream = LiveStream()
        queue = stream.subscribe()
        computer = _FakeComputer()
        sheet = FillSheet({"first_name": SheetEntry("Maya", "first name", "your lease")})
        end = await AgentLoop(Model(), computer, stream, sheet).run("Fill it in.")
        steps = []
        while not queue.empty():
            event = queue.get_nowait()
            if event and event["type"] == "step":
                steps.append(event["caption"])
        return end, computer.done, steps

    end, done, steps = asyncio.run(scenario())
    assert end.kind == "finished" and end.typed_keys == ["first_name"]
    assert done == [("click", None), ("type", "Maya")]  # the made-up text was never typed
    assert steps[:2] == ["Clicking First name", "Typing your first name from your lease"]
    assert all("Maya" not in s for s in steps)


def test_dev_routes_are_absent_unless_enabled(repo, monkeypatch):
    monkeypatch.delenv("FILLER_ENABLED", raising=False)
    with TestClient(create_app(repo, NessieService(None))) as client:
        assert client.post("/api/filler/dev/spike").status_code == 404


# -- real Chrome ---------------------------------------------------------------

playwright_api = pytest.importorskip("playwright.async_api")

from app.filler.consent import FillerSessions  # noqa: E402
from app.filler.jobs import PaperJobs  # noqa: E402
from app.filler.runs import SPIKE_PAGE, SpikeRuns  # noqa: E402
from app.filler.sandbox import LocalBrowser  # noqa: E402
from app.filler.service import Filler  # noqa: E402


def _filler(runs):
    return Filler(FillerSessions(), PaperJobs(reader=None), runs)


async def _grid_points() -> dict[str, dict[str, int]]:
    """Where the practice page's controls sit, on Gemini's 1000 grid (same layout as the run)."""
    async with playwright_api.async_playwright() as p:
        try:
            browser = await p.chromium.launch(channel=CHANNEL, headless=True)
        except Exception as exc:  # no Chrome on this machine
            pytest.skip(f"Chrome not available ({exc.__class__.__name__})")
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.set_content(SPIKE_PAGE)
        points = {}
        for name in ("#first_name", "#last_name", "#next"):
            box = await page.locator(name).bounding_box()
            points[name] = {"x": round((box["x"] + box["width"] / 2) / 1280 * 1000),
                            "y": round((box["y"] + box["height"] / 2) / 800 * 1000)}
        await browser.close()
        return points


class ScriptedModel:
    """Plays Gemini: click a field, type its placeholder, then Next, then finish."""

    def __init__(self, points):
        p = points
        self.plan = [
            [Call("a", "click", p["#first_name"])], [Call("b", "type", {"text": "{{first_name}}"})],
            [Call("c", "click", p["#last_name"])], [Call("d", "type", {"text": "{{last_name}}"})],
            [Call("e", "click", p["#next"])], [Call("f", "finish", {})],
        ]

    async def turn(self, parts, previous):
        return ModelTurn("i", self.plan.pop(0))


@pytest.fixture(scope="module")
def points():
    return asyncio.run(_grid_points())


def test_spike_run_streams_live_and_fills_the_form(repo, points):
    """Phase 1 gate: a click and a typed field, visible live at 5 fps or better."""
    runs = SpikeRuns(LocalBrowser(CHANNEL, headless=True), lambda instruction: ScriptedModel(points))
    with TestClient(create_app(repo, NessieService(None), filler=_filler(runs))) as client:
        started = client.post("/api/filler/dev/spike")
        assert started.status_code == 202
        run_id = started.json()["run_id"]
        assert client.post("/api/filler/dev/spike").status_code == 409  # one at a time

        kinds, steps, cursors = set(), [], []
        with client.websocket_connect(f"/api/filler/dev/spike/{run_id}/live") as ws:
            while True:
                event = ws.receive_json()
                kinds.add(event["type"])
                if event["type"] == "step":
                    steps.append(event["caption"])
                elif event["type"] == "cursor":
                    cursors.append(event["kind"])
                elif event["type"] == "end":
                    break

        view = client.get(f"/api/filler/dev/spike/{run_id}").json()
        assert view["status"] == "done", view
        assert view["filled"] == {"first_name": True, "last_name": True}
        assert view["peak_fps"] >= 5, view
        assert view["first_type_seconds"] is not None
        assert {"frame", "cursor", "step", "status", "end"} <= kinds
        assert cursors.count("click") == 3
        assert "Typing your first name from your practice paper" in steps
        assert "Clicking Next" in steps
        assert not any("Maya" in s or "Rivera" in s for s in steps)
        assert client.get("/api/filler/dev/spike/nope").status_code == 404


def test_stop_releases_the_browser(repo, points):
    class SlowModel(ScriptedModel):
        async def turn(self, parts, previous):
            await asyncio.sleep(30)
            return await super().turn(parts, previous)

    runs = SpikeRuns(LocalBrowser(CHANNEL, headless=True), lambda instruction: SlowModel(points))
    with TestClient(create_app(repo, NessieService(None), filler=_filler(runs))) as client:
        run_id = client.post("/api/filler/dev/spike").json()["run_id"]
        for _ in range(100):
            if client.get(f"/api/filler/dev/spike/{run_id}").json()["status"] == "running":
                break
            import time
            time.sleep(0.1)
        stopped = client.post(f"/api/filler/dev/spike/{run_id}/stop").json()
        assert stopped["status"] == "stopped"
        assert client.post("/api/filler/dev/spike").status_code == 202  # free for a new run
