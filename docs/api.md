# Application API

The browser calls Express at `http://localhost:4000`. The React client sends credentials as an HTTP-only session cookie. All language inputs accept only `hi`, `en`, `ta`, or `or`.

## Authentication

- `POST /api/auth/signup` — JSON `{ "email": "…", "password": "at least 10 characters" }`; creates a bcrypt password hash and a 7-day HTTP-only session cookie.
- `POST /api/auth/login` — same JSON body; returns generic credential errors.
- `POST /api/auth/logout` — clears the session cookie.
- `GET /api/auth/me` — returns the current account; protected.

## Translation and history (authenticated)

- `POST /api/translate` — JSON `{ "text": "…", "sourceLanguage": "en", "targetLanguage": "hi" }`. Text is limited to 10,000 characters. Runs custom language detection, invokes Cloud Translation, stores the successful translation, and returns both text values and detection evidence.
- `POST /api/translate/audio` — multipart fields `audio` (WebM/Opus or Ogg/Opus), `sourceLanguage`, and `targetLanguage`. Audio is limited to 12 MiB in memory, sent to Cloud Speech-to-Text, then follows the same translation path. Audio bytes are not saved by the app.
- `POST /api/tts` — JSON `{ "text": "…", "language": "hi" }`; returns provider MP3 as base64 for immediate browser playback.
- `GET /api/history?limit=25` — returns up to 100 rows for the signed-in account, newest first.
- `DELETE /api/history/:id` — deletes only a row owned by the signed-in account.

Provider calls require `GOOGLE_CLOUD_API_KEY`; absent credentials produce HTTP 503. The current Speech-to-Text v1 and Text-to-Speech catalogs do not list Odia, so Odia audio requests return 503 pending integration of another provider. Google Translation lists Odia as experimental. Google Cloud error, rate, and supported-language behavior depend on the configured project and billing. The system does not substitute mock translations or speech.

## Health checks

- `GET /health` on Express returns API status.
- `GET /health` on the ML service returns `model_loaded`.
- `POST /predict` on the ML service accepts `{"text":"नमस्ते"}` and returns language/confidence/script evidence.

Account routes and translation routes are rate-limited only for authentication at present; configure upstream quotas and additional per-user limits before a high-traffic public launch. HTTP 401 indicates no valid session, 422 is FastAPI request validation, and 503 means a required dependency is unavailable or unconfigured.
