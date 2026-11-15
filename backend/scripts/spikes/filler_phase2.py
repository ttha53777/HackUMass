"""Filler phase 2, live: Gemini reads the three fictional sample papers (pay stub, ID, lease).

    cd backend && .venv/bin/python scripts/spikes/filler_phase2.py

Prints, per paper, the kind, the keys found with page and snippet, and the seconds the
read took (spec target: under 15 s). Fictional values only; nothing is stored.
"""

import asyncio
import sys
import time

from _env import BACKEND, load_env, require

sys.path.insert(0, str(BACKEND / "tests"))


async def main() -> int:
    load_env()
    key = require("GEMINI_API_KEY")
    from filler_samples import LEASE, PAY_STUB, STATE_ID

    from app.filler.config import FillerSettings
    from app.filler.extract import GeminiReader, build_request, interpret, pdf_pages_text
    from app.filler.models import SCOPES

    settings = FillerSettings.from_env()
    reader = GeminiReader(key, settings.read_model)
    print("read model:", settings.read_model)
    expected = {"pay_stub": {"full_name", "monthly_income", "employer", "zip"},
                "state_id": {"full_name", "date_of_birth", "zip"},
                "lease": {"monthly_rent", "household_size", "landlord_name"}}
    ok = True
    for name, data in (("pay_stub", PAY_STUB), ("state_id", STATE_ID), ("lease", LEASE)):
        started = time.monotonic()
        request = build_request(data, "application/pdf", frozenset(SCOPES), None)
        raw = await reader.read(request)
        kind, found = interpret(raw, paper_id=name, pages=len(pdf_pages_text(data)), scopes=frozenset(SCOPES), photo=False)
        took = time.monotonic() - started
        keys = {d.key for d in found}
        missing = expected[name] - keys
        good = kind == name and not missing and took < 15
        ok &= good
        print(f"\n{name}: read as {kind} in {took:.1f}s {'OK' if good else 'CHECK'}")
        for d in found:
            print(f"  {d.key:15} {d.value!r:32} page {d.page}  \"{d.snippet}\"")
        if missing:
            print("  missing:", sorted(missing))
    print("\nGO: phase 2 live reading passed." if ok else "\nNO-GO: see above.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
