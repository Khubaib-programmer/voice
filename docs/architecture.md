# Architecture

## System overview

The browser dashboard records or accepts speech, obtains a transcript from a configured speech-to-text provider, sends text to the custom ML service for language/script detection, requests translation from a configured translation provider, and optionally plays translated speech using a configured text-to-speech provider. The Express API owns user sessions and translation history. PostgreSQL is the production database, accessed through Prisma.

```text
React + TypeScript + Tailwind
        | HTTPS / REST
        v
Node.js + Express ---- Prisma ---- PostgreSQL
        |                           (users, history)
        +---- HTTP ---- FastAPI / scikit-learn language ID
        +---- configured speech, translation, and TTS providers
```

Speech-to-text, translation, and text-to-speech adapters use Google Cloud Speech-to-Text v1, Cloud Translation v2, and Cloud Text-to-Speech, configured through `GOOGLE_CLOUD_API_KEY`. The custom language detector remains the local FastAPI model. These are third-party services; the application does not claim to have trained their models. The current Google Speech-to-Text v1 and Text-to-Speech language catalogs do not list Odia support, so Odia voice input and Odia speech playback return an explicit HTTP 503 until an Odia-capable provider is configured. Cloud Translation lists Odia as experimental. A missing key returns HTTP 503 instead of sample or mock output.

## Language scope

Supported language codes are `hi` (Hindi), `en` (English), `ta` (Tamil), and `or` (Odia). These are the only options exposed by language selectors and supported by service validation. The language identifier distinguishes native-script and Latin-script evidence and may return an unknown/ambiguous result when evidence is insufficient. Code-mixed examples are labeled by the dominant/target language based on verified source annotations; this remains sentence-level classification, not token-level language identification.

## Initial service boundaries

- Frontend handles recording permissions, source/target selection, transcript and translation display, copy/playback controls, loading/error states, and history UI.
- Backend validates requests, handles authentication, persists history, and coordinates service calls.
- ML service exposes language/script prediction and experiment metadata; model artifacts are generated locally from documented data and are not committed.
- PostgreSQL stores user and history records. Secrets and provider keys are supplied through environment variables.

## Implemented request flow

The React app records WebM/Opus or Ogg/Opus in the browser and sends it to Express as a bounded multipart request. Express sends the bytes to Google Speech-to-Text and does not persist the audio. For text or the resulting transcript, Express asks the local FastAPI model for language/script evidence, calls Google Cloud Translation using the user's selected source and target languages, then stores only the source/translated text and language metadata in PostgreSQL. Text-to-speech returns provider-generated MP3 bytes for immediate playback. History is account-scoped and can be deleted. The API rejects browser write requests from origins other than the configured frontend.

The external provider key and a PostgreSQL instance are required for a fully functional translation workflow. Provider availability and supported voice/language combinations are controlled by Google Cloud and must be checked in the provisioned account before public release. Browser recording requires HTTPS outside localhost. A second speech/TTS provider is still required to deliver all features for Odia.

## Quality and privacy

Use request validation, bounded input sizes, safe password hashing, and explicit provider error handling. Do not persist raw audio by default. Document retention and provider data handling before public launch. Report measured model metrics and test results only after running the corresponding experiments.
