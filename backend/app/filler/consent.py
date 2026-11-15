"""Per-session Filler state and the consent rules (spec: Consent and document parsing).

A paper is read only while it holds a `Consent`: its own (the paper's "Filler can
read this" switch) or one copied from the session's auto-read setting at upload.
Every change of consent is applied here, server-side:

  * revoking a paper's consent removes the details read from it, at once;
  * turning auto-read off takes back the consent of papers that only had it from
    auto-read, and removes their details;
  * a detail the person typed or edited is theirs and stays.

All of it lives in memory and is dropped after `IDLE_SECONDS` without a request, or
when the session itself is gone. Nothing is saved between sessions.
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Callable, Literal

from app.filler.models import CATALOGUE, SCOPES, AutoRead, Consent, Detail, Paper, now

IDLE_SECONDS = 2 * 60 * 60
MAX_PAPERS = 20


class ConsentError(ValueError):
    """A request we refuse. The message is safe to show."""


def scopes_from(values: list[str] | None) -> frozenset[str]:
    chosen = frozenset(values) if values is not None else frozenset(SCOPES)
    if not chosen or not chosen <= set(SCOPES):
        raise ConsentError("Pick at least one kind of detail we may read.")
    return chosen


@dataclass
class FillerSession:
    auto_read: AutoRead = field(default_factory=AutoRead)
    papers: dict[str, Paper] = field(default_factory=dict)
    details: dict[str, Detail] = field(default_factory=dict)
    # Which papers got their consent from auto-read rather than their own switch.
    auto_consented: set[str] = field(default_factory=set)
    last_seen: float = field(default_factory=time.monotonic)

    # -- papers ------------------------------------------------------------------

    def add_paper(self, mime: str, pages: int, data: bytes, kind_hint: str | None) -> Paper:
        if len(self.papers) >= MAX_PAPERS:
            raise ConsentError(f"You can add up to {MAX_PAPERS} papers. Remove one first.")
        paper = Paper(id=secrets.token_urlsafe(9), mime=mime, pages=pages, kind_hint=kind_hint, data=data)
        if self.auto_read.on and self.auto_read.consent is not None:
            paper.consent = Consent(self.auto_read.consent.scopes, self.auto_read.consent.notice_version)
            self.auto_consented.add(paper.id)
        self.papers[paper.id] = paper
        return paper

    def remove_paper(self, paper_id: str) -> Paper | None:
        paper = self.papers.pop(paper_id, None)
        if paper is not None:
            paper.consent, paper.data = None, None
            self.auto_consented.discard(paper_id)
            self._drop_details_from(paper_id)
        return paper

    # -- consent -----------------------------------------------------------------

    def grant(self, paper_id: str, scopes: frozenset[str], notice_version: str) -> Paper:
        paper = self.papers.get(paper_id)
        if paper is None:
            raise KeyError(paper_id)
        old = paper.consent.scopes if paper.consent else frozenset()
        paper.consent = Consent(scopes, notice_version)
        self.auto_consented.discard(paper_id)  # now it has its own switch
        if old - scopes:  # narrowed: drop details outside the new scopes
            self._drop_details_from(paper_id, keep=lambda d: CATALOGUE[d.key].scope in scopes)
        return paper

    def revoke(self, paper_id: str) -> Paper:
        paper = self.papers.get(paper_id)
        if paper is None:
            raise KeyError(paper_id)
        paper.consent = None
        self.auto_consented.discard(paper_id)
        self._drop_details_from(paper_id)
        paper.status, paper.found, paper.message = "waiting", 0, None
        return paper

    def set_auto_read(self, on: bool, scopes: frozenset[str], notice_version: str) -> list[Paper]:
        """Turn auto-read on or off. Returns the papers whose consent was taken back."""
        taken: list[Paper] = []
        if on:
            self.auto_read = AutoRead(True, Consent(scopes, notice_version))
            return taken
        self.auto_read = AutoRead(False, None)
        for paper_id in list(self.auto_consented):
            paper = self.papers.get(paper_id)
            if paper is not None:
                self.revoke(paper_id)
                taken.append(paper)
        self.auto_consented.clear()
        return taken

    def may_read(self, paper: Paper, consent: Consent | None) -> bool:
        """True while `consent` is still the paper's live consent (not revoked or replaced)."""
        return paper.id in self.papers and consent is not None and paper.consent is consent

    # -- details -----------------------------------------------------------------

    def propose(self, details: list[Detail]) -> int:
        """Merge freshly read details. The first value found for a key stays; a later paper
        never silently replaces it (the person can edit it in the review card)."""
        added = 0
        for detail in details:
            if detail.key not in self.details:
                self.details[detail.key] = detail
                added += 1
        return added

    def confirm(self, keys: list[str] | None, edits: dict[str, str]) -> list[str]:
        """Confirm `keys` (None = every proposed detail) and apply edits. Returns refused keys."""
        stamp = now()
        checked = {key: (CATALOGUE[key].check(raw) if key in CATALOGUE else None) for key, raw in edits.items()}
        refused = [key for key, value in checked.items() if value is None]
        if refused:
            return refused  # all or nothing
        for key, value in checked.items():
            # The person typed it: theirs now, no longer tied to a paper's consent.
            self.details[key] = Detail(key, str(value), "confirmed", "typed", confirmed_at=stamp)
        targets = list(self.details) if keys is None else keys
        for key in targets:
            detail = self.details.get(key)
            if detail is not None and detail.status == "proposed":
                detail.status, detail.confirmed_at = "confirmed", stamp
        return refused

    def forget_detail(self, key: str) -> bool:
        return self.details.pop(key, None) is not None

    def confirmed(self) -> dict[str, Detail]:
        """What a form may be filled with: confirmed, and from a paper still consented (or typed)."""
        return {
            key: d for key, d in self.details.items()
            if d.status == "confirmed" and (d.source == "typed" or self._consented(d))
        }

    def _consented(self, detail: Detail) -> bool:
        paper = self.papers.get(detail.paper_id or "")
        return bool(paper and paper.consent and CATALOGUE[detail.key].scope in paper.consent.scopes)

    def _drop_details_from(self, paper_id: str, keep: Callable[[Detail], bool] = lambda d: False) -> None:
        for key, detail in list(self.details.items()):
            if detail.source == "paper" and detail.paper_id == paper_id and not keep(detail):
                del self.details[key]

    def view(self) -> dict:
        return {
            "auto_read": {
                "on": self.auto_read.on,
                "scopes": sorted(self.auto_read.consent.scopes) if self.auto_read.consent else [],
            },
            "papers": [p.view() for p in self.papers.values()],
            "details": [d.view() for d in self.details.values()],
            "unconfirmed": sum(1 for d in self.details.values() if d.status == "proposed"),
        }


Cleanup = Callable[[str, FillerSession], None]


class FillerSessions:
    """Filler state by session id. One session never reads another's."""

    def __init__(self, idle_seconds: float = IDLE_SECONDS, on_drop: Cleanup | None = None,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._sessions: dict[str, FillerSession] = {}
        self._idle, self._on_drop, self._clock = idle_seconds, on_drop, clock

    def set_on_drop(self, on_drop: Cleanup) -> None:
        self._on_drop = on_drop

    def get(self, session_id: str, *, create: Literal[True, False] = True) -> FillerSession | None:
        self.expire()
        state = self._sessions.get(session_id)
        if state is None and create:
            state = self._sessions[session_id] = FillerSession()
        if state is not None:
            state.last_seen = self._clock()
        return state

    def drop(self, session_id: str) -> None:
        state = self._sessions.pop(session_id, None)
        if state is not None:
            if self._on_drop:
                self._on_drop(session_id, state)
            for paper_id in list(state.papers):
                state.remove_paper(paper_id)
            state.details.clear()

    def expire(self) -> None:
        cutoff = self._clock() - self._idle
        for session_id, state in list(self._sessions.items()):
            if state.last_seen < cutoff:
                self.drop(session_id)
