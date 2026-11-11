# Vaani — AI Voice Translator

Vaani is an academic full-stack application for Hindi (`hi`), English (`en`), Tamil (`ta`), and Odia (`or`). It combines microphone transcription, the existing custom language identifier, provider-backed translation, and translated-text playback.

## Current workflow

1. Sign up or log in.
2. Type or paste text, or record speech in one of the four supported languages.
3. A recording is sent to the backend for Groq Whisper transcription with no forced language parameter. The transcript appears in the editable source area. Odia transcription has not been independently verified.
4. Express sends source text to the existing FastAPI Character TF-IDF + Linear SVM model and displays its language result and score type.
5. Choose a target language and translate. Express rechecks the source prediction, then sends the text and model-detected source language to Groq.
6. Copy the translated text or use browser SpeechSynthesis to speak the translation in the selected target locale. Playback offers play, pause, resume, and stop; a missing locale voice is reported instead of switching to English.

Whisper infers speech language without a user-selected hint. Odia transcription can be attempted but has not been independently verified. Odia text translation is available through the configured translation model. Odia playback works only on devices that provide an `or-IN` SpeechSynthesis voice. No translations or audio are saved; PostgreSQL stores accounts only. Third-party Whisper and translation models are not represented as trained by this project. The custom ML model and its audited metrics are unchanged (Linear SVM test accuracy 0.969; macro F1 0.9676 under the documented split).

## Services

- `frontend/`: React, TypeScript, Vite, Tailwind CSS, Framer Motion.
- `backend/`: Node.js, Express, Prisma, PostgreSQL, secure cookie authentication, and backend-only Groq API calls.
- `ml-service/`: FastAPI and the saved custom Indic language-identification model.
- `docs/`: architecture, datasets, ML evaluation, API contract, and deployment.

## Local setup

Requirements: Node.js 22+, Python 3.12, and PostgreSQL 16+.

1. Create the `voice_translator` PostgreSQL database. Copy `backend/.env.example` to `backend/.env`, then set `DATABASE_URL`, a random `COOKIE_SECRET` of at least 32 characters, and `GROQ_API_KEY`. Provider credentials remain on the backend.
2. Run `cd backend && npm ci && npm run db:generate`. For a newly created empty database, run `npm run db:deploy` to initialize it, then `npm run dev`. Do not apply migrations to an existing database without reviewing them: the pending history-removal migration deletes legacy translation rows.
3. Run the ML service from `ml-service/`: `PYTHONPATH=src MODEL_PATH=artifacts/real-source-run/best_model.joblib .venv312/bin/uvicorn indic_id.api:app --host 127.0.0.1 --port 8000`.
4. Run `cd frontend && npm ci && npm run dev`, then open `http://localhost:5173`.

Microphone capture requires user permission and a secure browser context (localhost is allowed for development; deployed sites require HTTPS). See [API docs](docs/api.md), [architecture](docs/architecture.md), [deployment](docs/deployment.md), and [production setup checklist](docs/production-setup-checklist.md).

## Tests and builds

Run `cd ml-service && PYTHONPATH=src .venv312/bin/python -m pytest -q`, `cd backend && npm test && npm run build`, and `cd frontend && npm test && npm run build`. The trained model artifact is excluded from Git; provide it to the ML service and verify its hash against [the ML audit](docs/ml-audit.md).
