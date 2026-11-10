# AI Voice Translator

A full-stack academic project for speech transcription, language identification, translation, and speech playback for Hindi (`hi`), English (`en`), Tamil (`ta`), and Odia (`or`). The language selector scope is limited to these four languages.

> **Implementation status:** The four-language text identifier, React dashboard, Express API, Prisma schema, account endpoints, translation history, and provider adapters are implemented and locally integrated. Google Cloud does not list Odia in the configured Speech-to-Text v1 or TTS catalogs; Odia voice input and playback return a clear unavailable response until a second provider is integrated. Google lists Odia translation as experimental. The Odia code-mixed ML dataset cell is empty. Cloud credentials and production infrastructure are required for provider-backed voice/translation and public deployment; no public URL is available yet.

## Planned architecture

- `frontend/`: responsive React, TypeScript, and Tailwind dashboard.
- `backend/`: Node.js/Express REST API, authentication, translation history, and Prisma data access.
- `ml-service/`: Python/FastAPI service for custom script and language identification using character n-gram TF-IDF and scikit-learn classifiers.
- `docs/`: architecture, dataset provenance, experiments, API, and deployment notes.

The language identifier is an original project component. Its target is 500 samples per language and applicable category. English romanization is N/A. The current dataset has 5,000 verified real rows out of 5,500 targeted; Odia code-mixed is 0/500. The test-set Linear SVM accuracy is 0.969 and macro F1 is 0.9676 under a group-aware 60/20/20 split; see [ML results](docs/ml-experiments.md) and the [dataset manifest](ml-service/artifacts/dataset-manifest.json). Speech recognition, translation, and text-to-speech use explicitly identified existing APIs; they are not models trained from scratch.

## Local setup

Requirements: Node.js 22+, Python 3.12, PostgreSQL 16+, and a Google Cloud project with Speech-to-Text, Translation, and Text-to-Speech APIs enabled.

1. Create PostgreSQL database `voice_translator` and copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL`, a random `COOKIE_SECRET` of at least 32 characters, and `GOOGLE_CLOUD_API_KEY`.
2. Install and launch backend: `cd backend && npm ci && npm run db:generate && npm run db:deploy && npm run dev`.
3. Launch the ML service from `ml-service/`: `PYTHONPATH=src MODEL_PATH=artifacts/real-source-run/best_model.joblib .venv312/bin/uvicorn indic_id.api:app --host 127.0.0.1 --port 8000` (use your Python environment's `uvicorn` if it is not `.venv312`).
4. Copy `frontend/.env.example` to `frontend/.env`, then run `cd frontend && npm ci && npm run dev`.
5. Open `http://localhost:5173`. Microphone capture requires user permission; production capture requires HTTPS.

For the actual local integration results and remaining dependency gaps, see the [integration report](docs/integration-report.md). For container deployment, see [Deployment](docs/deployment.md). The saved model file is intentionally excluded from Git; mount or securely provide `ml-service/artifacts/real-source-run/best_model.joblib` and verify its hash in the ML audit before starting the ML container.

Run independent checks with `cd ml-service && PYTHONPATH=src .venv312/bin/python -m pytest -q`, `cd backend && npm test && npm run build`, and `cd frontend && npm test && npm run build`.

## Development status

See [Architecture](docs/architecture.md), [Dataset provenance](docs/datasets.md), [ML audit](docs/ml-audit.md), and [Deployment](docs/deployment.md). Google Cloud provider use is documented in [the API contract](docs/api.md). Speech and translation providers remain third-party services, not project-trained models.
