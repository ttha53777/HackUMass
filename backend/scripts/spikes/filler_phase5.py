"""Filler phase 5 rehearsal: fill-and-stop on the real HVES referral form, N times, through Steel.

    cd backend && .venv/bin/python scripts/spikes/filler_phase5.py --runs 5

An obviously fictional person. Each run fills the consumer section, must stop at the send
point with nothing sent, and must leave the browser released. Every request the page makes
is watched: a request that could send data (any method but GET/HEAD) that was NOT aborted
fails the run. Prints a table and PASS or FAIL.
"""

import argparse
import asyncio
import sys
import time

from _env import load_env, require

PERSON = {"full_name": "Maya Rivera", "first_name": "Maya", "last_name": "Rivera", "date_of_birth": "04/07/1946",
          "street_address": "12 Elm Street", "city": "Amherst", "state": "MA", "zip": "01002", "phone": "413-555-0100"}
EXPECTED = {"full_name", "date_of_birth", "street_address", "city", "zip", "phone"}
PROGRAM = "hves-home-delivered-meals"


async def one(n: int) -> dict:
    from app.filler.config import FillerSettings
    from app.filler.consent import FillerSessions
    from app.filler.runs import FillRuns
    from app.filler.sandbox import make_browser
    from app.filler.targets import all_targets

    settings = FillerSettings.from_env()
    sessions = FillerSessions()
    sessions.get("rehearsal").confirm([], PERSON)
    runs = FillRuns(make_browser(settings), lambda i: (_ for _ in ()).throw(RuntimeError("model not expected")),
                    sessions, targets=all_targets())
    escaped: list[str] = []
    started = time.monotonic()
    run = runs.start("rehearsal", prepare=True, program_id=PROGRAM)
    run.stream.subscribe()
    watched = False
    try:
        while run.status not in ("done", "stopped", "failed"):
            if not watched and run.computer is not None:
                page = run.computer.page
                page.on("requestfinished", lambda r: escaped.append(r.method) if r.method not in ("GET", "HEAD") else None)
                watched = True
            if run.status == "ready":
                ready_at = time.monotonic() - started
                run.control("go")
            elif run.status == "needs_answer":
                run.answer(False)  # skip anything not on the sheet
            elif run.status == "needs_you":
                run.control("return")  # the rehearsal person does nothing
            elif run.status == "review":
                await asyncio.sleep(0.5)
                run.control("done")
            await asyncio.sleep(0.1)
            if time.monotonic() - started > 180:
                await runs.stop("rehearsal", run.id)
        await run.task
    except Exception:
        pass
    return {
        "run": n, "status": run.status, "outcome": (run.outcome or {}).get("status"), "filled": sorted(run.filled),
        "blocked": run.blocked_sends, "escaped_sends": len(escaped), "used_model": run.model_turns_used,
        "released": run.handle is None, "seconds": round(time.monotonic() - started, 1),
        "ready_s": round(locals().get("ready_at", 0), 1), "message": run.message,
    }


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=5)
    args = parser.parse_args()
    load_env()
    require("STEEL_API_KEY")
    results = []
    for n in range(1, args.runs + 1):
        r = await one(n)
        results.append(r)
        ok = (r["status"] == "done" and r["outcome"] == "not_submitted" and set(r["filled"]) == EXPECTED
              and r["escaped_sends"] == 0 and r["released"])
        r["ok"] = ok
        print(f"run {n}: {'PASS' if ok else 'FAIL'} | {r['status']}/{r['outcome']} | filled {len(r['filled'])} "
              f"{r['filled']} | blocked {r['blocked']} | escaped {r['escaped_sends']} | model {r['used_model']} | "
              f"ready {r['ready_s']}s | total {r['seconds']}s")
        if not ok:
            print("   ", r["message"])
        await asyncio.sleep(4)  # let Steel release the session before the next one
    passed = all(r["ok"] for r in results)
    print("\nPASS: all rehearsals filled and stopped with nothing sent." if passed else "\nFAIL: see above.")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
