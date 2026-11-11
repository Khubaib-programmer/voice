# Deployment

The repository includes a production-oriented Docker Compose stack for the React/Vite frontend, Express backend, FastAPI model service, PostgreSQL, and Caddy HTTPS edge. Public deployment is not claimed until a host, domain, credentials, and real user flows have been configured and verified.

## Production setup

1. Provision a host that can run Docker Compose and has enough memory for the Python/scikit-learn model. Configure DNS for the deployment host.
2. Copy `.env.example` to `.env`. Set `APP_DOMAIN`, `POSTGRES_PASSWORD`, `COOKIE_SECRET` (at least 32 random characters), and `GROQ_API_KEY`. Model defaults can remain as listed or be set with `GROQ_STT_MODEL` and `GROQ_TRANSLATION_MODEL`.
3. Keep `.env` out of Git. Groq credentials are injected only into the backend container. Do not set a `VITE_GROQ_API_KEY` or otherwise place provider secrets in the frontend build.
4. The production model artifact is included at `ml-service/artifacts/real-source-run/best_model.joblib`; a fresh repository checkout retrieves it with the source. Verify it before startup with `shasum -a 256 ml-service/artifacts/real-source-run/best_model.joblib`. The expected SHA-256 is `2a7f9b1e370d7ef3bea013c305f7e789d3fd711a619fcc3b87aa56cdd153126a`.
5. Review provider data handling, quotas and billing in the Groq account. On a newly created empty database only, build the backend image and explicitly initialize the schema with `docker compose run --rm backend npm run db:deploy`. Then deploy with `docker compose up -d --build`, and inspect `docker compose ps` and logs. The backend container does not automatically run migrations at startup.
6. Verify HTTPS via Caddy, `/health`, account creation/login/logout, text detection, live translations, microphone transcription for Hindi/English/Tamil, target speech voice availability, and no translation persistence.

Production Express permits only the configured `FRONTEND_ORIGIN`, trusts one reverse proxy, and sets Secure/HttpOnly session cookies. Caddy provisions HTTPS certificates. Health checks gate on PostgreSQL and FastAPI model readiness. The pending history-removal migration drops the legacy `TranslationHistory` table and deletes all rows in it. Never run it against a database with data that must be preserved. The database migration status could not be verified from this workspace; back up and inspect the target database before any schema migration. The backend image deliberately leaves migrations to an explicit operator step.

## Provider capability and limitations

Groq Whisper receives recordings without a forced language hint and performs its own multilingual transcription attempt. Users may record speech in any of the four product languages; Odia transcription has not been independently verified, so the app does not claim verified Odia voice recognition ([Groq speech-to-text docs](https://console.groq.com/docs/speech-to-text)). Groq chat completions provide translation for the four supported target codes; actual language quality and availability depend on the selected model and provider account. Browser SpeechSynthesis is used for playback, so the device must have a matching locale voice. If an Odia (`or-IN`) voice is missing, playback displays an error and does not silently use English. These capabilities do not mean a live provider call has passed: use `cd backend && npm run providers:smoke` after setting credentials and a real audio sample.

The app retains account data only. Audio is held in backend memory during provider submission; text and translated results stay in the user's page state. Groq receives audio/text required for its respective inference calls. Confirm institutional/privacy requirements and provider account controls before public use.

## Current deployment status

The codebase is deployment-ready at the configuration level, but no public URL or live hosted workflow is verified from this workspace. An actual Groq key, production host, DNS and public network verification are required before reporting a deployment as complete.
