# Production credentials and setup checklist

Vaani has no Google Cloud provider dependency. Speech transcription and translation use Groq through Express; translated speech playback uses browser SpeechSynthesis and needs no server credential. Create Groq credentials in the [Groq Console](https://console.groq.com/keys). Confirm currently offered models and service limits in the [model catalog](https://console.groq.com/docs/models) and [speech-to-text guide](https://console.groq.com/docs/speech-to-text); model availability, rate limits, and costs are account- and date-dependent.

## Environment variables

| Variable | Required | Value/source |
| --- | --- | --- |
| `GROQ_API_KEY` | Yes for transcription/translation | Create a key in Groq Console. Store in `backend/.env` locally or the backend host's secret manager. Do not prefix with `VITE_`. |
| `GROQ_STT_MODEL` | No | Defaults to `whisper-large-v3`; choose a currently available transcription model from Groq's catalog. |
| `GROQ_TRANSLATION_MODEL` | No | Defaults to `openai/gpt-oss-120b`; choose a currently available chat model from the catalog. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. For Compose it is built from the database service and `POSTGRES_PASSWORD`; for hosted Postgres use the provider's connection string and TLS parameters. |
| `COOKIE_SECRET` | Yes | Generate a random secret of 32+ characters, e.g. `openssl rand -base64 48`. |
| `FRONTEND_ORIGIN` | Yes | Exact public frontend origin (for example `https://vaani.example.org`), no trailing slash. |
| `ML_SERVICE_URL` | No locally / required by topology | FastAPI base URL; default is `http://127.0.0.1:8000`. Compose sets `http://ml-service:8000`. |
| `PORT`, `HOST`, `NODE_ENV` | Optional | Backend bind settings; production uses `NODE_ENV=production`, port 4000, and binds to `0.0.0.0` by default. |
| `MAX_AUDIO_BYTES` | Optional | Backend recording limit; defaults to 10 MiB. |
| `APP_DOMAIN` | Compose | Public DNS hostname used by Caddy for HTTPS. |
| `POSTGRES_PASSWORD` | Compose | Strong URL-safe password used by the PostgreSQL container and backend URL. |
| `VITE_API_URL` | Optional frontend | Browser-visible API base URL only. Never put any provider key here. The production Caddy proxy allows an empty value for same-origin `/api`. |

Examples are in the root `.env.example`, `backend/.env.example`, and `frontend/.env.example`. Keep actual `.env` files out of Git. For hosted production, set secrets in the hosting provider's secret/environment configuration rather than in the Vite build. The public frontend must never receive `GROQ_API_KEY`.

## Configure provider and confirm a live call

1. Sign into Groq Console and create a project/API key with access to transcription and chat completions.
2. Configure billing or usage limits as required by the account. Do not assume an endpoint/model is free; check current [pricing and model availability](https://console.groq.com/docs/models).
3. Set `GROQ_API_KEY` in `backend/.env` and restart Express. The `/health` endpoint checks the database and ML model, not Groq credentials.
4. Run `cd backend && npm run providers:smoke` to make live short text-translation calls. For real STT, provide a consented, supported recording file: `PROVIDER_SMOKE_AUDIO=/path/to/sample.webm PROVIDER_SMOKE_LANGUAGE=hi npm run providers:smoke`. Valid speech languages in this app are `hi`, `en`, and `ta`. The script omits transcript contents from output.
5. Review account usage after smoke calls and test translations into Hindi, English, Tamil, and Odia with native speakers before relying on the results.

Unit tests stub the SDK boundary; they verify request construction and error handling but are not provider integration evidence. The smoke script requires real credentials/audio to verify provider calls.

## Voice feature support

- Speech input: recordings are sent to Groq Whisper without a forced language parameter; Whisper infers speech language. Users may attempt all four supported languages, but Odia transcription has not been independently verified and must not be presented as a verified capability.
- Speech playback: Web Speech API is invoked only for the translated text and selected target locale. Hindi, English, Tamil, or Odia playback works only if the browser/device lists a corresponding voice (`hi-*`, `en-*`, `ta-*`, `or-*`). Missing voices produce an actionable error; Indic text is never spoken with an English fallback. Browser voice inventories vary, so verify on each target device.
- Translation: Groq receives source text and the custom model's detected language code plus selected target language. Unknown/ambiguous source predictions are rejected. A provider call is not claimed as verified until the smoke test or a user flow succeeds with the configured account.

## Suggested affordable deployment

For a student workload, a single small Docker-capable VPS plus a managed or Compose PostgreSQL database is a simple low-cost starting point. The included Compose stack runs Vite static assets, Express, FastAPI, PostgreSQL, and Caddy HTTPS together. Keep the ML artifact mounted read-only, backup the account database, and monitor memory/CPU because scikit-learn model loading adds a baseline. Alternatively, use a static host for the frontend, a small container host for Express/FastAPI, and a low-tier managed PostgreSQL service; this separates scaling but adds network/service configuration.

Before deployment, verify `APP_DOMAIN` DNS, host firewall ports 80/443, `FRONTEND_ORIGIN`, production cookies, persistent database volume/backups, model artifact hash, `GROQ_API_KEY`, provider spending controls, and all health checks. Deploy only after the actual voice/text paths and no-persistence behavior pass on the public HTTPS URL.
