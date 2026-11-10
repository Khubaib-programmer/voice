import joblib
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
    _, models, _, _ = compare_models(examples)
    monkeypatch.setattr(api, "identifier", LanguageIdentifier(models["linear_svm"]))
    response = TestClient(api.app).post("/predict", json={"text": "नमस्ते भारत"})
    assert response.status_code == 200
    assert response.json()["script"]["script"] == "Devanagari"
    assert response.json()["language"] in {"hi", "unknown"}


def test_fresh_fastapi_lifespan_loads_saved_bundle(tmp_path, monkeypatch):
    examples = []
    for i in range(12):
        examples.extend([
            (f"good morning from london {i}", "en"),
            (f"नमस्ते भारत दुनिया मित्र {i}", "hi"),
        ])
    _, _, _, model = compare_models(examples)
    artifact = tmp_path / "fresh-model.joblib"
    joblib.dump({"pipeline": model, "min_confidence": 0.0, "min_margin": 0.0}, artifact)
    monkeypatch.setenv("MODEL_PATH", str(artifact))
    monkeypatch.setattr(api, "identifier", None)

    # Entering TestClient starts a new FastAPI lifespan, matching service startup.
    with TestClient(api.app) as client:
        assert client.get("/health").json() == {"status": "ok", "model_loaded": True}
        response = client.post("/predict", json={"text": "नमस्ते भारत दुनिया"})
    assert response.status_code == 200
    assert response.json()["candidate_language"] == "hi"
