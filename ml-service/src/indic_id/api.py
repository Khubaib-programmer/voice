"""FastAPI prediction endpoint; expects a trained model artifact."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from indic_id.model import LanguageIdentifier
from indic_id.scripts import classify_script

identifier: LanguageIdentifier | None = None


class PredictionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


def load_model():
    global identifier
    path = Path(os.getenv("MODEL_PATH", "artifacts/linear_svm.joblib"))
    if path.exists():
        identifier = LanguageIdentifier(
            joblib.load(path),
            float(os.getenv("MIN_CONFIDENCE", "0.55")),
            float(os.getenv("MIN_MARGIN", "0.10")),
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    yield


app = FastAPI(title="Indic Language Identification", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": identifier is not None}


@app.post("/predict")
def predict(request: PredictionRequest):
    if identifier is None:
        raise HTTPException(status_code=503, detail="Model artifact is not available; train a model first")
    result = identifier.predict(request.text)
    result["script"] = classify_script(request.text)
    return result
