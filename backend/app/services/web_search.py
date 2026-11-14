"""Web-search backup for needs the curated data doesn't cover (Gemini + Google Search).

Curated records stay the source of truth. This runs only for a need the person
chose that has no curated program in their area, and its results are shown apart
from the plan as unverified links, never with an eligibility status.

Guardrails:
- The query is built from the need's label and the person's city and county
  only. The person's own words never leave in a search query.
- Only the pages Google's grounding metadata returns are used (title + link).
  The model's written answer is discarded, so it can't invent a fact or a link.
- Links must end up on https; each is resolved once to its final page, results
  are de-duplicated by site, and at most MAX_RESULTS are kept per need.
- Any failure (off mode, no key, quota, network) gives an empty list.
- Nothing is logged except the error class.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Callable
from urllib.parse import urlparse

import httpx

from app.api.schemas import WebResourceGroup, WebResult
from app.services.llm import SearchSource, get_llm

logger = logging.getLogger(__name__)

MAX_RESULTS = 5
MAX_NEEDS = 4
RESOLVE_TIMEOUT_SECONDS = 4.0
# Search engines and aggregators are not organizations someone can contact.
_SKIP_DOMAINS = ("google.", "vertexaisearch.", "youtube.", "facebook.", "yelp.", "reddit.", "wikipedia.")


def query_for(label: str, region: dict[str, str]) -> str:
    place = ", ".join(p for p in (region.get("city"), region.get("county"), region.get("state")) if p)
    return (
        f"Free or low-cost help with {label.lower()} for residents of {place}. "
        "List nonprofit or government organizations that serve this area, with their official websites."
    )


def _resolve(uri: str) -> str | None:
    """The final https page a grounding link points to, or None."""
    try:
        with httpx.Client(follow_redirects=True, timeout=RESOLVE_TIMEOUT_SECONDS) as client:
            response = client.head(uri)
            if response.status_code >= 400 or response.status_code == 405:
                response = client.get(uri)
            final = str(response.url)
    except httpx.HTTPError:
        final = uri
    return final if final.startswith("https://") else None


def _domain(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def clean_results(sources: list[SearchSource], resolve: Callable[[str], str | None] = _resolve) -> list[WebResult]:
    results: list[WebResult] = []
    seen: set[str] = set()
    for source in sources:
        url = resolve(source.uri)
        if not url:
            continue
        domain = _domain(url)
        if not domain or domain in seen or any(skip in domain for skip in _SKIP_DOMAINS):
            continue
        seen.add(domain)
        title = " ".join((source.title or domain).split())[:120]
        results.append(WebResult(title=title, url=url, domain=domain))
        if len(results) >= MAX_RESULTS:
            break
    return results


def search_available() -> bool:
    return hasattr(get_llm(), "search_sources")


def search_needs(
    needs: list[tuple[str, str]],
    region: dict[str, str],
    cache: dict[str, list[WebResult]],
    resolve: Callable[[str], str | None] = _resolve,
) -> list[WebResourceGroup]:
    """Web results for each (need id, label), using and filling `cache` (per session)."""
    llm = get_llm()
    search = getattr(llm, "search_sources", None)
    if search is None or not needs or not region:
        return []
    needs = needs[:MAX_NEEDS]
    zip_code = region.get("zip", "")

    def one(need: tuple[str, str]) -> WebResourceGroup:
        need_id, label = need
        key = f"{need_id}:{zip_code}"
        if key not in cache:
            sources = search(query_for(label, region))
            if sources is None:
                return WebResourceGroup(need=need_id, label=label, results=[])  # don't cache a failure
            cache[key] = clean_results(sources, resolve)
        return WebResourceGroup(need=need_id, label=label, results=cache[key])

    with ThreadPoolExecutor(max_workers=len(needs)) as pool:
        return [group for group in pool.map(one, needs) if group.results]
