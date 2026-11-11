FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY artifacts ./artifacts

ENV PYTHONPATH=/app/src
ENV MODEL_PATH=/app/artifacts/real-source-run/best_model.joblib

CMD ["sh", "-c", "uvicorn indic_id.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
