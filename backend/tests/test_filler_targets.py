"""Filler phase 5: program targets, fill-and-stop on real sites, and the result in the plan.

The real-site test serves a stand-in form (the practice page) at an https host through
the run's allowlist route, so nothing leaves the machine. Skipped without Chrome.
"""

import os
import time

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.filler import runs as runs_module
from app.filler.consent import FillerSessions
from app.filler.jobs import PaperJobs
from app.filler.runs import PRACTICE_PAGE, FillRuns, SpikeRuns
from app.filler.service import Filler
from app.filler.targets import FillTarget, all_targets, enabled_targets
from app.main import create_app
from app.services.nessie import NessieService

CHANNEL = os.environ.get("LOCAL_BROWSER_CHANNEL", "chrome") or None
DETAILS = {
    "first_name": "Maya", "last_name": "Rivera", "date_of_birth": "04/07/1961", "phone": "413-555-0100",
    "street_address": "12 Elm Street", "city": "Amherst", "state": "MA", "zip": "01002",
    "household_size": "2", "monthly_income": "2600",
}
REAL = "hves-stand-in"
REAL_URL = "https://forms.filler.test/referral"


def test_shipped_targets_validate_and_real_sites_ship_disabled():
    targets = all_targets()
    assert targets and all(t.program_id for t in targets.values())
    real = [t for t in targets.values() if t.mode == "stop_before_submit"]
    assert real and not any(t.enabled for t in real)  # off until the team signs off
    assert set(enabled_targets()) == {pid for pid, t in targets.items() if t.enabled}


@pytest.mark.parametrize("record", [
    {"program_id": "x", "mode": "stop_before_submit"},  # no start URL
    {"program_id": "x", "mode": "stop_before_submit", "start_url": "http://a.test/", "allowed_hosts": ["a.test"]},
    {"program_id": "x", "mode": "stop_before_submit", "start_url": "https://a.test/", "allowed_hosts": ["b.test"]},
    {"program_id": "x", "mode": "practice", "start_url": "https://a.test/"},
])
def test_bad_targets_are_refused(record):
    with pytest.raises(ValidationError):
        FillTarget.model_validate(record)


playwright_api = pytest.importorskip("playwright.async_api")
from app.filler.sandbox import LocalBrowser  # noqa: E402

TARGETS = {
    "capv-fuel-assistance": FillTarget(program_id="capv-fuel-assistance", mode="practice"),
    REAL: FillTarget(program_id=REAL, mode="stop_before_submit", start_url=REAL_URL, allowed_hosts=["forms.filler.test"]),
    "off": FillTarget(program_id="off", mode="practice", enabled=False),
}


@pytest.fixture
def client(repo, monkeypatch):
    # The stand-in "real" site: the allowlist route serves the practice page at forms.filler.test.
    original = runs_module._allowlist

    def standin(hosts):
        inner = original(hosts)

        async def handle(route):
            if route.request.url.startswith(REAL_URL):
                await route.fulfill(status=200, content_type="text/html; charset=utf-8", body=PRACTICE_PAGE)
            elif "forms.filler.test" in route.request.url:
                await route.abort("blockedbyclient")
            else:
                await inner(route)

        return handle

    monkeypatch.setattr(runs_module, "_allowlist", standin)
    sessions = FillerSessions()
    runs = FillRuns(LocalBrowser(CHANNEL, headless=True), lambda i: None, sessions, wait_seconds=20, dwell=0,
                    targets=TARGETS)
    filler = Filler(sessions, PaperJobs(reader=None), SpikeRuns(browser=None, make_model=None), runs)
    with TestClient(create_app(repo, NessieService(None), filler=filler)) as test_client:
        yield test_client


def wait_for(client, url, statuses, timeout=20.0):
    deadline = time.monotonic() + timeout
    while True:
        view = client.get(url).json()
        if view["status"] in statuses:
            return view
        assert time.monotonic() < deadline, view
        time.sleep(0.05)


def session_with_details(client) -> str:
    sid = client.post("/api/sessions").json()["session_id"]
    client.post(f"/api/sessions/{sid}/filler/details/confirm", json={"edits": DETAILS})
    return sid


def test_snapshot_lists_the_programs_the_filler_can_fill(client):
    sid = client.post("/api/sessions").json()["session_id"]
    modes = client.app.state.automation_modes
    assert modes["capv-fuel-assistance"] == "practice" and modes[REAL] == "stop_before_submit"
    assert "off" not in modes
    assert client.get(f"/api/sessions/{sid}").status_code == 200


def test_unknown_or_disabled_programs_are_refused(client):
    sid = client.post("/api/sessions").json()["session_id"]
    for pid in ("off", "no-such-program"):
        response = client.post(f"/api/sessions/{sid}/filler/runs", json={"program_id": pid})
        assert response.status_code == 422 and response.json()["error"]["code"] == "not_fillable"


def test_a_programs_practice_run_lands_in_the_plan(client):
    sid = session_with_details(client)
    base = f"/api/sessions/{sid}/filler/runs"
    view = client.post(base, json={"program_id": "capv-fuel-assistance"}).json()
    url = f"{base}/{view['run_id']}"
    run = client.app.state.filler.runs.get(sid, view["run_id"])
    view = wait_for(client, url, {"needs_you"})

    async def person():
        page = run.computer.page
        await page.locator("#certify").check()
        await page.fill("#signature", "Maya Rivera")

    client.portal.call(person)
    client.post(f"{url}/control", json={"action": "return"})
    wait_for(client, url, {"review"})

    async def send():
        await run.computer.page.locator("#submit").click()

    client.portal.call(send)
    client.post(f"{url}/control", json={"action": "done"})
    view = wait_for(client, url, {"done"})
    assert view["program_id"] == "capv-fuel-assistance" and view["outcome"]["status"] == "submitted"
    deadline = time.monotonic() + 10
    while not client.get(url).json()["result_recorded"]:
        assert time.monotonic() < deadline
        time.sleep(0.05)
    record = client.get(f"/api/sessions/{sid}").json()["applications"]["capv-fuel-assistance"]
    assert record["status"] == "submitted" and record["confirmation"].startswith("PRACTICE-")


def test_real_site_fills_and_stops_before_anything_is_sent(client):
    sid = session_with_details(client)
    base = f"/api/sessions/{sid}/filler/runs"
    view = client.post(base, json={"program_id": REAL, "prepare": True}).json()
    url = f"{base}/{view['run_id']}"
    run = client.app.state.filler.runs.get(sid, view["run_id"])
    view = wait_for(client, url, {"ready"})
    assert view["mode"] == "stop_before_submit"
    client.post(f"{url}/control", json={"action": "go"})

    # Page 3's certify box is an attestation: on a real site that is the stop point.
    view = wait_for(client, url, {"review"})
    assert view["message"].startswith("The form is filled in up to the point of sending")
    assert {f["key"] for f in view["filled"]} == set(DETAILS)

    # Read-only: the person's clicks don't reach a real form at the stop point.
    async def boxes():
        page = run.computer.page
        box = await page.locator("#submit").bounding_box()
        return box, await page.locator("#certify").is_checked()

    box, ticked = client.portal.call(boxes)
    with client.websocket_connect(f"{url}/live") as ws:
        ws.send_json({"type": "mouse", "action": "click", "x": int(box["x"] + 5), "y": int(box["y"] + 5)})
        time.sleep(0.4)
    assert client.portal.call(boxes)[1] is ticked is False
    assert client.post(f"{url}/control", json={"action": "return"}).status_code == 409

    client.post(f"{url}/control", json={"action": "done"})
    view = wait_for(client, url, {"done"})
    assert view["outcome"]["status"] == "not_submitted"
    assert view["message"] == "Stopped before sending, as planned. Nothing was sent."
    deadline = time.monotonic() + 10
    while not client.get(url).json()["result_recorded"]:
        assert time.monotonic() < deadline
        time.sleep(0.05)
    assert client.get(f"/api/sessions/{sid}").json()["applications"][REAL]["status"] == "stopped"


def test_a_real_site_cannot_be_left(client):
    """Navigation off the allowed hosts is aborted by the route, whatever asks for it."""
    sid = session_with_details(client)
    base = f"/api/sessions/{sid}/filler/runs"
    view = client.post(base, json={"program_id": REAL, "prepare": True}).json()
    url = f"{base}/{view['run_id']}"
    run = client.app.state.filler.runs.get(sid, view["run_id"])
    wait_for(client, url, {"ready"})

    async def leave():
        page = run.computer.page
        try:
            await page.goto("https://elsewhere.test/", timeout=5000)
        except Exception as exc:
            return type(exc).__name__, page.url
        return None, page.url

    error, where = client.portal.call(leave)
    assert error is not None and where.startswith(REAL_URL)
    client.post(f"{url}/stop")


# -- fillable PDFs ---------------------------------------------------------------------

import io  # noqa: E402

from pypdf import PdfReader  # noqa: E402

from app.filler.pdf import inspect, render_html  # noqa: E402
from app.filler.extract import PaperRejected  # noqa: E402
from tests.filler_samples import PAY_STUB, make_fillable_pdf  # noqa: E402


def test_pdf_fields_are_read_with_their_tooltips_and_flat_pdfs_refused():
    fields = inspect(make_fillable_pdf())
    assert [(f.kind, f.label) for f in fields] == [
        ("text", "First name"), ("text", "Last name"), ("text", "Date of birth"), ("text", "Phone number"),
        ("text", "ZIP code"), ("check", "I certify the information is true"), ("signature", "Applicant signature")]
    page = render_html(fields)
    assert 'name="c1_certify[0]" required' in page and "you sign this in your PDF app" in page
    with pytest.raises(PaperRejected):
        inspect(PAY_STUB)  # a flat PDF: nothing to fill


def test_a_fillable_pdf_is_filled_live_and_written_back(client):
    sid = session_with_details(client)
    base = f"/api/sessions/{sid}/filler"
    added = client.post(f"{base}/pdf-forms", files={"file": ("form.pdf", make_fillable_pdf())}, data={"title": "Fuel help form"})
    assert added.status_code == 201 and len(added.json()["fields"]) == 7
    view = client.post(f"{base}/runs", json={"pdf_form_id": added.json()["pdf_form_id"], "prepare": True}).json()
    url = f"{base}/runs/{view['run_id']}"
    run = client.app.state.filler.runs.get(sid, view["run_id"])
    view = wait_for(client, url, {"ready"})
    assert view["mode"] == "pdf"
    assert {r["key"] for r in view["plan"] if r["how"] == "fill"} == {"first_name", "last_name", "date_of_birth", "phone", "zip"}
    client.post(f"{url}/control", json={"action": "go"})

    view = wait_for(client, url, {"needs_you"})  # the certify box is the person's
    assert view["handoff"]["reason"] == "attestation"

    async def tick():
        await run.computer.page.locator('[name="c1_certify[0]"]').check()

    client.portal.call(tick)
    client.post(f"{url}/control", json={"action": "return"})
    wait_for(client, url, {"review"})
    assert client.get(f"{url}/pdf").status_code == 404  # not before the person finishes
    client.post(f"{url}/control", json={"action": "done"})
    view = wait_for(client, url, {"done"})
    assert view["pdf_ready"] and "Sign it in your PDF app" in view["message"]

    response = client.get(f"{url}/pdf")
    assert response.headers["content-type"] == "application/pdf"
    values = {k: v.get("/V") for k, v in PdfReader(io.BytesIO(response.content)).get_fields().items()}
    assert values["f1_applicant[0]"] == "Maya" and values["f4_tel[0]"] == "413-555-0100"
    assert values["f3_dob[0]"] == "04/07/1961" and values["f5_zip[0]"] == "01002"
    assert values["c1_certify[0]"] == "/Yes"
    assert not values.get("s1_sig[0]")  # signatures are never typed for the person
    other = client.post("/api/sessions").json()["session_id"]
    assert client.get(f"/api/sessions/{other}/filler/runs/{view['run_id']}/pdf").status_code == 404
