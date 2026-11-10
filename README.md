# AI Voice Translator

A full-stack academic project for speech transcription, language identification, translation, and speech playback for Hindi (`hi`), English (`en`), Tamil (`ta`), and Odia (`or`). The language selector scope is limited to these four languages.

> **Implementation status:** The custom four-language text identifier has been trained and evaluated on 5,000 real-source samples. The Odia code-mixed cell remains empty because no suitable verified natural source was available. Speech recognition, translation, user accounts, history, and public deployment are still to be integrated.

## Planned architecture

- `frontend/`: responsive React, TypeScript, and Tailwind dashboard.
- `backend/`: Node.js/Express REST API, authentication, translation history, and Prisma data access.
- `ml-service/`: Python/FastAPI service for custom script and language identification using character n-gram TF-IDF and scikit-learn classifiers.
- `docs/`: architecture, dataset provenance, experiments, API, and deployment notes.

The language identifier is an original project component. Its target is 500 samples per language and applicable category. English romanization is N/A. The current dataset has 5,000 verified real rows out of 5,500 targeted; Odia code-mixed is 0/500. The test-set Linear SVM accuracy is 0.969 and macro F1 is 0.9676 under a group-aware 60/20/20 split; see [ML results](docs/ml-experiments.md) and the [dataset manifest](ml-service/artifacts/dataset-manifest.json). Speech recognition, translation, and text-to-speech will use explicitly identified existing engines or APIs; they will not be described as models trained from scratch.

## Setup

Setup instructions will be added as each service is implemented. Copy service-specific `.env.example` files to `.env` and provide credentials locally. Never commit secrets or datasets.

## Development status

See [Architecture](docs/architecture.md) and [Dataset plan](docs/datasets.md). The current environment and implementation log will be maintained in the documentation as the project progresses.
