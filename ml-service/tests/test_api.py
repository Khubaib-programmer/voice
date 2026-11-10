from fastapi.testclient import TestClient

from indic_id import api
from indic_id.model import LanguageIdentifier, compare_models


def test_predict_requires_trained_artifact(monkeypatch):
    monkeypatch.setattr(api, "identifier", None)
    client = TestClient(api.app)
    response = client.post("/predict", json={"text": "hello world"})
    assert response.status_code == 503
    assert "train a model" in response.json()["detail"]


def test_predict_rejects_oversized_input():
    client = TestClient(api.app)
    response = client.post("/predict", json={"text": "a" * 10_001})
    assert response.status_code == 422


def test_loaded_model_includes_script_evidence(monkeypatch):
    examples = []
    for i in range(10):
        examples.extend([
            (f"good morning from london {i}", "en"),
            (f"नमस्ते भारत दुनिया मित्र {i}", "hi"),
        ])
    _, models = compare_models(examples)
    monkeypatch.setattr(api, "identifier", LanguageIdentifier(models["linear_svm"]))
    response = TestClient(api.app).post("/predict", json={"text": "नमस्ते भारत"})
    assert response.status_code == 200
    assert response.json()["script"]["script"] == "Devanagari"
    assert response.json()["language"] in {"hi", "unknown"}
