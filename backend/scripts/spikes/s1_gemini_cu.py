"""Spike S1: Gemini Computer Use clicks one button and types one field, via client.interactions.

    cd backend && .venv/bin/python scripts/spikes/s1_gemini_cu.py

Answers the open items in docs/browser-agent-plan.md section 6:
  * the model id works (BROWSER_AGENT_MODEL, default gemini-4-hydrogen);
  * the coordinate system: we place a button at a known pixel position and check
    whether the model's x, y match it on a 1000x1000 grid or in pixels;
  * the action names and argument shapes we actually receive;
  * whether a safety_decision shows up, and in what shape.
A local page only: nothing personal is typed. Prints GO or NO-GO.
"""

import asyncio
import base64
import json
import sys

from _env import load_env, require

PAGE = """<!doctype html><html><body style="margin:0;font:20px sans-serif">
<input id="name" placeholder="Your name" style="position:absolute;left:200px;top:150px;width:300px;height:40px;font:inherit">
<button id="go" style="position:absolute;left:1100px;top:700px;width:200px;height:60px;font:inherit"
  onclick="document.getElementById('out').textContent='clicked'">Press me</button>
<p id="out" style="position:absolute;left:200px;top:300px"></p></body></html>"""
W, H = 1440, 900
BUTTON_CENTER = (1200, 730)


async def main() -> None:
    load_env()
    from google import genai
    from playwright.async_api import async_playwright

    from app.execution.agent import parse_interaction
    from app.execution.config import DEFAULT_AGENT_MODEL
    import os

    key = require("GEMINI_API_KEY")
    model = os.environ.get("BROWSER_AGENT_MODEL", "").strip() or DEFAULT_AGENT_MODEL
    client = genai.Client(api_key=key).aio.interactions
    tools = [{"type": "computer_use", "environment": "browser", "enable_prompt_injection_detection": True}]

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel=os.environ.get("LOCAL_BROWSER_CHANNEL", "chrome") or None, headless=True)
        page = await browser.new_page(viewport={"width": W, "height": H})
        await page.set_content(PAGE)

        async def shot():
            return base64.b64encode(await page.screenshot(type="png")).decode()

        parts = [{"type": "text", "text": "Click the 'Press me' button. Then click the 'Your name' field and type hello."},
                 {"type": "image", "data": await shot(), "mime_type": "image/png"}]
        previous, seen = None, []
        for turn in range(6):
            kwargs = {"model": model, "input": parts, "tools": tools}
            if previous:
                kwargs["previous_interaction_id"] = previous
            interaction = await client.create(**kwargs)
            result = parse_interaction(interaction)
            previous = result.interaction_id
            if not result.calls:
                print("model finished:", result.text[:200])
                break
            parts = []
            for call in result.calls:
                seen.append(call)
                print(f"turn {turn}: {call.name} {json.dumps(call.args)[:300]}")
                args = call.args
                if call.name == "click":
                    gx, gy = int(args["x"] / 1000 * W), int(args["y"] / 1000 * H)
                    print(f"   as 1000-grid -> ({gx},{gy}); as pixels -> ({args['x']},{args['y']}); button at {BUTTON_CENTER}")
                    await page.mouse.click(gx, gy)
                elif call.name == "type":
                    await page.keyboard.insert_text(str(args.get("text", "")))
                payload = {"url": page.url}
                if "safety_decision" in args:
                    print("   safety_decision:", args["safety_decision"])
                parts.append({"type": "function_result", "call_id": call.id, "name": call.name, "result": [
                    {"type": "text", "text": json.dumps(payload)},
                    {"type": "image", "data": await shot(), "mime_type": "image/png"}]})
        clicked = await page.inner_text("#out") == "clicked"
        typed = await page.input_value("#name")
        await browser.close()

    names = sorted({c.name for c in seen})
    print(f"\nactions seen: {names}")
    print(f"button clicked with 1000-grid scaling: {clicked}; field value: {typed!r}")
    ok = clicked and typed.strip().lower() == "hello"
    print("GO: Gemini Computer Use works on forms." if ok else "NO-GO: switch the engine to browser-use (plan section 1).")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
