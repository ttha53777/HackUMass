from fastapi.testclient import TestClient

from app.main import app
from app.services.llm import reset_llm, set_llm

client = TestClient(app)


def test_health_defaults(monkeypatch):
    monkeypatch.delenv("LLM_MODE", raising=False)
    monkeypatch.delenv("NESSIE_API_KEY", raising=False)
    monkeypatch.delenv("BROWSER_PROVIDER", raising=False)
    reset_llm()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok", "llm_mode": "off", "nessie_configured": False, "browser_agent": False,
    }


def test_health_reports_configuration_without_leaking_keys(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "live")
    monkeypatch.setenv("NESSIE_API_KEY", "secret-value")
    set_llm(object())  # any configured client
    body = client.get("/api/health").json()
    assert body["llm_mode"] == "live"
    assert body["nessie_configured"] is True
    assert "secret-value" not in str(body)


def test_live_mode_without_a_gemini_key_falls_back_to_off(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "live")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    reset_llm()
    assert client.get("/api/health").json()["llm_mode"] == "off"
