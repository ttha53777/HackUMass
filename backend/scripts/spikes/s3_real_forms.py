"""Spike S3: open each candidate real form and record whether it loads or shows a bot wall.

    cd backend && .venv/bin/python scripts/spikes/s3_real_forms.py          # Steel (datacenter IP)
    cd backend && .venv/bin/python scripts/spikes/s3_real_forms.py --local  # this machine, for comparison

Read-only: it never clicks or types. URLs come only from the curated program
records. Prints a Markdown table to paste into docs/browser-agent-plan.md.
"""

import asyncio
import re
import sys

from _env import load_env

CANDIDATES = [
    "asc-food-pantry", "capv-weatherization", "hves-home-delivered-meals",
    "fbwm-snap-application-assistance", "eversource-ma-discount-rate", "capv-fuel-assistance",
]
WALL = re.compile(r"captcha|are you a robot|verify you are human|access denied|unusual traffic|cloudflare", re.I)


async def probe(provider, program) -> str:
    from app.execution.config import RunTarget, host_of

    url = program.apply_url or program.info_url
    target = RunTarget(program.id, "stop_before_submit", url, frozenset({host_of(url)}))
    try:
        session = await provider.open(target)
    except Exception as exc:
        return f"| {program.id} | {host_of(url)} | did not open ({exc.__class__.__name__}) | | |"
    try:
        await asyncio.sleep(4)  # let client-side forms render
        page = session.computer._page  # type: ignore[attr-defined]
        text = await session.computer.page_text()
        fields = await page.locator("input:visible, textarea:visible, select:visible").count()
        frames = [f.url for f in page.frames if "captcha" in f.url]
        wall = "yes" if WALL.search(text) or frames else "no"
        return f"| {program.id} | {host_of(url)} | {(await page.title()).replace('|', '/')[:40]} | {fields} | {wall} |"
    finally:
        await session.close()


async def main() -> None:
    load_env()
    from app.execution.config import AgentSettings
    from app.execution.provider import LocalProvider, SteelProvider
    from app.services.programs_repo import repository_from_env

    settings = AgentSettings.from_env()
    local = "--local" in sys.argv
    provider = LocalProvider(settings.local_channel, True) if local else SteelProvider(settings.steel_api_key)
    repo = repository_from_env("curated")
    print(f"Host: {'local' if local else 'Steel'}\n")
    print("| program | host | page title | visible fields | bot wall |\n|---|---|---|---|---|")
    for program_id in CANDIDATES:
        print(await probe(provider, repo.get(program_id)))


if __name__ == "__main__":
    asyncio.run(main())
