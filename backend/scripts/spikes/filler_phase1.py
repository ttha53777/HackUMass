"""Filler phase 1 gate, live: real Gemini Computer Use fills the practice page while it streams.

    cd backend && .venv/bin/python scripts/spikes/filler_phase1.py

Uses FILLER_PROVIDER (local by default; steel needs STEEL_API_KEY) and FILLER_MODEL.
The page is built in and the person is fictional, so nothing real is typed or sent.
Prints the run's numbers and GO or NO-GO against the gate: both fields filled, and
the live view at 5 fps or better while the page changes. Also reports how long the
first typing took, which the spec targets at under 20 s.
"""

import asyncio
import sys
import time

from _env import load_env, require


async def main() -> int:
    load_env()
    require("GEMINI_API_KEY")
    from app.filler.config import FillerSettings
    from app.filler.loop import GeminiModel
    from app.filler.runs import SpikeRuns
    from app.filler.sandbox import make_browser

    settings = FillerSettings.from_env()
    print(f"provider: {settings.provider} | model: {settings.model}")
    runs = SpikeRuns(make_browser(settings),
                     lambda instruction: GeminiModel(settings.gemini_api_key, settings.model, instruction))
    started = time.monotonic()
    run = runs.start()
    queue = run.stream.subscribe()
    while True:
        event = await queue.get()
        if event is None:
            break
        if event["type"] in ("step", "status"):
            text = event.get("caption") or f"[{event['status']}] {event.get('message') or ''}"
            print(f"{time.monotonic() - started:6.1f}s  {text}")
    await run.task
    view = run.view()
    print("\n", view)
    ok = view["status"] == "done" and all(view["filled"].values()) and view["peak_fps"] >= 5
    print("GO: phase 1 gate passed." if ok else "NO-GO: see the numbers above.")
    first = view["first_type_seconds"]
    if first is not None:
        print(f"first typing after {first} s (spec target: under 20 s)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
