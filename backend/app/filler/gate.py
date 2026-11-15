"""The gate: a pure policy check on every action, before Playwright touches the page.

    decide(action, facts, policy) -> Verdict(allow | ask | handoff | block)

  allow    run it
  ask      a fill-sheet detail is missing: ask the person one question
  handoff  park the agent and give the person the browser (choice, certify, sign,
           sign in, CAPTCHA, SSN, file upload, the final Submit, Gemini's own
           require_confirmation)
  block    refuse and tell the model why (off-site, free text, Enter...)

Ported as new code from v1's gate (app/execution/gate.py) so the two packages stay
independent. It matches text, so it can miss an oddly labelled Submit; that is why the
person, never the agent, presses the final button, and why real sites run fill-and-stop.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import urlsplit


HandoffReason = Literal[
    "choice", "attestation", "submit", "sign_in", "captcha", "sensitive_field", "file_upload",
    "safety_confirmation", "unknown_field", "stuck", "person_requested",
]

CAPTCHA_HOSTS = (
    "google.com/recaptcha", "recaptcha.net", "hcaptcha.com", "challenges.cloudflare.com",
    "arkoselabs.com", "funcaptcha.com", "captcha",
)
_SUBMIT = re.compile(
    r"\b(submit|send|pay|payment|purchase|place order|donate|register|confirm|apply now|finish application)\b"
)
_ATTEST = re.compile(
    r"\b(agree|agreement|certify|certification|attest|i accept|accept (the )?terms|consent|"
    r"sign|signature|signed|e ?sign|initials?|under penalty)\b"
)
_MIDDLE_INITIAL = re.compile(r"\bmiddle (name )?initial\b|\bm i\b")
_SIGN_IN = re.compile(r"\b(sign ?in|log ?in|sign ?up|create (an |your )?account|password)\b")
_SSN = re.compile(r"\b(ssn|social security|soc ?sec|tax ?id|itin|ss ?#|ss ?number)\b")
PLACEHOLDER = re.compile(r"^\s*\{\{\s*([a-z_]+)\s*\}\}\s*$")

@dataclass(frozen=True)
class Action:
    name: str
    args: dict[str, Any] = field(default_factory=dict)


CLICKS = {"click", "double_click", "triple_click"}
ALWAYS_SAFE = {"scroll", "wait", "wait_5_seconds", "take_screenshot", "go_back", "go_forward", "move"}
SAFE_KEYS = {
    "tab", "shift+tab", "arrowdown", "arrowup", "arrowleft", "arrowright",
    "escape", "backspace", "delete", "home", "end", "pagedown", "pageup",
}
TEXT_INPUT_TYPES = {"", "text", "email", "tel", "number", "date", "search", "url"}


def _norm(text: str) -> str:
    """Lowercase; _ - . : * become spaces, so `applicant_ssn` matches \\bssn\\b."""
    return " ".join(re.sub(r"[_\-.:*]+", " ", text.lower()).split())


@dataclass(frozen=True)
class Element:
    tag: str = ""
    type: str = ""
    role: str = ""
    text: str = ""  # visible text, button value, aria-label, labels, legend, placeholder
    name: str = ""  # name, id, autocomplete
    editable: bool = False
    frame_host: str = ""

    @property
    def words(self) -> str:
        return _norm(f"{self.text} {self.name}")

    @property
    def is_button_like(self) -> bool:
        return (self.tag in ("button", "a", "summary") or self.role in ("button", "link", "menuitem")
                or (self.tag == "input" and self.type in ("submit", "button", "image", "reset")))

    @property
    def is_check(self) -> bool:
        return (self.tag == "input" and self.type in ("checkbox", "radio")) or self.role in (
            "checkbox", "radio", "switch", "option", "menuitemradio", "menuitemcheckbox")

    @property
    def is_text_field(self) -> bool:
        if not self.editable or self.is_check:
            return False
        return not (self.tag == "input" and self.type not in TEXT_INPUT_TYPES)


@dataclass(frozen=True)
class PageFacts:
    url: str
    target: Element | None = None  # at the click point
    focused: Element | None = None
    frame_hosts: tuple[str, ...] = ()


@dataclass(frozen=True)
class GatePolicy:
    allowed_hosts: frozenset[str]
    known_keys: frozenset[str]  # confirmed details on the fill sheet now
    catalogue_keys: frozenset[str]  # every key the person could be asked for


@dataclass(frozen=True)
class Verdict:
    kind: Literal["allow", "ask", "handoff", "block"]
    reason: HandoffReason | None = None
    message: str = ""
    field_key: str | None = None


ALLOW = Verdict("allow")


def _block(message: str) -> Verdict:
    return Verdict("block", message=message)


def _handoff(reason: HandoffReason) -> Verdict:
    return Verdict("handoff", reason=reason)


def host_allowed(url: str, allowed: frozenset[str]) -> bool:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    return parts.scheme in ("http", "https") and any(host == h or host.endswith("." + h) for h in allowed)


def _sensitive(element: Element) -> HandoffReason | None:
    words = element.words
    if element.tag == "iframe":
        return "captcha" if any(c in element.frame_host.lower() for c in CAPTCHA_HOSTS) else "unknown_field"
    if element.tag == "input" and element.type == "password":
        return "sign_in"
    if element.tag == "input" and element.type == "file":
        return "file_upload"
    if _SSN.search(words):
        return "sensitive_field"
    if element.tag == "canvas" or "signature" in words:
        return "attestation"
    return None


def classify_press(element: Element) -> Verdict:
    reason = _sensitive(element)
    if reason:
        return _handoff(reason)
    words = element.words
    if element.is_check:
        # Ticking or picking answers a question for the person: always theirs.
        return _handoff("attestation" if _ATTEST.search(words) else "choice")
    if element.is_button_like:
        if _SIGN_IN.search(words):
            return _handoff("sign_in")
        if _ATTEST.search(words):
            return _handoff("attestation")
        if _SUBMIT.search(words):
            return _handoff("submit")
    return ALLOW


def classify_typing(key: str, focused: Element | None, policy: GatePolicy) -> Verdict:
    """Typing fill-sheet `key` into the focused element."""
    if key not in policy.catalogue_keys:
        return _block(f"There is no fill-sheet key '{key}'. If the form needs it, call request_handoff.")
    if focused is None or not focused.editable:
        return _block("No text field has focus. Click the field first.")
    reason = _sensitive(focused)
    if reason:
        return _handoff(reason)
    if not focused.is_text_field:
        return _block("The focused element is not a text field.")
    if _ATTEST.search(_MIDDLE_INITIAL.sub(" ", focused.words)):
        return _handoff("attestation")  # "type your name to sign", initials
    if key not in policy.known_keys:
        return Verdict("ask", field_key=key)
    return Verdict("allow", field_key=key)


def _safety_decision(args: dict[str, Any]) -> str | None:
    decision = args.get("safety_decision")
    if isinstance(decision, dict):
        decision = decision.get("decision")
    return str(decision).lower() if decision else None


def decide(action: Action, facts: PageFacts, policy: GatePolicy) -> Verdict:
    name, args = action.name, action.args

    decision = _safety_decision(args)  # Gemini's own safety check has the last word toward caution
    if decision == "blocked":
        return _block("That action was blocked by the safety check. Do not try it again.")
    if decision == "require_confirmation":
        return _handoff("safety_confirmation")

    if any(any(c in host.lower() for c in CAPTCHA_HOSTS) for host in facts.frame_hosts):
        return _handoff("captcha")
    if not host_allowed(facts.url, policy.allowed_hosts) and name not in ("go_back", "wait", "take_screenshot"):
        return _block("This page is outside the application site. Use go_back.")
    if name in ALWAYS_SAFE:
        return ALLOW
    if name == "navigate":
        if host_allowed(str(args.get("url", "")), policy.allowed_hosts):
            return ALLOW
        return _block("Only the application site may be opened. Stay on this site.")
    if name in CLICKS:
        if facts.target is None:
            return _block("There is nothing to click at that point.")
        return classify_press(facts.target)
    if name == "type":
        match = PLACEHOLDER.match(str(args.get("text", "")))
        if not match:
            return _block("Type only one fill-sheet placeholder, such as {{phone}}, never other text.")
        return classify_typing(match.group(1), facts.focused, policy)
    if name == "press_key":
        key = str(args.get("key", "")).strip().lower()
        if key in SAFE_KEYS:
            return ALLOW
        if key in ("space", " ", "spacebar"):
            return classify_press(facts.focused) if facts.focused else ALLOW
        if key == "enter":
            return _block("Do not press Enter; it can send the form. Click the button instead.")
        return _block("That key is not allowed.")
    if name == "hotkey":
        if "+".join(str(k).strip().lower() for k in args.get("keys") or []) in SAFE_KEYS:
            return ALLOW
        return _block("Keyboard shortcuts are not allowed.")
    return _block(f"The action '{name}' is not allowed here.")
