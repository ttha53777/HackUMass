"""Phase 3 acceptance rehearsal: repeated runs with the real model and browser host.

    cd backend && .venv/bin/python scripts/spikes/rehearse.py                    # 5 practice runs
    cd backend && .venv/bin/python scripts/spikes/rehearse.py --program hves-home-delivered-meals --include-disabled

Needs GEMINI_API_KEY and BROWSER_PROVIDER (local or steel; steel also needs
STEEL_API_KEY and a public PRACTICE_BASE_URL for the practice form). Questions
are answered with an obviously fictional person. At a handoff the script plays
the person: on the practice form it ticks, signs and submits; on a real site it
only ends the run at the stop point. Nothing is ever submitted to a real site.

Acceptance (docs/browser-agent-plan.md, Phase 3): five consecutive clean
practice runs (done, received, under 4 minutes); a real site reaching the stop
point in at least four of five.
"""

import argparse
import asyncio
import sys
import time

from _env import load_env, require

FICTIONAL = {
    "first_name": "Testy", "last_name": "Practiceperson", "date_of_birth": "01/01/1960",
    "phone": "413-555-0100", "email": "practice@example.com", "street_address": "1 Example Lane",
    "household_size": "2", "monthly_income": "1,450",
}
RUN_LIMIT_SECONDS = 240


async def person_submits_practice(page) -> None:
    await page.check("#certify")
    await page.fill("#signature", "Testy Practiceperson")
    await page.click("#submit")


async def one_run(manager, target, store_factory) -> dict:
    from app.graph.state import AnswerIn

    run = manager.start("rehearsal", target, store_factory())
    started = time.monotonic()
    questions = handoffs = 0
    unexpected = None
    while run.active:
        if time.monotonic() - started > RUN_LIMIT_SECONDS + 30:
            await manager.stop(run)
            break
        if run.status == "needs_answer" and run.question_key:
            questions += 1
            value = FICTIONAL.get(run.question_key)
            manager.answer(run, AnswerIn(question_id=f"agent:{run.question_key}", text=value, skipped=value is None))
        elif run.status == "needs_you" and run.handoff_reason:
            handoffs += 1
            reason = run.handoff_reason
            if reason == "stop_point":
                manager.control(run, "return")
            elif target.mode == "practice" and reason in ("attestation", "submit"):
                await person_submits_practice(run.browser.page)  # type: ignore[union-attr]
                manager.control(run, "return")
            else:
                unexpected = reason
                await manager.stop(run)
                break
        await asyncio.sleep(0.2)
    if run.task is not None:
        await asyncio.wait({run.task}, timeout=15)
    seconds = time.monotonic() - started
    if target.mode == "practice":
        clean = run.status == "done" and run.outcome is not None and run.outcome.status == "submitted" and seconds < RUN_LIMIT_SECONDS
    else:
        clean = any(s.text == "Stopped before sending" for s in run.steps)
    return {
        "status": run.status, "outcome": run.outcome.status if run.outcome else "-", "seconds": round(seconds),
        "steps": len(run.steps), "questions": questions, "handoffs": handoffs, "clean": clean,
        "note": unexpected or (run.message or ""),
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--program", default="fbwm-snap-application-assistance")
    parser.add_argument("--include-disabled", action="store_true", help="allow a disabled (real-site) record")
    args = parser.parse_args()

    load_env()
    require("GEMINI_API_KEY")
    from app.execution.config import AgentSettings, automation_records, resolve_target
    from app.execution.fields import store_from_profile
    from app.execution.manager import ExecutionManager
    from app.execution.provider import make_provider
    from app.graph.state import Fact, Profile
    from app.services.programs_repo import repository_from_env
    from datetime import datetime, timezone

    settings = AgentSettings.from_env()
    provider = make_provider(settings)
    if provider is None:
        sys.exit("Set BROWSER_PROVIDER to local or steel.")
    record = automation_records(include_disabled=args.include_disabled).get(args.program)
    if record is None:
        sys.exit(f"No usable automation record for {args.program} (disabled records need --include-disabled).")
    target = resolve_target(record, settings)
    repo = repository_from_env("curated")
    now = datetime.now(timezone.utc)
    profile = Profile(facts={k: Fact(value=v, provenance="user_reported", updated_at=now)
                             for k, v in {"zip": "01002", "household_size": 2, "monthly_income": 1450}.items()})
    manager = ExecutionManager(provider, settings)

    print(f"{args.runs} runs of {args.program} ({target.mode}) on {settings.provider}, model {settings.model}\n")
    print("| # | status | outcome | seconds | steps | questions | handoffs | clean | note |\n|---|---|---|---|---|---|---|---|---|")
    results = []
    for i in range(args.runs):
        row = await one_run(manager, target, lambda: store_from_profile(profile, repo.region))
        results.append(row)
        print(f"| {i + 1} | {row['status']} | {row['outcome']} | {row['seconds']} | {row['steps']} | "
              f"{row['questions']} | {row['handoffs']} | {'yes' if row['clean'] else 'no'} | {row['note'][:60]} |", flush=True)
    await manager.shutdown()

    clean = sum(r["clean"] for r in results)
    if target.mode == "practice":
        ok = clean == args.runs
        print(f"\n{'PASS' if ok else 'FAIL'}: {clean}/{args.runs} clean practice runs (need all, consecutively).")
    else:
        ok = clean >= max(1, round(args.runs * 0.8))
        print(f"\n{'PASS' if ok else 'FAIL'}: reached the stop point {clean}/{args.runs} times (need 4 of 5).")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
