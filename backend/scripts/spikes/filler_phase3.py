"""Filler phase 3, live: real Gemini fills the practice form from confirmed details.

    cd backend && LOCAL_BROWSER_HEADLESS=1 .venv/bin/python scripts/spikes/filler_phase3.py

Plays the person with fictional details: answers any question from a fixed list,
ticks the certify box and signs at the hand-offs, and presses Submit at the review.
Prints each step with its time, then GO or NO-GO against the phase 3 gate: sent end to
end, at most one question, hand-offs at certify and Submit, under 3 minutes.
"""

import asyncio
import sys
import time

from _env import load_env, require

DETAILS = {"first_name": "Maya", "last_name": "Rivera", "date_of_birth": "04/07/1961", "street_address": "12 Elm Street",
           "city": "Amherst", "state": "MA", "zip": "01002", "household_size": "2", "monthly_income": "2600"}
ANSWERS = {"phone": "413-555-0100", "email": "maya@example.com"}


async def main() -> int:
    load_env()
    require("GEMINI_API_KEY")
    from app.filler.config import FillerSettings
    from app.filler.consent import FillerSessions
    from app.filler.loop import GeminiModel
    from app.filler.runs import FillRuns
    from app.filler.sandbox import make_browser

    settings = FillerSettings.from_env()
    print(f"provider: {settings.provider} | model: {settings.model}")
    sessions = FillerSessions()
    sessions.get("live").confirm([], DETAILS)
    runs = FillRuns(make_browser(settings), lambda i: GeminiModel(settings.gemini_api_key, settings.model, i), sessions)
    started = time.monotonic()
    run = runs.start("live")
    queue = run.stream.subscribe()
    questions, handoffs = [], []

    async def person() -> None:
        while run.status not in ("done", "stopped", "failed"):
            await asyncio.sleep(0.3)
            page = run.computer.page if run.computer else None
            if run.status == "needs_answer" and run.question:
                key = run.question["key"]
                questions.append(key)
                if key in ANSWERS:
                    sessions.get("live").confirm([], {key: ANSWERS[key]})
                run.answer(key in ANSWERS)
            elif run.status == "needs_you" and page is not None:
                handoffs.append(run.handoff_reason)
                if await page.locator("#certify").is_visible() and not await page.locator("#certify").is_checked():
                    await page.locator("#certify").check()
                if await page.locator("#signature").is_visible() and not await page.input_value("#signature"):
                    await page.fill("#signature", "Maya Rivera")
                run.control("return")
            elif run.status == "review" and page is not None:
                handoffs.append("submit")
                if await page.locator("#certify").is_visible() and not await page.locator("#certify").is_checked():
                    await page.locator("#certify").check()
                if await page.locator("#signature").is_visible() and not await page.input_value("#signature"):
                    await page.fill("#signature", "Maya Rivera")
                if await page.locator("#submit").is_visible():
                    await page.locator("#submit").click()
                run.control("done")

    helper = asyncio.create_task(person())
    while True:
        event = await queue.get()
        if event is None:
            break
        if event["type"] in ("step", "status", "question", "handoff"):
            text = event.get("caption") or event.get("text") or f"[{event.get('status')}] {event.get('message') or ''}"
            print(f"{time.monotonic() - started:6.1f}s  {text}")
    await run.task
    helper.cancel()
    took = time.monotonic() - started
    print("\n", run.view())
    print(f"questions: {questions} | hand-offs: {handoffs} | {took:.0f}s")
    ok = (run.outcome or {}).get("status") == "submitted" and len(questions) <= 1 and "submit" in handoffs and took < 180
    print("GO: phase 3 gate passed." if ok else "NO-GO: see above.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
