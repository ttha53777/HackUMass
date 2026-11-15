"""The fill sheet: values come from the profile or the person, and never leak."""

import pytest

from app.execution.fields import (
    CATALOGUE,
    FieldStore,
    InvalidAnswer,
    clean_answer,
    question_for,
    sheet_lines,
    store_from_profile,
)
from tests.conftest import make_profile

REGION = {"01002": {"city": "Amherst", "county": "Hampshire", "state": "MA"}}


def test_store_takes_profile_facts_and_the_zip_region():
    profile = make_profile(zip="01002", household_size=3, monthly_income=1450.4, needs=["food"])
    store = store_from_profile(profile, REGION.get)
    assert {k: store.value(k) for k in store.known()} == {
        "zip": "01002", "city": "Amherst", "state": "MA", "household_size": "3", "monthly_income": "1,450",
    }


def test_unconfirmed_income_is_not_used():
    profile = make_profile(monthly_income=900)
    profile.facts["monthly_income"].confirmed = False
    assert "monthly_income" not in store_from_profile(profile).known()


def test_values_never_appear_in_repr_or_prompt_lines():
    store = FieldStore()
    store.put("phone", "413-555-0100")
    assert "555" not in repr(store)
    lines = "\n".join(sheet_lines(store))
    assert "555" not in lines
    assert "{{phone}} = Phone number (known)" in lines
    assert "{{email}} = Email address (not known yet" in lines


def test_clear_wipes_everything():
    store = FieldStore()
    store.put("first_name", "Maya")
    store.clear()
    assert store.known() == set() and store.value("first_name") is None


def test_unknown_key_is_rejected():
    with pytest.raises(KeyError):
        FieldStore().put("ssn", "000-00-0000")


def test_answers_are_validated_without_echoing_them():
    assert clean_answer("phone", " (413) 555-0100 ") == "(413) 555-0100"
    assert clean_answer("date_of_birth", "4/7/1961") == "4/7/1961"
    with pytest.raises(InvalidAnswer) as exc:
        clean_answer("email", "not-an-email")
    assert "not-an-email" not in str(exc.value)
    with pytest.raises(InvalidAnswer):
        clean_answer("zip", "1234")
    with pytest.raises(InvalidAnswer):
        clean_answer("first_name", "   ")


def test_questions_are_worded_by_us():
    for key in CATALOGUE:
        question = question_for(key)
        assert question.id == f"agent:{key}" and question.type == "text" and question.target_field == key


def test_unconfirmed_household_size_is_not_used():
    # A household paper read but not yet confirmed must not reach a form.
    profile = make_profile(household_size=3)
    profile.facts["household_size"].confirmed = False
    assert "household_size" not in store_from_profile(profile).known()


def test_disputed_facts_are_not_used():
    from app.graph.state import Conflict

    profile = make_profile(household_size=2, monthly_income=1240.0)
    profile.conflicts.append(Conflict(field="household_size", candidates=[]))
    known = store_from_profile(profile).known()
    assert "household_size" not in known and "monthly_income" in known
