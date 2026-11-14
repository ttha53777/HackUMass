"""The gate: every guardrail in plan section 4 that is enforced in code."""

import pytest

from app.execution.fields import CATALOGUE
from app.execution.gate import Action, Element, GatePolicy, PageFacts, decide

SITE = "https://apply.example.org/form"
POLICY = GatePolicy(
    allowed_hosts=frozenset({"apply.example.org"}),
    known_keys=frozenset({"zip", "phone"}),
    catalogue_keys=frozenset(CATALOGUE),
)

BUTTON = lambda text, **kw: Element(tag="button", text=text, **kw)  # noqa: E731
FIELD = lambda text="", name="", **kw: Element(tag="input", type=kw.pop("type", "text"), text=text, name=name, editable=True, **kw)  # noqa: E731


def click_on(target, url=SITE, **args):
    return decide(Action("click", {"x": 500, "y": 500, **args}), PageFacts(url=url, target=target), POLICY)


def type_into(focused, text):
    return decide(Action("type", {"text": text}), PageFacts(url=SITE, focused=focused), POLICY)


@pytest.mark.parametrize("label", ["Submit application", "Send", "Pay now", "Confirm and submit", "Register"])
def test_agent_cannot_click_a_submit_control(label):
    verdict = click_on(BUTTON(label))
    assert (verdict.kind, verdict.reason) == ("handoff", "submit")


def test_submit_input_is_detected_by_its_value():
    verdict = click_on(Element(tag="input", type="submit", text="Submit"))
    assert verdict.reason == "submit"


@pytest.mark.parametrize("label", ["Next", "Continue", "Back", "Save and continue"])
def test_navigation_buttons_pass(label):
    assert click_on(BUTTON(label)).kind == "allow"


@pytest.mark.parametrize("label", ["I agree", "Certify", "Sign", "E-sign"])
def test_attestation_buttons_hand_off(label):
    assert click_on(BUTTON(label)).reason == "attestation"


def test_attestation_checkbox_hands_off():
    box = Element(tag="input", type="checkbox", text="I certify that the information is true")
    assert click_on(box).reason == "attestation"


@pytest.mark.parametrize("element", [
    Element(tag="input", type="checkbox", text="Text me updates"),
    Element(tag="input", type="radio", text="Home Delivered Meals (must be 60 or over)"),
    Element(tag="li", role="option", text="Oil"),
])
def test_every_choice_is_the_persons(element):
    assert click_on(element).reason == "choice"


def test_sign_in_button_and_password_field_hand_off():
    assert click_on(BUTTON("Sign in")).reason == "sign_in"
    assert click_on(FIELD("Password", type="password")).reason == "sign_in"


def test_file_upload_and_captcha_frames_hand_off():
    assert click_on(FIELD("Proof of income", type="file")).reason == "file_upload"
    assert click_on(Element(tag="iframe", frame_host="www.google.com/recaptcha/api2/anchor")).reason == "captcha"
    facts = PageFacts(url=SITE, target=BUTTON("Next"), frame_hosts=("hcaptcha.com/checkbox",))
    assert decide(Action("click", {"x": 1, "y": 1}), facts, POLICY).reason == "captcha"


@pytest.mark.parametrize("label,name", [("Social Security Number", ""), ("", "applicant_ssn"), ("SSN (last 4)", "")])
def test_ssn_fields_are_never_typed_into(label, name):
    verdict = type_into(FIELD(label, name), "{{phone}}")
    assert (verdict.kind, verdict.reason) == ("handoff", "sensitive_field")
    assert click_on(FIELD(label, name)).reason == "sensitive_field"


def test_signature_text_field_hands_off():
    assert type_into(FIELD("Signature: type your full name", "signature"), "{{first_name}}").reason == "attestation"


def test_type_accepts_only_a_known_placeholder():
    phone = FIELD("Phone number", "phone")
    allowed = type_into(phone, "{{phone}}")
    assert (allowed.kind, allowed.field_key) == ("allow", "phone")
    assert type_into(phone, "413-555-0100").kind == "block"  # free text, even a plausible value
    assert type_into(phone, "{{phone}} extra").kind == "block"
    assert type_into(phone, "{{password}}").kind == "block"  # not a fill-sheet key


def test_unknown_value_becomes_a_question():
    verdict = type_into(FIELD("Email", "email", type="email"), "{{email}}")
    assert (verdict.kind, verdict.field_key) == ("ask", "email")


def test_type_needs_a_focused_text_field():
    assert decide(Action("type", {"text": "{{zip}}"}), PageFacts(url=SITE), POLICY).kind == "block"
    assert type_into(Element(tag="input", type="checkbox", editable=True), "{{zip}}").kind == "block"


def test_navigation_is_pinned_to_allowed_hosts():
    ok = decide(Action("navigate", {"url": "https://apply.example.org/step2"}), PageFacts(url=SITE), POLICY)
    off = decide(Action("navigate", {"url": "https://evil.example.com/"}), PageFacts(url=SITE), POLICY)
    scheme = decide(Action("navigate", {"url": "javascript:alert(1)"}), PageFacts(url=SITE), POLICY)
    assert ok.kind == "allow" and off.kind == "block" and scheme.kind == "block"


def test_actions_off_site_are_blocked_except_going_back():
    assert click_on(BUTTON("Next"), url="https://other.example.com/").kind == "block"
    back = decide(Action("go_back"), PageFacts(url="https://other.example.com/"), POLICY)
    assert back.kind == "allow"


def test_enter_is_blocked_and_space_on_submit_hands_off():
    focused = BUTTON("Submit application")
    assert decide(Action("press_key", {"key": "Enter"}), PageFacts(url=SITE, focused=focused), POLICY).kind == "block"
    assert decide(Action("press_key", {"key": "Space"}), PageFacts(url=SITE, focused=focused), POLICY).reason == "submit"
    assert decide(Action("press_key", {"key": "Tab"}), PageFacts(url=SITE), POLICY).kind == "allow"
    assert decide(Action("hotkey", {"keys": ["Shift", "Tab"]}), PageFacts(url=SITE), POLICY).kind == "allow"
    assert decide(Action("hotkey", {"keys": ["Control", "V"]}), PageFacts(url=SITE), POLICY).kind == "block"


def test_gemini_safety_decisions_win():
    confirm = click_on(BUTTON("Next"), safety_decision={"decision": "require_confirmation", "explanation": "x"})
    blocked = click_on(BUTTON("Next"), safety_decision={"decision": "blocked"})
    assert confirm.reason == "safety_confirmation"
    assert blocked.kind == "block"


@pytest.mark.parametrize("name", ["drag_and_drop", "right_click", "key_down", "something_new"])
def test_unneeded_or_unknown_actions_are_blocked(name):
    assert decide(Action(name, {"x": 1, "y": 1}), PageFacts(url=SITE, target=BUTTON("Next")), POLICY).kind == "block"
