"""Types for the browser execution agent: curated records, run state and API views.

Nothing here ever holds a value the agent typed. Step logs carry an action and a
field label ("Typed your phone number"), never the number.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, model_validator

from app.graph.state import Question

RunStatus = Literal[
    "starting",  # creating the browser and opening the start page
    "working",  # the agent is filling the form
    "needs_answer",  # parked: the agent needs a detail only the person knows
    "needs_you",  # parked: the person has control of the browser
    "verifying",  # reading the final page
    "done",
    "stopped",
    "failed",
]
ACTIVE_STATUSES: frozenset[str] = frozenset(
    {"starting", "working", "needs_answer", "needs_you", "verifying"}
)

HandoffReason = Literal[
    "submit",  # a submit, send or pay control: always the person's
    "attestation",  # agree, certify, attest or sign
    "sign_in",  # a password field or account sign-in
    "captcha",
    "sensitive_field",  # a field we never fill (SSN)
    "file_upload",
    "safety_confirmation",  # Gemini asked for a person's confirmation
    "unknown_field",  # a field the fill sheet has no key for
    "stuck",  # the agent asked for help
    "person_requested",  # the person pressed Take over
]

HANDOFF_MESSAGES: dict[str, str] = {
    "submit": "This step sends your application. Check everything, then press the button yourself.",
    "attestation": "This page asks you to agree or sign. Only you can do that.",
    "sign_in": "This page asks you to sign in. Type your own password; we never see it.",
    "captcha": "This page wants to check you're a person. Please complete the check.",
    "sensitive_field": "This page asks for something we never fill in for you, like a Social Security number.",
    "file_upload": "This page asks you to upload a file. Choose it yourself.",
    "safety_confirmation": "The next step needs your OK. Please look it over and do it yourself.",
    "unknown_field": "This page asks for something we don't have. Please fill it in yourself.",
    "stuck": "The assistant got stuck on this page. Please take it from here.",
    "person_requested": "You have control. Press I'm done when you want the assistant to continue.",
}


class AutomationRecord(BaseModel):
    """Curated per-program settings, from app/data/automation/<program_id>.json."""

    program_id: str
    # practice: our own practice form, where a submit (by the person) is harmless.
    # stop_before_submit: a real provider form; the run ends at the handoff.
    mode: Literal["practice", "stop_before_submit"]
    start_url: str | None = None
    allowed_hosts: list[str] = Field(default_factory=list)
    note: str = ""

    @model_validator(mode="after")
    def _real_sites_are_pinned(self) -> AutomationRecord:
        if self.mode == "stop_before_submit":
            if not self.start_url or not self.allowed_hosts:
                raise ValueError("a real-site record needs start_url and allowed_hosts")
            parts = urlsplit(self.start_url)
            if parts.scheme != "https":
                raise ValueError("a real-site start_url must be https")
            if (parts.hostname or "").lower() not in {h.lower() for h in self.allowed_hosts}:
                raise ValueError("start_url host must be in allowed_hosts")
        elif self.start_url is not None:
            raise ValueError("practice records take their URL from PRACTICE_BASE_URL")
        return self


class StepLog(BaseModel):
    at: datetime
    kind: Literal["action", "blocked", "question", "handoff", "note"]
    text: str  # safe to show and to log: never a typed value


class HandoffView(BaseModel):
    reason: HandoffReason
    message: str


class Outcome(BaseModel):
    """Structured reading of the final page. Anything the page doesn't state stays unclear."""

    status: Literal["submitted", "not_submitted", "unclear"]
    confirmation_text: str | None = Field(default=None, max_length=200)


class RunView(BaseModel):
    """What the run panel polls. Returned only to the session that owns the run."""

    run_id: str
    program_id: str
    mode: Literal["practice", "stop_before_submit"]
    status: RunStatus
    steps: list[StepLog] = Field(default_factory=list)
    question: Question | None = None  # set while status is needs_answer
    handoff: HandoffView | None = None  # set while status is needs_you
    # The provider's live view. Read-only while the agent works, interactive
    # while the person has control. A credential: never logged.
    live_view_url: str | None = None
    interactive: bool = False
    has_frame: bool = False  # GET .../frame has a screenshot (fallback view)
    seconds_left: int | None = None  # until the browser session expires
    outcome: Outcome | None = None
    message: str | None = None  # safe explanation when stopped or failed


class StartRunIn(BaseModel):
    program_id: str
    consent: Literal[True]


class ControlIn(BaseModel):
    action: Literal["take", "return"]
