from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_defaults(monkeypatch):
    monkeypatch.delenv("LLM_MODE", raising=False)
    monkeypatch.delenv("NESSIE_API_KEY", raising=False)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "llm_mode": "off", "nessie_configured": False}


def test_health_reports_configuration_without_leaking_keys(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "live")
    monkeypatch.setenv("NESSIE_API_KEY", "secret-value")
    body = client.get("/api/health").json()
    assert body["llm_mode"] == "live"
    assert body["nessie_configured"] is True
    assert "secret-value" not in str(body)
