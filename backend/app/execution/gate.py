"""The gate: a pure policy check on every action the model proposes, before
Playwright touches the page (plan section 4).

    decide(action, facts, policy) -> Verdict(allow | ask | handoff | block)

  allow    run the action
  ask      the model wants to type a field we don't have yet: ask the person
  handoff  park the agent and give the person the browser (submit, sign, sign in,
           captcha, SSN, file upload, Gemini's own require_confirmation)
  block    refuse and tell the model why (off-site URL, free text, Enter key...)

It is a text-match gate, so it can miss an oddly labelled submit button. That is
why the practice form is the only place a submit can succeed, and why the
person, not the agent, always presses the final button.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import urlsplit

from app.execution.fields import PLACEHOLDER
from app.execution.models import HandoffReason

# Hosts that serve CAPTCHA challenges. Captcha solving stays off at the provider.
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
# "Middle initial" is a name field, not "initial here to sign".
_MIDDLE_INITIAL = re.compile(r"\bmiddle (name )?initial\b|\bm i\b")
_SIGN_IN = re.compile(r"\b(sign ?in|log ?in|sign ?up|create (an |your )?account|password)\b")
_SSN = re.compile(r"\b(ssn|social security|soc ?sec|tax ?id|itin|ss ?#|ss ?number)\b")

CLICKS = {"click", "double_click", "triple_click"}
ALWAYS_SAFE = {"scroll", "wait", "take_screenshot", "go_back", "go_forward", "move"}
SAFE_KEYS = {
    "tab", "shift+tab", "arrowdown", "arrowup", "arrowleft", "arrowright",
    "escape", "backspace", "delete", "home", "end", "pagedown", "pageup",
}
TEXT_INPUT_TYPES = {"", "text", "email", "tel", "number", "date", "search", "url"}


def _norm(text: str) -> str:
    """Lowercase, and treat _ - . as spaces so `applicant_ssn` matches \\bssn\\b."""
    return " ".join(re.sub(r"[_\-.:*]+", " ", text.lower()).split())


@dataclass(frozen=True)
class Element:
    """What is at the click point (resolved through a <label> to its control) or focused."""

    tag: str = ""
    type: str = ""  # input type
    role: str = ""
    text: str = ""  # visible text, value of a button, aria-label, label text, placeholder
    name: str = ""  # name, id and autocomplete attributes
    editable: bool = False
    frame_host: str = ""  # when the element is an iframe

    @property
    def words(self) -> str:
        return _norm(f"{self.text} {self.name}")

    @property
    def is_button_like(self) -> bool:
        return (
            self.tag in ("button", "a", "summary")
            or self.role in ("button", "link", "menuitem")
            or (self.tag == "input" and self.type in ("submit", "button", "image", "reset"))
        )

    @property
    def is_check(self) -> bool:
        return (self.tag == "input" and self.type in ("checkbox", "radio")) or self.role in (
            "checkbox", "radio", "switch", "option", "menuitemradio", "menuitemcheckbox"
        )

    @property
    def is_text_field(self) -> bool:
        """Takes a typed value: a text-like input, a textarea, a contenteditable, or a <select>
        (the computer picks the option whose label matches; native dropdowns don't
        show in screenshots)."""
        if not self.editable or self.is_check:
            return False
        return not (self.tag == "input" and self.type not in TEXT_INPUT_TYPES)


@dataclass(frozen=True)
class PageFacts:
    url: str
    target: Element | None = None  # element at the proposed click point
    focused: Element | None = None  # element with keyboard focus
    frame_hosts: tuple[str, ...] = ()  # every frame's URL host and path, for captcha detection


@dataclass(frozen=True)
class Action:
    name: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class GatePolicy:
    allowed_hosts: frozenset[str]
    known_keys: frozenset[str]
    catalogue_keys: frozenset[str]


@dataclass(frozen=True)
class Verdict:
    kind: Literal["allow", "ask", "handoff", "block"]
    reason: HandoffReason | None = None
    message: str = ""  # for "block": what the model is told
    field_key: str | None = None  # for "ask", and for an allowed type: the key to substitute


ALLOW = Verdict("allow")


def _block(message: str) -> Verdict:
    return Verdict("block", message=message)


def _handoff(reason: HandoffReason) -> Verdict:
    return Verdict("handoff", reason=reason)


def host_allowed(url: str, allowed: frozenset[str]) -> bool:
    parts = urlsplit(url)
    return parts.scheme in ("http", "https") and (parts.hostname or "").lower() in allowed


def _sensitive(element: Element) -> HandoffReason | None:
    """Fields that are always the person's, whatever the action."""
    words = element.words
    if element.tag == "iframe":
        host = element.frame_host.lower()
        return "captcha" if any(c in host for c in CAPTCHA_HOSTS) else "unknown_field"
    if element.tag == "input" and element.type == "password":
        return "sign_in"
    if element.tag == "input" and element.type == "file":
        return "file_upload"
    if _SSN.search(words):
        return "sensitive_field"
    if element.tag == "canvas" or "signature" in words:
        return "attestation"
    return None


def _classify_press(element: Element) -> Verdict:
    """A click or a Space/Enter on a focused control."""
    reason = _sensitive(element)
    if reason:
        return _handoff(reason)
    words = element.words
    if element.is_check:
        # Ticking or choosing is answering a question for the person. The fill sheet
        # only holds typed details, so every choice is theirs to make.
        return _handoff("attestation" if _ATTEST.search(words) else "choice")
    if element.is_button_like:
        if _SIGN_IN.search(words):
            return _handoff("sign_in")
        if _ATTEST.search(words):
            return _handoff("attestation")
        if _SUBMIT.search(words):
            return _handoff("submit")
    return ALLOW


def _safety_decision(args: dict[str, Any]) -> str | None:
    decision = args.get("safety_decision")
    if isinstance(decision, dict):
        decision = decision.get("decision")
    return str(decision).lower() if decision else None


def decide(action: Action, facts: PageFacts, policy: GatePolicy) -> Verdict:
    name, args = action.name, action.args

    # Gemini's own safety service has the last word towards caution.
    decision = _safety_decision(args)
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
        url = str(args.get("url", ""))
        if host_allowed(url, policy.allowed_hosts):
            return ALLOW
        return _block("Only the application site may be opened. Stay on this site.")

    if name in CLICKS:
        if facts.target is None:
            return _block("There is nothing to click at that point.")
        return _classify_press(facts.target)

    if name == "type":
        match = PLACEHOLDER.match(str(args.get("text", "")).strip())
        if not match:
            return _block("Type only one fill-sheet placeholder, such as {{phone}}, never other text.")
        key = match.group(1)
        if key not in policy.catalogue_keys:
            return _block(f"There is no fill-sheet key '{key}'. If the form needs it, call request_handoff.")
        focused = facts.focused
        if focused is None or not focused.editable:
            return _block("No text field has focus. Click the field first.")
        reason = _sensitive(focused)
        if reason:
            return _handoff(reason)
        if not focused.is_text_field:
            return _block("The focused element is not a text field.")
        if _ATTEST.search(_MIDDLE_INITIAL.sub(" ", focused.words)):
            return _handoff("attestation")  # "Type your name to sign", initials
        if key not in policy.known_keys:
            return Verdict("ask", field_key=key)
        return Verdict("allow", field_key=key)

    if name == "press_key":
        key = str(args.get("key", "")).strip().lower()
        if key in SAFE_KEYS:
            return ALLOW
        if key in ("space", " ", "spacebar"):
            return _classify_press(facts.focused) if facts.focused else ALLOW
        if key == "enter":
            return _block("Do not press Enter; it can send the form. Click the button instead.")
        return _block("That key is not allowed.")

    if name == "hotkey":
        keys = [str(k).strip().lower() for k in args.get("keys") or []]
        if "+".join(keys) in SAFE_KEYS:
            return ALLOW
        return _block("Keyboard shortcuts are not allowed.")

    # right/middle click, drag and drop (a signature pad), raw key or mouse events,
    # and anything new or unknown.
    return _block(f"The action '{name}' is not allowed here.")
