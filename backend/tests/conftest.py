from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.graph.state import Fact, Profile
from app.main import create_app
from app.services import llm
from app.services.nessie import NessieService
from app.services.programs_repo import ProgramsRepository, repository_from_env


@pytest.fixture(scope="session")
def repo() -> ProgramsRepository:
    """The fictional development programs (ZIP 00000 only)."""
    return repository_from_env("fixtures")


@pytest.fixture
def client(repo):
    # The context manager keeps one event loop alive across requests, so
    # background graph runs are not cancelled between calls.
    # Seeded personas only: tests never call the real Nessie sandbox.
    with TestClient(create_app(repo, NessieService(None))) as test_client:
        yield test_client


def make_profile(**facts) -> Profile:
    now = datetime.now(timezone.utc)
    return Profile(
        facts={
            name: Fact(value=value, provenance="user_reported", updated_at=now)
            for name, value in facts.items()
        }
    )


@pytest.fixture(autouse=True)
def templates_only():
    """No test reaches a real model; tests that need one install a fake."""
    llm.set_llm(None)
    yield
    llm.set_llm(None)
