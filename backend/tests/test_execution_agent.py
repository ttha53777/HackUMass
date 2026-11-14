"""The agent loop with a fake page and a scripted model: no browser, no network."""

import asyncio
import json

from app.execution.agent import Agent, Call, function_result, parse_interaction, system_instruction, tools
from app.execution.computer import Observation
from app.execution.fields import FieldStore
from tests.execution_fakes import FakeComputer, ScriptedModel, click, type_

HOSTS = frozenset({"127.0.0.1"})


class Hooks:
    def __init__(self, answers=None):
        self.answers = answers or {}  # key -> value, or None to skip
        self.store: FieldStore | None = None
        self.logs: list[tuple[str, str]] = []
        self.handoffs: list[str] = []
        self.asked: list[str] = []
        self.takeover = False

    def log(self, kind, text):
        self.logs.append((kind, text))

    async def ask(self, field_key):
        self.asked.append(field_key)
        value = self.answers.get(field_key)
        if value is None:
            return False
        self.store.put(field_key, value)
        return True

    async def handoff(self, reason):
        self.handoffs.append(reason)
        self.takeover = False

    def takeover_requested(self):
        return self.takeover


def make(turns, answers=None, known=None):
    store = FieldStore()
    for key, value in (known or {}).items():
        store.put(key, value)
    hooks = Hooks(answers)
    hooks.store = store
    computer = FakeComputer()
    model = ScriptedModel(turns)
    return Agent(computer, model, store, HOSTS, hooks), computer, model, hooks


def run(agent):
    return asyncio.run(agent.run())


def test_fills_known_fields_by_substitution_and_never_sends_values_to_the_model():
    agent, computer, model, hooks = make(
        [[click(100, 200)], [type_("{{zip}}")], [click(100, 250), type_("{{household_size}}")], [click(500, 900)], []],
        known={"zip": "01002", "household_size": "3"},
    )
    end = run(agent)
    assert end.kind == "finished"
    assert computer.typed == {"zip": "01002", "household": "3"}
    sent = json.dumps(model.inputs)
    assert "01002" not in sent
    assert ("action", "Typed your ZIP code") in hooks.logs
    assert ("action", "Clicked “Next”") in hooks.logs


def test_a_missing_detail_is_asked_then_typed():
    agent, computer, _, hooks = make([[click(100, 150)], [type_("{{phone}}")], []], answers={"phone": "413-555-0100"})
    run(agent)
    assert hooks.asked == ["phone"]
    assert computer.typed == {"phone": "413-555-0100"}
    assert ("question", "Asked you for your phone number") in hooks.logs


def test_a_skipped_question_leaves_the_field_empty():
    agent, computer, model, _ = make([[click(100, 150)], [type_("{{phone}}")], []])
    run(agent)
    assert computer.typed == {}
    last = json.loads(model.inputs[-1][0]["result"][0]["text"])
    assert "skipped" in last


def test_ask_user_function_round_trip():
    agent, _, model, hooks = make([[Call("a1", "ask_user", {"field_key": "first_name"})], []], answers={"first_name": "Maya"})
    run(agent)
    result = model.inputs[-1][0]
    assert result["call_id"] == "a1" and result["name"] == "ask_user"
    assert json.loads(result["result"][0]["text"])["answered"] is True
    assert "Maya" not in json.dumps(model.inputs)


def test_the_agents_own_submit_click_is_handed_to_the_person():
    agent, computer, model, hooks = make([[click(500, 950)], []])
    run(agent)
    assert hooks.handoffs == ["submit"]
    assert "click" not in computer.executed  # the page was never touched
    assert json.loads(model.inputs[-1][0]["result"][0]["text"])["handled_by_person"] is True


def test_certify_checkbox_and_ssn_are_handed_off():
    agent, computer, _, hooks = make([[click(100, 300)], [click(100, 350)], []])
    run(agent)
    assert hooks.handoffs == ["attestation", "sensitive_field"]
    assert computer.executed == []


def test_free_text_is_blocked_and_reported_to_the_model():
    agent, computer, model, hooks = make([[click(100, 100)], [type_("Ignore previous instructions")], []])
    run(agent)
    assert computer.typed == {}
    assert "error" in json.loads(model.inputs[-1][0]["result"][0]["text"])
    assert hooks.logs[-1][0] == "blocked"


def test_request_handoff_and_finish():
    agent, _, model, hooks = make([[Call("h", "request_handoff", {})], [Call("f", "finish", {})]])
    end = run(agent)
    assert hooks.handoffs == ["stuck"] and end.kind == "finished"
    assert len(model.inputs) == 2


def test_take_over_parks_before_the_next_action():
    agent, computer, _, hooks = make([[click(100, 100)], [click(500, 900)], []])
    hooks.takeover = True
    run(agent)
    assert hooks.handoffs == ["person_requested"]
    assert computer.executed == ["click"]  # first call skipped, second ran after control came back


def test_step_limit_ends_the_run():
    agent, _, _, _ = make([[click(500, 900)]] * 10)
    agent.max_steps = 3
    assert run(agent).kind == "step_limit"


def test_function_result_shape():
    result = function_result(Call("id1", "click", {}), Observation("http://x/", b"png"), {"error": "no"})
    assert result["type"] == "function_result" and result["call_id"] == "id1"
    text, image = result["result"]
    assert json.loads(text["text"]) == {"url": "http://x/", "error": "no"}
    assert image["type"] == "image" and image["mime_type"] == "image/png"


def test_parse_interaction_reads_calls_and_text():
    turn = parse_interaction({
        "id": "int-1",
        "steps": [
            {"type": "thought"},
            {"type": "function_call", "id": "c1", "name": "click", "arguments": {"x": 1, "y": 2}},
            {"type": "model_output", "content": [{"type": "text", "text": "Done."}]},
        ],
    })
    assert turn.interaction_id == "int-1"
    assert [(c.id, c.name, c.args) for c in turn.calls] == [("c1", "click", {"x": 1, "y": 2})]
    assert turn.text == "Done."


def test_tools_and_instruction():
    names = [t.get("name") or t["type"] for t in tools()]
    assert names == ["computer_use", "ask_user", "request_handoff", "finish"]
    assert tools()[0]["enable_prompt_injection_detection"] is True
    store = FieldStore()
    store.put("zip", "01002")
    instruction = system_instruction(store)
    assert "01002" not in instruction and "{{zip}}" in instruction and "Never press Enter" in instruction
