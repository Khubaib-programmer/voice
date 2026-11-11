# API contract

All `/api` routes require the signed-in user's HttpOnly session cookie. Mutating requests are restricted to configured frontend origins. JSON bodies are limited to 64 KiB. Audio uploads use in-memory multipart handling with a 10 MiB limit and are not persisted.

## Account routes

- `POST /api/auth/signup` — create an account and set the session cookie.
- `POST /api/auth/login` — verify credentials and set the session cookie.
- `POST /api/auth/logout` — clear the session cookie.
- `GET /api/auth/me` — return the current account, or 401.

## Translator routes

- `POST /api/transcribe` — multipart field: `audio` (WebM/Opus or Ogg/Opus). There is no language field. Calls Groq Whisper without a `language` parameter so Whisper can infer the spoken language, then calls the custom FastAPI detector on the transcript. Returns `{ "text": "…", "detection": { ... } }`. Recording attempts are accepted for all four languages; Odia transcription has not been independently verified.
- `POST /api/detect` — JSON `{ "text": "…" }`, up to 10,000 characters. Returns `{ "detection": { ... } }` from the existing FastAPI model.
- `POST /api/translate` — JSON `{ "text": "…", "targetLanguage": "en" }`. The backend detects source with the existing custom model, rejects unknown/ambiguous text and same-language targets, then calls Groq using the model-detected source. The client does not submit or assume a source language. Returns `{ "text", "translatedText", "sourceLanguage", "targetLanguage", "detection" }`.
- `GET /health` — checks PostgreSQL availability and FastAPI model readiness.

There are no translation-history endpoints, translation database writes, or TTS endpoints. Browser playback uses the translated output with a matching Web Speech API voice. The browser does not send translated text to an external TTS service. If no voice matching the chosen language locale exists on the device, the frontend reports that condition without substituting English for an Indic target.

## Provider configuration

`GROQ_API_KEY`, `GROQ_STT_MODEL` and `GROQ_TRANSLATION_MODEL` are backend-only environment variables. The Vite frontend must never receive the Groq key. Groq Whisper is configured with `whisper-large-v3`; translation defaults to `openai/gpt-oss-120b`. Both model identifiers can be overridden on the backend. Calls without a configured key return a clear HTTP 503. Provider authentication, rate, quota, and billing behavior are determined by the user's Groq account. The custom language identifier remains the project's saved FastAPI model and is never replaced by Groq/LLM language classification.
