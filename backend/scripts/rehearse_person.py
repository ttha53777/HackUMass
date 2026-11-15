"""Rehearsal: act as the person in the visible practice-form window.

The form helper hands the browser over at the signing step. On stage a person
picks the heating fuel, ticks the certify box, types their name and presses
Submit in the Chrome window the backend opened. This script does the same, so a
whole demo can be rehearsed without touching the window.

Needs the backend started with BROWSER_PROVIDER=local and LOCAL_BROWSER_DEBUG_PORT
(for example 9333), and the run waiting on "Your turn". Practice forms only.

    .venv/bin/python scripts/rehearse_person.py --port 9333 --name "Maya Rivera" --fuel Electric
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from urllib.parse import urlsplit

from playwright.async_api import async_playwright


async def act(port: int, name: str, fuel: str | None, submit: bool) -> int:
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
        pages = [pg for ctx in browser.contexts for pg in ctx.pages if urlsplit(pg.url).path.startswith("/practice/")]
        if not pages:
            print("No practice form is open in the helper's window.")
            return 1
        page = pages[-1]
        await page.bring_to_front()
        print(f"Acting as the person on {urlsplit(page.url).path}")
        radios = page.locator("input[name=heating_fuel]")
        if fuel and await radios.count() and await radios.first.is_visible():
            await page.check(f"input[name=heating_fuel][value='{fuel}']")
            print(f"  picked heating fuel: {fuel}")
        await page.check("#certify")
        print("  ticked the certify box")
        await page.locator("#signature").press_sequentially(name, delay=40)
        print("  typed the signature")
        if submit:
            await page.click("#submit")
            await page.wait_for_selector("#done:not([hidden])", timeout=5000)
            print("  pressed Submit: " + (await page.inner_text("#ref")))
        # Leave the browser to the backend: disconnect without closing it.
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=9333)
    parser.add_argument("--name", default="Maya Rivera")
    parser.add_argument("--fuel", default="Electric")
    parser.add_argument("--no-submit", action="store_true", help="sign but leave Submit to a human")
    args = parser.parse_args()
    return asyncio.run(act(args.port, args.name, args.fuel, not args.no_submit))


if __name__ == "__main__":
    sys.exit(main())
