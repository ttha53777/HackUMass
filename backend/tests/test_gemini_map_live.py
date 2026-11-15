"""gemini_map against real Gemini (opt-in rehearsal, never in CI).

Run: cd backend && set -a && . ./.env && set +a && RUN_LIVE_GEMINI=1 .venv/bin/pytest -s tests/test_gemini_map_live.py

Only the practice forms' field labels go to Gemini (never a value). Checks that
Gemini's label map equals the curated map on every step of both forms, how long
each call takes against the 8 s fallback, and that a full run fills the golden
values without falling back.
"""

import asyncio
import os
import time
from dataclasses import replace

import pytest

pytest.importorskip("playwright.async_api")
if os.environ.get("RUN_LIVE_GEMINI") != "1" or not os.environ.get("GEMINI_API_KEY"):
    pytest.skip("live Gemini rehearsal: set RUN_LIVE_GEMINI=1 and GEMINI_API_KEY", allow_module_level=True)

from playwright.async_api import async_playwright  # noqa: E402

from app.execution.config import FORM_PAGES_DIR, form_manifest  # noqa: E402
from app.execution.fill import MAP_TIMEOUT_SECONDS, GeminiMapModel, gemini_label_reader  # noqa: E402

FORMS = ["fuel-renewal", "food-application"]
CHANNEL = os.environ.get("LOCAL_BROWSER_CHANNEL", "chrome") or None


async def _map_every_step(form_id: str):
    manifest = form_manifest(form_id)
    html = (FORM_PAGES_DIR / f"{form_id}.html").read_text()
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel=CHANNEL, headless=True)
        page = await browser.new_page()
        await page.set_content(html)
        notes: list[str] = []
        model = GeminiMapModel(lambda: page, manifest, notes.append, llm=gemini_label_reader(os.environ["GEMINI_API_KEY"]))
        for index, step in enumerate(manifest.steps):
            if not step.fields:
                continue
            # Show this step only, the way the form does after Next.
            await page.evaluate("(n) => document.querySelectorAll('[data-panel]').forEach(s => s.hidden = s.dataset.panel !== String(n))", index + 1)
            started = time.monotonic()
            mapped = await asyncio.wait_for(model._map(step), timeout=30)
            seconds = time.monotonic() - started
            results.append((index + 1, seconds, mapped, [(f.selector, f.key) for f in step.fields]))
        await browser.close()
    return results


@pytest.mark.parametrize("form_id", FORMS)
def test_gemini_maps_every_label_like_the_curated_map(form_id):
    for step, seconds, mapped, saved in asyncio.run(_map_every_step(form_id)):
        print(f"\n{form_id} step {step}: {seconds:.1f}s, {len(mapped or [])}/{len(saved)} fields")
        assert mapped is not None, f"step {step}: Gemini gave no usable answer"
        missing = sorted(set(saved) - set(mapped))
        extra = sorted(set(mapped) - set(saved))
        assert not missing and not extra, f"step {step}: missing {missing}, extra {extra}"
        assert seconds < MAP_TIMEOUT_SECONDS, f"step {step} took {seconds:.1f}s; the run would fall back"


@pytest.mark.parametrize("form_id", FORMS)
def test_a_full_gemini_map_run_fills_the_golden_values_without_falling_back(form_id, monkeypatch):
    from tests import test_paper_to_form as base

    async def person(page, reason):
        values = await base._form_values(page)
        if form_id == "fuel-renewal":
            await page.check("input[name=heating_fuel][value=Electric]")
        await page.check("#certify")
        await page.fill("#signature", "Maya Rivera")
        await page.click("#submit")
        return reason, values

    import app.execution.manager as m

    real = m.ExecutionManager.__init__

    def init(self, provider, settings, **kw):
        real(self, provider, replace(settings, form_engine="gemini_map", gemini_api_key=os.environ["GEMINI_API_KEY"]), **kw)

    monkeypatch.setattr(m.ExecutionManager, "__init__", init)
    started = time.monotonic()
    with base.forms_server() as url:
        run, questions, seen = asyncio.run(base._run(url, form_id, person))
    print(f"\n{form_id}: full run {time.monotonic() - started:.0f}s")
    assert run.status == "done", run.message
    notes = [s.text for s in run.steps if s.kind == "note"]
    assert not any("saved map" in n for n in notes), notes
    assert any(n.startswith("Gemini read the labels") for n in notes)
    manifest = form_manifest(form_id)
    expected = {k: base.GOLDEN[k] for k in manifest.keys(True) + manifest.keys(False)}
    assert {k: v for k, v in seen[0][1].items() if k in expected} == expected
    assert run.outcome.status == "submitted"
