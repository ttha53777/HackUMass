"""Papers to forms, end to end, offline: the details the demo papers give fill the
practice forms exactly (docs/document-to-form-demo-plan.md, sections 3.5 and 9).

Real manager, LocalProvider (headless Chrome) and the manifest engine, with no
model at all (LLM_MODE=off, no GEMINI_API_KEY). Skipped when Playwright or a
browser isn't installed.
"""

import asyncio
import contextlib
import http.server
import json
import logging
import os
import re
import threading
import time
from pathlib import Path

import pytest

pytest.importorskip("playwright.async_api")

from app.execution.config import FORM_PAGES_DIR, AgentSettings, RunTarget, form_manifest  # noqa: E402
from app.execution.fields import add_device_details, store_from_profile  # noqa: E402
from app.execution.manager import ExecutionManager  # noqa: E402
from app.execution.provider import LocalProvider  # noqa: E402
from app.graph.state import AnswerIn  # noqa: E402
from tests.conftest import make_profile  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SOURCE = json.loads((ROOT / "backend/tests/fixtures/demo_person.json").read_text())
DETAILS_BY_PAPER = json.loads((ROOT / "backend/tests/fixtures/demo_papers_expected.json").read_text())["details"]
CHANNEL = os.environ.get("LOCAL_BROWSER_CHANNEL", "chrome") or None
ASKED = SOURCE["form_extra"]["best_time_to_call"]

# What the person's device holds after "Add all demo papers" and confirming My details,
# and which paper each detail came from (the first paper that states it).
DEVICE: dict[str, str] = {}
SOURCES: dict[str, str] = {}
for paper in SOURCE["papers"]:
    for key, value in DETAILS_BY_PAPER[paper["file"]].items():
        DEVICE.setdefault(key, value)
        SOURCES.setdefault(key, "your " + paper["file"].replace("-", " "))

# The golden fill sheet: papers, plus the profile (household confirmed at 3, income
# combined to $2,290, city and state from the ZIP), plus the one asked answer.
GOLDEN = {**DEVICE, "household_size": "3", "monthly_income": "2,290", "city": "Amherst", "state": "MA",
          "zip": "01002", "best_time_to_call": ASKED}


@contextlib.contextmanager
def forms_server():
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            form_id = self.path.strip("/").removeprefix("practice/")
            page = FORM_PAGES_DIR / f"{form_id}.html"
            body = page.read_bytes() if self.path.startswith("/practice/") and page.is_file() else b""
            self.send_response(200 if body else 404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()


async def _form_values(page) -> dict[str, str]:
    return await page.evaluate(
        "() => Object.fromEntries([...document.querySelectorAll('input[data-key]')].map(e => [e.dataset.key, e.value]))"
    )


async def _run(base: str, form_id: str, person):
    """One run. `person(page, reason)` acts during each handoff and returns what it saw."""
    provider = LocalProvider(CHANNEL, headless=True, settle_seconds=0.05)
    settings = AgentSettings("local", "", "m", "", "", CHANNEL, True, form_engine="manifest")
    profile = make_profile(zip="01002", household_size=3, monthly_income=2290)
    store = store_from_profile(profile, {"01002": {"city": "Amherst", "state": "MA"}}.get)
    add_device_details(store, DEVICE, SOURCES)
    manager = ExecutionManager(provider, settings)  # no model factory: the engine follows the form
    target = RunTarget("p", "practice", f"{base}/practice/{form_id}/", frozenset({"127.0.0.1"}), form_id)
    run = manager.start("s1", target, store)
    questions, seen, started = [], [], time.monotonic()
    while run.active and time.monotonic() - started < 120:
        if run.status == "needs_answer":
            questions.append(run.question_key)
            manager.answer(run, AnswerIn(question_id=f"agent:{run.question_key}", text=ASKED))
        elif run.status == "needs_you":
            seen.append(await person(provider.sessions[-1].page, run.handoff_reason))
            manager.control(run, "return")
        await asyncio.sleep(0.05)
    if run.status == "failed" and "browser" in (run.message or ""):
        pytest.skip("no browser available")
    await asyncio.wait({run.task}, timeout=10)
    return run, questions, seen


def _texts(run) -> list[str]:
    return [s.text for s in run.steps]


@pytest.fixture
def offline(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "off")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


def test_fuel_renewal_is_filled_from_the_papers_and_the_person_sends_it(offline, caplog):
    async def person(page, reason):
        values = await _form_values(page)
        submit_hidden = await page.locator("#submit").is_hidden()
        await page.check("input[name=heating_fuel][value=Electric]")
        await page.check("#certify")
        await page.fill("#signature", "Maya Rivera")
        await page.click("#submit")
        return reason, values, submit_hidden

    caplog.set_level(logging.DEBUG)
    with forms_server() as base:
        run, questions, seen = asyncio.run(_run(base, "fuel-renewal", person))

    assert run.status == "done", run.message
    assert questions == ["best_time_to_call"]  # the one thing no paper covers
    assert len(seen) == 1  # one takeover covers the fuel choice, the certify box and the signature
    reason, values, submit_hidden = seen[0]
    assert reason == "attestation" and not submit_hidden  # the agent stopped at the certify box
    expected = {k: GOLDEN[k] for k in form_manifest("fuel-renewal").keys(True) + form_manifest("fuel-renewal").keys(False)}
    assert {k: v for k, v in values.items() if k in expected} == expected
    assert run.outcome.status == "submitted" and run.outcome.confirmation_text.startswith("PRACTICE-FUEL-")

    texts = _texts(run)
    assert "Typed your account number (from your electric bill)" in texts
    assert "Typed your Fuel Assistance number (from your fuel assistance letter)" in texts
    assert "Typed your household size (from your answers)" in texts
    assert "Typed your best time to reach you (you told us)" in texts
    assert not any("Submit" in t for t in texts)  # the agent never pressed Submit
    _no_value_leaked(run, caplog)


def test_food_application_fills_four_steps_and_never_types_a_social_security_number(offline, caplog):
    async def person(page, reason):
        values = await _form_values(page)
        ssn = await page.input_value("#ssn")
        await page.check("#certify")
        await page.fill("#signature", "Maya Rivera")
        await page.click("#submit")
        return reason, values, ssn

    caplog.set_level(logging.DEBUG)
    with forms_server() as base:
        run, questions, seen = asyncio.run(_run(base, "food-application", person))

    assert run.status == "done", run.message
    assert questions == ["best_time_to_call"]
    assert len(seen) == 1
    reason, values, ssn = seen[0]
    assert reason == "sensitive_field" and ssn == ""  # handed over at the SSN field, empty
    manifest = form_manifest("food-application")
    expected = {k: GOLDEN[k] for k in manifest.keys(True) + manifest.keys(False)}
    assert {k: v for k, v in values.items() if k in expected} == expected
    assert run.outcome.status == "submitted" and run.outcome.confirmation_text.startswith("PRACTICE-FOOD-")
    texts = _texts(run)
    assert "Typed your employer (from your pay stub)" in texts
    assert "Typed your other income's recipient (from your benefit letter)" in texts
    _no_value_leaked(run, caplog)


def _whole(value: str, text: str) -> bool:
    """`value` appears on its own, not inside another number or a timestamp (…:18.512)."""
    return re.search(rf"(?<![\w.:/-]){re.escape(value)}(?![\w/]|\.\d)", text) is not None


def _no_value_leaked(run, caplog):
    logged = caplog.text + json.dumps(run.view().model_dump(mode="json"))
    for key, value in GOLDEN.items():
        if len(value) >= 4 and value not in ("Electric",):
            assert not _whole(value, logged), f"{key} leaked into a log or the run view"
    assert run.store.known() == set()  # wiped when the run ended


# ---------------------------------------------------------------------------
# gemini_map: Gemini reads the labels (here a fake), code fills the form
# ---------------------------------------------------------------------------

LABEL_WORDS = [  # label text -> key, the way a model would read the fuel form (most specific first)
    ("person 2 name", "member_2_name"), ("person 2 relationship", "member_2_relation"), ("person 2 date", "member_2_dob"),
    ("person 3 name", "member_3_name"), ("person 3 relationship", "member_3_relation"), ("person 3 date", "member_3_dob"),
    ("application number", "liheap_number"), ("full name", "full_name"), ("date of birth", "date_of_birth"),
    ("street", "street_address"), ("city", "city"), ("state", "state"), ("zip", "zip"), ("phone", "phone"),
    ("best time", "best_time_to_call"), ("how many", "household_size"),
    ("company", "utility_company"), ("account number", "utility_account_number"), ("rent ($)", "monthly_rent"),
    ("heat included", "heat_included"), ("household income", "monthly_income"),
]


class LabelReader:
    """Plays Gemini for the label map. Records prompts to prove no value is sent."""

    def __init__(self, fail=False):
        self.fail, self.prompts = fail, []

    def generate_json(self, prompt, schema):
        self.prompts.append(prompt)
        if self.fail:
            return None
        labels = prompt.split("Labels:\n", 1)[1].splitlines()
        matches = []
        for line in labels:
            index, _, label = line.partition(". ")
            key = next((k for words, k in LABEL_WORDS if words in label.lower()), None)
            if label.lower().startswith("signature"):
                key = "full_name"  # a hostile or confused answer: the gate must still hand it off
            matches.append({"index": int(index), "key": key})
        return schema.model_validate({"matches": matches})


@pytest.mark.parametrize("fail", [False, True], ids=["mapped", "falls-back"])
def test_gemini_map_fills_the_same_values_and_falls_back_to_the_saved_map(offline, monkeypatch, fail):
    reader = LabelReader(fail=fail)
    monkeypatch.setattr("app.services.llm.get_llm", lambda: reader)

    async def person(page, reason):
        values = await _form_values(page)
        signature = await page.input_value("#signature")
        await page.check("input[name=heating_fuel][value=Electric]")
        await page.check("#certify")
        await page.fill("#signature", "Maya Rivera")
        await page.click("#submit")
        return reason, values, signature

    async def go(base):
        import app.execution.manager as m

        real = m.ExecutionManager.__init__

        def init(self, provider, settings, **kw):
            from dataclasses import replace

            real(self, provider, replace(settings, form_engine="gemini_map"), **kw)

        monkeypatch.setattr(m.ExecutionManager, "__init__", init)
        return await _run(base, "fuel-renewal", person)

    with forms_server() as base:
        run, questions, seen = asyncio.run(go(base))

    assert run.status == "done", run.message
    reason, values, signature = seen[0]
    assert reason == "attestation" and signature == ""
    manifest = form_manifest("fuel-renewal")
    expected = {k: GOLDEN[k] for k in manifest.keys(True) + manifest.keys(False)}
    assert {k: v for k, v in values.items() if k in expected} == expected
    notes = [s.text for s in run.steps if s.kind == "note"]
    if fail:
        assert notes.count("Gemini didn't answer in time, so this step used the saved map") == 2
    else:
        assert "Gemini read the labels on step 1 and matched 16 fields" in notes
    assert len(reader.prompts) == 2  # one call per step
    sent = "\n".join(reader.prompts)
    # Allowed: words already on the page ("Electric") or in our fixed prompt ("Social Security number").
    from app.execution.fill import MAP_INSTRUCTIONS, _sheet

    known = (FORM_PAGES_DIR / "fuel-renewal.html").read_text() + MAP_INSTRUCTIONS + _sheet()
    assert [k for k, v in GOLDEN.items() if len(v) >= 4 and _whole(v, sent) and v not in known] == []
