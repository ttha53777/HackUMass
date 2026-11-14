"""Spike S2: Steel session from Python, Playwright attached over CDP, live view embedded,
interactive toggle working while Playwright stays attached.

    cd backend && .venv/bin/python scripts/spikes/s2_steel.py

Writes a scratch page (path printed) with the live view in an iframe and a
read-only / interactive toggle. Open it, type in the remote page, then press
Enter here: the script checks Playwright can still read the page. The session is
always released. Prints GO or NO-GO.
"""

import asyncio
import sys
import tempfile
from pathlib import Path

from _env import load_env, require

SCRATCH = """<!doctype html><meta charset="utf-8"><title>S2 live view</title>
<body style="font:15px sans-serif;margin:16px">
<p><button onclick="f.src=base+'?interactive=false&showControls=false'">Read-only</button>
<button onclick="f.src=base+'?interactive=true&showControls=true'">Interactive</button></p>
<iframe id="f" style="width:100%;height:80vh;border:1px solid #ccc" allow="clipboard-read; clipboard-write"></iframe>
<script>const base={debug!r}; const f=document.getElementById('f'); f.src=base+'?interactive=false&showControls=false';</script>"""


async def main() -> None:
    load_env()
    require("STEEL_API_KEY")
    from app.execution.config import AgentSettings, RunTarget
    from app.execution.provider import SteelProvider

    settings = AgentSettings.from_env()
    target = RunTarget("spike", "stop_before_submit", "https://example.com/", frozenset({"example.com"}))
    session = await SteelProvider(settings.steel_api_key).open(target)
    try:
        debug = session.debug_url  # type: ignore[attr-defined]
        print("session opened; debug URL present:", bool(debug))
        out = Path(tempfile.gettempdir()) / "s2-live-view.html"
        out.write_text(SCRATCH.replace("{debug!r}", repr(debug or "")))
        print(f"Open file://{out} , switch to Interactive, click in the remote page, then press Enter here.")
        await asyncio.to_thread(input)
        observation = await session.computer.observe()
        attached = bool(observation.screenshot) and observation.url.startswith("http")
        print("Playwright still attached after human input:", attached)
        out.unlink(missing_ok=True)
    finally:
        await session.close()
        print("session released")
    print("GO: Steel works." if attached else "NO-GO: switch to Browserbase Developer (plan section 1).")
    sys.exit(0 if attached else 1)


if __name__ == "__main__":
    asyncio.run(main())
