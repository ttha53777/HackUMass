"""Web-search backup: grounding links only, for needs no curated program covers."""

import time

from app.services import llm
from app.services.llm import SearchSource
from app.services.web_search import clean_results, query_for, search_needs

REGION = {"zip": "01002", "city": "Amherst", "county": "Hampshire County", "state": "MA"}


class FakeSearch:
    """A client that only answers searches, recording the queries it got."""

    def __init__(self, sources):
        self.sources, self.queries = sources, []

    def generate_json(self, prompt, schema):
        return None

    def search_sources(self, query):
        self.queries.append(query)
        return self.sources


def identity(uri):
    return uri if uri.startswith("https://") else None


def test_query_holds_only_the_need_and_the_place():
    q = query_for("Legal help", REGION)
    assert "legal help" in q and "Amherst" in q and "Hampshire County" in q


def test_results_are_https_deduplicated_and_capped():
    sources = [
        SearchSource(title="Community Legal Aid", uri="https://www.communitylegal.org/a"),
        SearchSource(title="Same site again", uri="https://communitylegal.org/b"),
        SearchSource(title="Plain http", uri="http://insecure.example.org"),
        SearchSource(title="A search page", uri="https://www.google.com/search?q=x"),
        *[SearchSource(title=f"Org {i}", uri=f"https://org{i}.example.org") for i in range(10)],
    ]
    out = clean_results(sources, identity)
    domains = [r.domain for r in out]
    assert domains[0] == "communitylegal.org"
    assert len(out) == 5 and len(set(domains)) == 5
    assert all(r.url.startswith("https://") for r in out)
    assert not any("google" in d or "insecure" in d for d in domains)


def test_search_uses_grounding_sources_and_caches_per_need():
    fake = FakeSearch([SearchSource(title="Org", uri="https://org.example.org")])
    llm.set_llm(fake)
    cache: dict = {}
    first = search_needs([("legal", "Legal help")], REGION, cache, identity)
    second = search_needs([("legal", "Legal help")], REGION, cache, identity)
    assert first[0].results[0].url == "https://org.example.org" and first == second
    assert len(fake.queries) == 1


def test_a_failed_search_is_empty_and_not_cached():
    class Failing(FakeSearch):
        def search_sources(self, query):
            self.queries.append(query)
            return None

    fake = Failing([])
    llm.set_llm(fake)
    cache: dict = {}
    assert search_needs([("legal", "Legal help")], REGION, cache, identity) == []
    assert cache == {}


def test_off_mode_never_searches():
    llm.set_llm(None)
    assert search_needs([("legal", "Legal help")], REGION, {}, identity) == []


# --- HTTP ---------------------------------------------------------------------


def _intake(client, needs):
    sid = client.post("/api/sessions").json()["session_id"]
    for body in ({"question_id": "needs", "selected_option_ids": needs}, {"question_id": "zip", "value": "00000"}):
        assert client.post(f"/api/sessions/{sid}/answers", json=body).status_code in (200, 202)
        for _ in range(50):
            if not client.get(f"/api/sessions/{sid}").json()["busy"]:
                break
            time.sleep(0.05)
    return sid


def test_endpoint_searches_only_uncovered_needs(client):
    fake = FakeSearch([SearchSource(title="Org", uri="https://org.example.org")])
    llm.set_llm(fake)
    sid = _intake(client, ["food", "legal"])
    body = client.get(f"/api/sessions/{sid}/web-resources").json()
    assert body["available"] is True
    assert [g["need"] for g in body["groups"]] == ["legal"]  # fixture data has food programs, no legal ones
    assert all("legal" in q.lower() and "food" not in q.lower() for q in fake.queries)


def test_endpoint_off_mode_and_unknown_session(client):
    llm.set_llm(None)
    sid = _intake(client, ["legal"])
    assert client.get(f"/api/sessions/{sid}/web-resources").json() == {"available": False, "groups": []}
    assert client.get("/api/sessions/nope/web-resources").status_code == 404
