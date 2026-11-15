"""Phase 3: the Document Agent, per-kind reading, review cards, conflicts and the trace.

Uses the fictional demo household (tests/fixtures/demo_person.json) and the
papers generated from it into frontend/public/demo-papers/maya/.
"""

from pathlib import Path

import pytest

from app.services.document_patterns import clean_text, read_kind
from app.services.documents import read_document

PAPERS = Path(__file__).resolve().parents[2] / "frontend/public/demo-papers/maya"


def paper(name: str) -> bytes:
    return (PAPERS / f"{name}.pdf").read_bytes()


def start(client, *, household=2, who=("child",), income=True) -> str:
    sid = client.post("/api/sessions").json()["session_id"]
    for body in (
        {"question_id": "needs", "selected_option_ids": ["food"]},
        {"question_id": "zip", "value": "00000"},
        {"question_id": "household_size", "value": household},
        {"question_id": "household_who", "selected_option_ids": list(who)},
        {"question_id": "monthly_income", "value": 1240, "period": "month"} if income
        else {"question_id": "monthly_income", "skipped": True},
    ):
        assert client.post(f"/api/sessions/{sid}/answers", json=body).status_code == 200
    return sid


def upload(client, sid, name, data, kind):
    return client.post(
        f"/api/sessions/{sid}/evidence/document",
        files={"file": (name, data, "application/octet-stream")},
        data={"consent": "true", "kind": kind},
    )


def review_for(snapshot, kind):
    return next(r for r in snapshot["pending_reviews"] if r["kind"] == kind)


# --- the household conflict (the demo's deliberate one) ------------------------


def test_household_paper_conflicts_with_what_was_typed(client):
    sid = start(client)
    r = upload(client, sid, "household-members.pdf", paper("household-members"), "dob")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"
    snap = r.json()

    question = snap["pending_question"]
    assert question["id"] == "confirm_household_size"
    assert question["prompt"].startswith("You told us 2 people live with you. Your household paper shows a household of 3.")

    card = review_for(snap, "dob")
    assert card["title"] == "your household paper"
    assert {row["field"]: row["in_conflict"] for row in card["rows"]} == {
        "household_size": True, "household_who": True,
    }

    # Identity comes back once, for the device; never in state.
    identity = {item["key"]: item["value"] for item in snap["identity"]}
    assert identity["date_of_birth"] == "03/14/1994" and identity["full_name"] == "Maya Rivera"
    values = client.app.state.sessions.values(sid)
    for secret in ("Maya", "Rivera", "03/14/1994", "Example Street"):
        assert secret not in str(values)
    assert values["documents"][-1].identity_keys  # key names only

    # Yes settles the household size and, from the same paper, the age groups.
    snap = client.post(f"/api/sessions/{sid}/answers", json={
        "question_id": "confirm_household_size", "selected_option_ids": ["yes"]}).json()
    profile = client.app.state.sessions.values(sid)["profile"]
    assert profile.facts["household_size"].value == 3 and profile.facts["household_size"].confirmed
    assert profile.facts["household_who"].value == ["60", "child"] and profile.facts["household_who"].confirmed
    assert profile.conflicts == []
    assert snap["pending_reviews"] == []


def test_no_answers_reach_the_trace(client):
    sid = start(client)
    snap = upload(client, sid, "household-members.pdf", paper("household-members"), "dob").json()
    steps = [(e["step"], e["node"], e["reason"]) for e in snap["trace"]]
    assert ("routed", "document_analysis", "evidence_document") in steps
    assert ("completed", "document_analysis", None) in steps
    assert ("routed", "user_intelligence", "document_queue") in steps
    assert ("asked", "administrator", "conflict") in steps
    done = next(e for e in snap["trace"] if e["node"] == "document_analysis" and e["step"] == "completed")
    assert done["fields"] == ["household_size", "household_who"]
    text = str(snap["trace"])
    assert "Maya" not in text and "1994" not in text
    assert [e["seq"] for e in snap["trace"]] == sorted(e["seq"] for e in snap["trace"])


# --- review cards ---------------------------------------------------------------


def test_review_card_confirms_ticked_rows_and_takes_edits(client):
    sid = start(client)
    snap = upload(client, sid, "lease.pdf", paper("lease"), "lease").json()
    card = review_for(snap, "lease")
    assert {row["field"] for row in card["rows"]} == {"housing_status", "heat_included_in_rent"}

    r = client.post(f"/api/sessions/{sid}/evidence/review", json={
        "document_id": card["document_id"],
        "accept": ["housing_status"],
        "edits": {"heat_included_in_rent": "included"},
    })
    assert r.status_code == 200
    profile = client.app.state.sessions.values(sid)["profile"]
    assert profile.facts["housing_status"].value == "renting" and profile.facts["housing_status"].confirmed
    heat = profile.facts["heat_included_in_rent"]
    assert heat.value is True and heat.provenance == "user_reported"
    assert r.json()["pending_reviews"] == []


def test_unticked_rows_are_dropped(client):
    sid = start(client)
    card = review_for(upload(client, sid, "lease.pdf", paper("lease"), "lease").json(), "lease")
    client.post(f"/api/sessions/{sid}/evidence/review", json={"document_id": card["document_id"], "accept": []})
    facts = client.app.state.sessions.values(sid)["profile"].facts
    assert "housing_status" not in facts and "heat_included_in_rent" not in facts


@pytest.mark.parametrize("body", [
    {"accept": ["monthly_income"]},  # not on this paper
    {"edits": {"heat_included_in_rent": "sometimes"}},  # not an option
])
def test_review_rejects_fields_and_values_it_cannot_take(client, body):
    sid = start(client)
    card = review_for(upload(client, sid, "lease.pdf", paper("lease"), "lease").json(), "lease")
    r = client.post(f"/api/sessions/{sid}/evidence/review", json={"document_id": card["document_id"], **body})
    assert r.status_code == 422


# --- evidence meets evidence ----------------------------------------------------


def test_two_papers_that_disagree_open_a_conflict(client):
    sid = start(client, income=False)
    upload(client, sid, "pay-stub.pdf", paper("pay-stub"), "income")
    snap = upload(client, sid, "stub2.txt", b"Employer: Sample Co\nGross monthly pay: $2,600", "income").json()
    profile = client.app.state.sessions.values(sid)["profile"]
    conflict = next(c for c in profile.conflicts if c.field == "monthly_income")
    assert sorted(c.value for c in conflict.candidates) == [1240.0, 2600.0]
    assert not profile.facts["monthly_income"].confirmed
    question = snap["pending_question"]
    assert question["id"] == "confirm_monthly_income"
    assert "but your pay stub shows about $1,240" in question["prompt"]


def test_agreement_is_not_confirmation(client):
    sid = start(client, income=False)
    upload(client, sid, "pay-stub.pdf", paper("pay-stub"), "income")
    upload(client, sid, "stub2.txt", b"Gross monthly pay: $1,250", "income")
    profile = client.app.state.sessions.values(sid)["profile"]
    assert not profile.facts["monthly_income"].confirmed
    assert not any(c.field == "monthly_income" for c in profile.conflicts)


def test_shutoff_notice_outranks_the_bill(client):
    sid = start(client)
    upload(client, sid, "shutoff.pdf", paper("shutoff-notice"), "shutoff")
    upload(client, sid, "bill.pdf", paper("electric-bill"), "heat")
    profile = client.app.state.sessions.values(sid)["profile"]
    assert profile.facts["utility_urgency"].value == "shutoff"
    assert not any(c.field == "utility_urgency" for c in profile.conflicts)


# --- what each kind may read ----------------------------------------------------


def test_a_kind_reads_only_its_own_fields():
    data = b"Tenant: A Person\nGross monthly pay: $5,000\nHousehold size: 9\n"
    facts = read_document("lease.txt", data, "lease").extraction.extracted_facts
    assert set(facts) == {"housing_status"}
    assert all(f.source and f.source.startswith("doc:") for f in facts.values())


def test_unread_kinds_keep_the_paper_but_read_nothing():
    reading = read_document("notice.txt", b"Rent owed: $1,800\nHousehold size: 4", "notices")
    assert reading.extraction.extracted_facts == {} and "kind_not_read" in reading.extraction.notes


def test_labels_must_start_a_line():
    data = b"Please note our records say Household size: 9 for everyone.\n"
    assert read_document("x.txt", data, "dob").extraction.extracted_facts == {}


def test_ssn_lines_are_dropped():
    text, notes = clean_text("Name: A Person\nSSN: 123-45-6789\nHousehold size: 2")
    assert "123-45-6789" not in text and notes == ["ssn_line_dropped"]
    reading = read_document("x.txt", b"Social Security number: 123 45 6789\nHousehold size: 2", "dob")
    assert "ssn_line_dropped" in reading.extraction.notes


def test_placeholders_are_rejected():
    reading = read_kind("heat", "Phone: {{email}}\nEmail: {{phone}}\nStatus: Past due")
    assert "phone" not in reading.identity and "email" not in reading.identity
    assert reading.facts == {"utility_urgency": "behind"}


def test_household_count_self_check():
    data = b"Household size: 4\nA Person - self - born 01/01/1990\nB Person - son - born 01/01/2020\n"
    reading = read_document("x.txt", data, "dob")
    assert "household_size" not in reading.extraction.extracted_facts
    assert "household_count_mismatch" in reading.extraction.notes


def test_identity_lines_are_hidden_from_the_model(monkeypatch):
    seen: list[str] = []

    class FakeLLM:
        def generate_json(self, prompt, schema):
            seen.append(prompt)
            return schema()

    monkeypatch.setattr("app.services.documents.get_llm", lambda: FakeLLM())
    read_document("stub.txt", b"Employee: Maya Rivera\nPhone: 413-555-0142\nPay: $40 per hour", "income")
    assert seen and "Maya" not in seen[0] and "413-555" not in seen[0]


# --- disconnecting the bank when papers are in (main's nessie_disconnect) -------


def connect_bank(client, sid):
    r = client.post(f"/api/sessions/{sid}/evidence/nessie",
                    json={"persona_id": "part-time-irregular", "consent": True})
    assert r.status_code in (200, 202)


def disconnect_bank(client, sid):
    assert client.post(f"/api/sessions/{sid}/evidence/nessie/disconnect").status_code in (200, 202)
    return client.get(f"/api/sessions/{sid}").json()


def test_disconnect_leaves_the_paper_when_bank_and_paper_disagreed(client):
    sid = start(client, income=False)
    upload(client, sid, "stub.txt", b"Employer: Sample Co\nGross monthly pay: $4,000", "income")
    connect_bank(client, sid)
    profile = client.app.state.sessions.values(sid)["profile"]
    assert any(c.field == "monthly_income" for c in profile.conflicts)

    snap = disconnect_bank(client, sid)
    profile = client.app.state.sessions.values(sid)["profile"]
    assert not any(c.field == "monthly_income" for c in profile.conflicts)  # no one-sided "conflict"
    income = profile.facts["monthly_income"]
    assert income.value == 4000 and not income.confirmed and income.source.startswith("doc:")
    assert review_for(snap, "income")  # still waiting on its review card
    steps = [(e["node"], e["reason"]) for e in snap["trace"]]
    assert ("user_intelligence", "evidence_bank_disconnect") in steps


def test_disconnect_keeps_a_paper_that_agreed_with_the_bank(client):
    sid = start(client, income=False)
    connect_bank(client, sid)
    bank = client.app.state.sessions.values(sid)["profile"].facts["monthly_income"]
    assert bank.source == "bank:part-time-irregular" and bank.provenance == "nessie_sandbox"
    amount = f"${bank.value:,.0f}".encode()
    upload(client, sid, "stub.txt", b"Gross monthly pay: " + amount, "income")

    disconnect_bank(client, sid)
    income = client.app.state.sessions.values(sid)["profile"].facts["monthly_income"]
    assert income.source.startswith("doc:") and not income.confirmed


# --- the kind picked must fit the paper -----------------------------------------


def test_a_paper_filed_as_the_wrong_kind_is_not_read(client):
    reading = read_document("pay-stub.pdf", paper("pay-stub"), "lease")
    assert reading.extraction.extracted_facts == {} and reading.identity == {}
    assert "kind_mismatch" in reading.extraction.notes

    sid = start(client)
    snap = upload(client, sid, "pay-stub.pdf", paper("pay-stub"), "lease").json()
    assert "document_kind_mismatch" in [n["code"] for n in snap["notices"]]


@pytest.mark.parametrize("name,kind", [
    ("lease", "address"), ("electric-bill", "address"), ("photo-id", "address"),
    ("pay-stub", "income"), ("shutoff-notice", "shutoff"), ("photo-id", "id"),
])
def test_papers_that_also_prove_an_address_still_fit(name, kind):
    assert "kind_mismatch" not in read_document(f"{name}.pdf", paper(name), kind).extraction.notes


def test_a_paper_with_no_known_title_trusts_the_kind_picked():
    facts = read_document("x.txt", b"Tenant: A Person\nHeat included: yes", "lease").extraction.extracted_facts
    assert set(facts) == {"housing_status", "heat_included_in_rent"}


def test_bills_and_notices_set_their_utility_fields():
    bill = read_kind("heat", "Utility bill\nCompany: Eversource Energy\nStatus: Past due")
    assert bill.facts == {"utility_urgency": "behind", "eversource_customer": "yes"}
    assert "eversource_customer" not in read_kind("heat", "Electric bill - Sample Electric Co.\nStatus: Past due").facts
    notice = read_document("n.pdf", paper("shutoff-notice"), "shutoff").extraction.extracted_facts
    assert notice["utility_urgency"].value == "shutoff" and notice["utility_issues"].value == ["shutoff"]


def test_unclaimed_readings_expire(monkeypatch):
    from app.services import documents

    clock = [1000.0]
    monkeypatch.setattr(documents.time, "monotonic", lambda: clock[0])
    inbox = documents.DocumentInbox()
    ref = inbox.put(read_document("x.txt", b"Household size: 2", "dob").extraction)
    clock[0] += documents.INBOX_TTL_SECONDS + 1
    assert inbox.pop(ref) is None


# --- another member's income adds to the household's (Rosa's benefit letter) ----


@pytest.mark.parametrize("order", [("pay-stub", "benefit-letter"), ("benefit-letter", "pay-stub")])
def test_a_benefit_letter_adds_to_the_wages_in_either_order(client, order):
    kinds = {"pay-stub": "income", "benefit-letter": "member_income"}
    sid = start(client, income=False)
    for name in order:
        snap = upload(client, sid, f"{name}.pdf", paper(name), kinds[name]).json()
    profile = client.app.state.sessions.values(sid)["profile"]
    assert profile.facts["monthly_income"].value == 2290 and not profile.facts["monthly_income"].confirmed
    assert not any(c.field == "monthly_income" for c in profile.conflicts)  # added, not compared
    assert "Rosa" not in str(snap["identity"]) and "Rosa" not in str(client.app.state.sessions.values(sid))
    income_rows = [r for review in snap["pending_reviews"] for r in review["rows"] if r["field"] == "monthly_income"]
    assert [r["value"] for r in income_rows] == [2290]  # one card carries the household total


def test_the_household_total_meets_what_was_typed(client):
    sid = start(client)  # typed $1,240
    upload(client, sid, "pay-stub.pdf", paper("pay-stub"), "income")
    snap = upload(client, sid, "benefit-letter.pdf", paper("benefit-letter"), "member_income").json()
    profile = client.app.state.sessions.values(sid)["profile"]
    conflict = next(c for c in profile.conflicts if c.field == "monthly_income")
    assert sorted(c.value for c in conflict.candidates) == [1240, 2290]
    assert snap["pending_question"]["id"] == "confirm_monthly_income"
    assert "Your pay stub and benefit letter show about $2,290" in snap["pending_question"]["prompt"]
    card = next(r for r in snap["pending_reviews"] if any(x["field"] == "monthly_income" for x in r["rows"]))
    assert any("household's total" in n for n in card["notes"])


def test_two_wage_papers_are_never_added():
    from app.agents.user_intelligence import household_income

    a = read_document("a.txt", b"Gross monthly pay: $1,000", "income").extraction
    b = read_document("b.txt", b"Gross monthly pay: $1,100", "income").extraction
    fact, included = household_income(b, [a, b])
    assert fact.value == 1100 and included == set()


# --- the model may fill gaps, but only with what the paper shows -----------------


class _FakeLLM:
    def __init__(self, **values):
        self.values = values

    def generate_json(self, prompt, schema):
        return schema(**self.values)


def test_a_model_figure_the_paper_shows_is_kept_and_flagged(monkeypatch):
    monkeypatch.setattr("app.services.documents.get_llm", lambda: _FakeLLM(monthly_income=2600.0))
    reading = read_document("stub.txt", b"Employer: Sample Co\nEarnings this period  $1,200.00  biweekly", "income")
    assert reading.extraction.extracted_facts["monthly_income"].value == 2600.0  # 1,200 x 26 / 12
    assert "model_read" in reading.extraction.notes


@pytest.mark.parametrize("values", [{"monthly_income": 9999.0}, {"household_size": 7}])
def test_a_model_figure_the_paper_never_states_is_dropped(monkeypatch, values):
    monkeypatch.setattr("app.services.documents.get_llm", lambda: _FakeLLM(**values))
    kind = "income" if "monthly_income" in values else "dob"
    reading = read_document("x.txt", b"Earnings $1,200.00\nPeople listed: 3 adults", kind)
    assert reading.extraction.extracted_facts == {} and "model_read" not in reading.extraction.notes
