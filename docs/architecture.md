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

Provider adapters must identify their upstream service and required credentials. No provider is selected or configured yet.

## Language scope

Supported language codes are `hi` (Hindi), `en` (English), `ta` (Tamil), and `or` (Odia). These are the only options exposed by language selectors and supported by service validation. The language identifier distinguishes native-script and Latin-script evidence and may return an unknown/ambiguous result when evidence is insufficient. Code-mixed examples are labeled by the dominant/target language based on verified source annotations; this remains sentence-level classification, not token-level language identification.

## Initial service boundaries

- Frontend handles recording permissions, source/target selection, transcript and translation display, copy/playback controls, loading/error states, and history UI.
- Backend validates requests, handles authentication, persists history, and coordinates service calls.
- ML service exposes language/script prediction and experiment metadata; model artifacts are generated locally from documented data and are not committed.
- PostgreSQL stores user and history records. Secrets and provider keys are supplied through environment variables.

## Quality and privacy

Use request validation, bounded input sizes, safe password hashing, and explicit provider error handling. Do not persist raw audio by default. Document retention and provider data handling before public launch. Report measured model metrics and test results only after running the corresponding experiments.
