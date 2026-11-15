"""Filler phase 2: consent, reading papers into details, and the one-tap confirm.

A fake reader stands in for Gemini and counts its calls, so the key promise is
checked directly: a paper without consent is never sent to a model.
"""

import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from app.filler.consent import FillerSession, FillerSessions
from app.filler.extract import RawField, RawReading, ReadRequest, interpret, mask
from app.filler.jobs import PaperJobs
from app.filler.models import SCOPES
from app.filler.runs import SpikeRuns
from app.filler.service import Filler
from app.main import create_app
from app.services.nessie import NessieService
from tests.filler_samples import LEASE, PAY_STUB, STATE_ID, TINY_PNG

ALL = frozenset(SCOPES)


class FakeReader:
    """Answers like Gemini would for the sample papers, plus some junk it must not keep."""

    def __init__(self, hold: asyncio.Event | None = None) -> None:
        self.requests: list[ReadRequest] = []
        self.hold = hold

    async def read(self, request: ReadRequest) -> RawReading:
        self.requests.append(request)
        if self.hold is not None:
            await self.hold.wait()
        text = "\n".join(request.pages_text or [])
        if "PAY STUB" in text:
            return RawReading(kind="pay_stub", fields=[
                RawField(key="full_name", value="Maya Rivera", page=1, snippet="Employee: Maya Rivera"),
                RawField(key="street_address", value="12 Elm Street", page=1, snippet="Address: 12 Elm Street"),
                RawField(key="city", value="Amherst", page=1, snippet="Amherst, MA 01002"),
                RawField(key="state", value="MA", page=1, snippet="Amherst, MA 01002"),
                RawField(key="zip", value="01002", page=1, snippet="Amherst, MA 01002"),
                RawField(key="employer", value="Pioneer Valley Bakery", page=1, snippet="Pioneer Valley Bakery"),
                RawField(key="monthly_income", value="2600", page=1, snippet="Gross pay per month: $2,600.00"),
                RawField(key="date_of_birth", value="04/07/1961", page=1),  # not on a pay stub: dropped
                RawField(key="ssn", value="123-45-6789", page=1),  # no such key: dropped
            ])
        if "IDENTIFICATION" in text:
            return RawReading(kind="state_id", fields=[
                RawField(key="full_name", value="RIVERA, MAYA", page=1, snippet="Name: RIVERA, MAYA"),
                RawField(key="date_of_birth", value="04/07/1961", page=1, snippet="Date of birth: 04/07/1961"),
                RawField(key="zip", value="1002", page=1),  # invalid: dropped
            ])
        if "LEASE" in text:
            return RawReading(kind="lease", fields=[
                RawField(key="monthly_rent", value="$1,150.00", page=2, snippet="Monthly rent: $1,150.00"),
                RawField(key="household_size", value="2", page=2, snippet="Occupants: 2 people"),
                RawField(key="landlord_name", value="Hilltop Property Management", page=1, snippet="Landlord: Hilltop"),
                RawField(key="monthly_income", value="5000", page=1),  # not on a lease: dropped
            ])
        return RawReading(kind="state_id", fields=[
            RawField(key="date_of_birth", value="04/07/1961", page=1, snippet="DOB 04/07/1961", box=[100, 200, 140, 600]),
        ])


@pytest.fixture
def reader():
    return FakeReader()


@pytest.fixture
def client(repo, reader):
    filler = Filler(FillerSessions(), PaperJobs(reader), SpikeRuns(browser=None, make_model=None))
    with TestClient(create_app(repo, NessieService(None), filler=filler)) as test_client:
        test_client.filler = filler
        yield test_client


def new_session(client) -> str:
    return client.post("/api/sessions").json()["session_id"]


def url(session_id: str, path: str) -> str:
    return f"/api/sessions/{session_id}/filler{path}"


def upload(client, session_id, data, name="paper.pdf", kind=""):
    response = client.post(url(session_id, "/papers"), files={"file": (name, data)}, data={"kind": kind})
    assert response.status_code == 201, response.text
    return response.json()["paper_id"]


def settled(client, session_id, timeout=5.0) -> dict:
    deadline = time.monotonic() + timeout
    while True:
        state = client.get(url(session_id, "/state")).json()
        if all(p["status"] not in ("queued", "reading") for p in state["papers"]):
            return state
        assert time.monotonic() < deadline, state
        time.sleep(0.02)


def details(state) -> dict:
    return {d["key"]: d for d in state["details"]}


# -- consent ---------------------------------------------------------------------


def test_a_paper_without_consent_is_never_sent_to_a_model(client, reader):
    sid = new_session(client)
    paper_id = upload(client, sid, PAY_STUB)
    state = settled(client, sid)
    assert reader.requests == []  # zero model calls
    assert state["papers"][0]["status"] == "waiting" and not state["papers"][0]["can_read"]
    assert state["details"] == []
    assert client.filler.sessions.get(sid).papers[paper_id].data is not None  # held, unread, for this session only


def test_auto_read_reads_on_upload_and_details_are_ready(client, reader):
    sid = new_session(client)
    assert client.put(url(sid, "/auto-read"), json={"on": True}).json()["auto_read"]["on"] is True
    paper_id = upload(client, sid, PAY_STUB)
    state = settled(client, sid)
    paper = state["papers"][0]
    assert paper["status"] == "done" and paper["kind"] == "pay_stub" and paper["found"] == 9
    found = details(state)
    assert found["monthly_income"]["value"] == "2,600"
    assert found["first_name"]["value"] == "Maya" and found["last_name"]["value"] == "Rivera"  # from full name
    assert "date_of_birth" not in found  # a pay stub doesn't give it
    assert all(d["status"] == "proposed" and d["page"] == 1 and d["source_label"] == "your pay stub"
               for d in state["details"])
    assert state["unconfirmed"] == len(state["details"])
    assert client.filler.jobs.read_seconds[paper_id] < 15  # spec target, with the fake reader
    assert client.filler.sessions.get(sid).papers[paper_id].data is None  # read once, bytes dropped


def test_ssn_and_long_numbers_are_masked_before_the_model_sees_the_text(client, reader):
    sid = new_session(client)
    client.put(url(sid, "/auto-read"), json={"on": True})
    upload(client, sid, PAY_STUB)
    settled(client, sid)
    sent = "\n".join(reader.requests[0].pages_text)
    assert "123-45-6789" not in sent and "[hidden]" in sent
    assert "Maya Rivera" in sent
    assert reader.requests[0].data is None  # text path: the file itself is not sent


def test_three_sample_papers_give_confirmed_details_with_their_source(client, reader):
    """Phase 2 gate: pay stub, state ID and lease yield confirmed details, each with page and snippet."""
    sid = new_session(client)
    ids = [upload(client, sid, PAY_STUB), upload(client, sid, STATE_ID), upload(client, sid, LEASE)]
    for paper_id in ids:  # each paper's own switch
        assert client.put(url(sid, f"/consents/{paper_id}"), json={}).status_code == 200
    state = settled(client, sid)
    assert [p["kind"] for p in state["papers"]] == ["pay_stub", "state_id", "lease"]
    assert len(reader.requests) == 3

    confirmed = client.post(url(sid, "/details/confirm"), json={}).json()  # the one tap: "All correct"
    found = details(confirmed)
    assert confirmed["unconfirmed"] == 0
    assert all(d["status"] == "confirmed" and d["page"] and d["snippet"] for d in confirmed["details"])
    assert found["date_of_birth"]["value"] == "04/07/1961" and found["date_of_birth"]["paper_kind"] == "state_id"
    assert found["monthly_rent"]["page"] == 2 and found["household_size"]["value"] == "2"
    # Whichever paper was read first keeps its full name; the other never replaces it.
    assert (found["full_name"]["value"], found["full_name"]["paper_kind"]) in {
        ("Maya Rivera", "pay_stub"), ("RIVERA, MAYA", "state_id")}
    assert found["first_name"]["value"] == "Maya" and found["last_name"]["value"] == "Rivera"
    assert set(client.filler.sessions.get(sid).confirmed()) == set(found)


def test_photo_is_sent_as_a_file_and_keeps_its_box(client, reader):
    sid = new_session(client)
    client.put(url(sid, "/auto-read"), json={"on": True})
    upload(client, sid, TINY_PNG, name="id.png")
    state = settled(client, sid)
    assert reader.requests[0].data == TINY_PNG and reader.requests[0].pages_text is None
    assert details(state)["date_of_birth"]["box"] == [100, 200, 140, 600]


def test_switching_a_paper_off_removes_what_was_read_from_it(client):
    sid = new_session(client)
    pay = upload(client, sid, PAY_STUB)
    lease = upload(client, sid, LEASE)
    for paper_id in (pay, lease):
        client.put(url(sid, f"/consents/{paper_id}"), json={})
    settled(client, sid)
    state = client.delete(url(sid, f"/consents/{pay}")).json()
    found = details(state)
    assert "monthly_income" not in found and "monthly_rent" in found
    assert state["papers"][0]["can_read"] is False and state["papers"][0]["found"] == 0


def test_switch_off_mid_read_discards_the_answer(repo):
    hold = asyncio.Event()
    reader = FakeReader(hold)
    filler = Filler(FillerSessions(), PaperJobs(reader), SpikeRuns(browser=None, make_model=None))
    with TestClient(create_app(repo, NessieService(None), filler=filler)) as client:
        sid = new_session(client)
        paper_id = upload(client, sid, PAY_STUB)
        client.put(url(sid, f"/consents/{paper_id}"), json={})
        deadline = time.monotonic() + 5
        while not reader.requests:
            assert time.monotonic() < deadline
            time.sleep(0.02)
        client.delete(url(sid, f"/consents/{paper_id}"))
        client.portal.call(hold.set)
        state = settled(client, sid)
        assert state["details"] == [] and state["papers"][0]["status"] == "waiting"


def test_turning_auto_read_off_takes_back_its_consent_but_keeps_typed_details(client):
    sid = new_session(client)
    client.put(url(sid, "/auto-read"), json={"on": True})
    auto = upload(client, sid, PAY_STUB)
    own = upload(client, sid, LEASE)
    client.put(url(sid, f"/consents/{own}"), json={})  # this one has its own switch too
    settled(client, sid)
    client.post(url(sid, "/details/confirm"), json={"edits": {"phone": "(413) 555-0100"}})
    state = client.put(url(sid, "/auto-read"), json={"on": False}).json()
    found = details(state)
    assert "monthly_income" not in found  # from the auto-read pay stub
    assert "monthly_rent" in found  # the lease kept its own switch
    assert found["phone"]["value"] == "413-555-0100" and found["phone"]["source"] == "typed"
    papers = {p["paper_id"]: p for p in state["papers"]}
    assert papers[auto]["can_read"] is False and papers[own]["can_read"] is True


def test_confirm_edits_are_all_or_nothing(client):
    sid = new_session(client)
    bad = client.post(url(sid, "/details/confirm"), json={"edits": {"zip": "01002", "phone": "12"}})
    assert bad.status_code == 422 and "phone number" in bad.json()["error"]["message"]
    assert client.get(url(sid, "/state")).json()["details"] == []
    assert client.post(url(sid, "/details/confirm"), json={"keys": ["ssn"]}).status_code == 422


def test_narrowing_scopes_drops_details_outside_them(client):
    sid = new_session(client)
    pay = upload(client, sid, PAY_STUB)
    client.put(url(sid, f"/consents/{pay}"), json={})
    settled(client, sid)
    state = client.put(url(sid, f"/consents/{pay}"), json={"scopes": ["identity"]}).json()
    assert set(details(state)) == {"full_name", "first_name", "last_name"}


def test_sessions_are_isolated_and_must_exist(client):
    a, b = new_session(client), new_session(client)
    client.post(url(a, "/details/confirm"), json={"edits": {"zip": "01002"}})
    assert client.get(url(b, "/state")).json()["details"] == []
    assert client.get(url("no-such-session", "/state")).status_code == 404
    paper = upload(client, a, PAY_STUB)
    assert client.put(url(b, f"/consents/{paper}"), json={}).status_code == 404


def test_unsupported_and_oversized_files_are_refused(client):
    sid = new_session(client)
    response = client.post(url(sid, "/papers"), files={"file": ("a.txt", b"hello")})
    assert response.status_code == 415
    response = client.post(url(sid, "/papers"), files={"file": ("a.pdf", b"%PDF-" + b"0" * (10 * 1024 * 1024))})
    assert response.status_code == 415


def test_state_responses_are_not_cached(client):
    sid = new_session(client)
    assert client.get(url(sid, "/state")).headers["cache-control"] == "no-store"


# -- pure pieces -----------------------------------------------------------------


def test_interpret_keeps_only_allowed_and_valid_values():
    raw = RawReading(kind="pay_stub", fields=[
        RawField(key="monthly_income", value="2600"),
        RawField(key="monthly_income", value="9999"),  # duplicate: first wins
        RawField(key="employer", value="Acme 123-45-6789"),  # SSN-like inside: dropped
        RawField(key="zip", value="01002-1234"),
        RawField(key="full_name", value="{{first_name}}"),  # placeholder injection: dropped
        RawField(key="street_address", value="1 Main St", page=7),  # page out of range: kept, page unset
    ])
    kind, found = interpret(raw, paper_id="p", pages=1, scopes=ALL, photo=False)
    by_key = {d.key: d for d in found}
    assert kind == "pay_stub"
    assert by_key["monthly_income"].value == "2,600"
    assert "employer" not in by_key and "full_name" not in by_key
    assert by_key["zip"].value == "01002-1234"
    assert by_key["street_address"].page is None


def test_interpret_respects_scopes_and_unknown_kinds():
    raw = RawReading(kind="pay_stub", fields=[RawField(key="monthly_income", value="2600"),
                                              RawField(key="full_name", value="Maya Rivera")])
    _, found = interpret(raw, paper_id="p", pages=1, scopes=frozenset({"identity"}), photo=False)
    assert {d.key for d in found} == {"full_name", "first_name", "last_name"}
    kind, found = interpret(RawReading(kind="tax_return", fields=raw.fields), paper_id="p", pages=1, scopes=ALL, photo=False)
    assert kind == "other" and found == []


def test_mask_hides_ssns_and_long_numbers_but_not_phones():
    assert mask("SSN 123-45-6789 card 4111 1111 1111 1111 zip 01002") == "SSN [hidden] card [hidden] zip 01002"
    assert mask("ssn 123456789 phone 413-555-0100") == "ssn [hidden] phone 413-555-0100"


def test_idle_sessions_are_dropped():
    clock = [0.0]
    sessions = FillerSessions(idle_seconds=10, clock=lambda: clock[0])
    state = sessions.get("s")
    state.confirm(None, {"zip": "01002"})
    clock[0] = 11
    assert sessions.get("s").details == {}  # a fresh, empty state


def test_confirmed_excludes_details_from_papers_no_longer_consented():
    state = FillerSession()
    paper = state.add_paper("application/pdf", 1, b"%PDF-", None)
    state.grant(paper.id, ALL, "v")
    _, found = interpret(RawReading(kind="pay_stub", fields=[RawField(key="employer", value="Bakery")]),
                         paper_id=paper.id, pages=1, scopes=ALL, photo=False)
    state.propose(found)
    state.confirm(None, {})
    assert "employer" in state.confirmed()
    paper.consent = None  # as if revoked without the cleanup
    assert "employer" not in state.confirmed()


def test_turning_auto_read_on_reads_the_papers_already_saved(client, reader):
    """Papers added before the setting was on are read when it is turned on (not only new uploads)."""
    sid = new_session(client)
    upload(client, sid, PAY_STUB)
    upload(client, sid, LEASE)
    assert reader.requests == []  # off: nothing read
    client.put(url(sid, "/auto-read"), json={"on": True})
    state = settled(client, sid)
    assert len(reader.requests) == 2
    assert all(p["status"] == "done" and p["can_read"] for p in state["papers"])
    assert {"monthly_income", "monthly_rent"} <= set(details(state))


def test_the_same_file_is_never_added_or_read_twice(client, reader):
    """A second tab, or a reload, sends the device's papers again: they map to the same paper."""
    sid = new_session(client)
    client.put(url(sid, "/auto-read"), json={"on": True})
    first = upload(client, sid, PAY_STUB)
    settled(client, sid)
    again = upload(client, sid, PAY_STUB, name="pay-stub-copy.pdf")
    state = settled(client, sid)
    assert again == first and len(state["papers"]) == 1
    assert len(reader.requests) == 1
