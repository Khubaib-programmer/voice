# AI Voice Translator

A full-stack academic project for speech transcription, language identification, translation, and speech playback for Hindi (`hi`), English (`en`), Tamil (`ta`), and Odia (`or`). The language selector scope is limited to these four languages.

> **Implementation status:** Project foundation only. No model has been trained, no speech or translation provider has been integrated, and no deployment is live yet. Metrics will be reported only after reproducible evaluation.

## Planned architecture

- `frontend/`: responsive React, TypeScript, and Tailwind dashboard.
- `backend/`: Node.js/Express REST API, authentication, translation history, and Prisma data access.
- `ml-service/`: Python/FastAPI service for custom script and language identification using character n-gram TF-IDF and scikit-learn classifiers.
- `docs/`: architecture, dataset provenance, experiments, API, and deployment notes.

The language identifier is an original project component. Its dataset target is 500 samples per language and category (native script, romanized where applicable, and code-mixed). English is not romanizable into Latin script; per the project decision, that cell is marked not applicable rather than mislabeled. Speech recognition, translation, and text-to-speech will use explicitly identified existing engines or APIs; they will not be described as models trained from scratch.

## Setup

Setup instructions will be added as each service is implemented. Copy service-specific `.env.example` files to `.env` and provide credentials locally. Never commit secrets or datasets.

## Development status

See [Architecture](docs/architecture.md) and [Dataset plan](docs/datasets.md). The current environment and implementation log will be maintained in the documentation as the project progresses.
