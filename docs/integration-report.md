# Local integration report — 2026-11-10

## Verified locally

- The React/Vite site returned HTTP 200 and loaded in a narrow browser viewport. The signup form created a temporary local account and displayed the responsive translation dashboard. That account was removed after the check.
- Express returned HTTP 200 for `/health`. PostgreSQL 16 was started locally and the Prisma migration was applied.
- Signup returned 201 for two temporary accounts. Login succeeded; incorrect credentials returned 401. Logout cleared the HttpOnly session cookie and the cleared cookie received 401 on `/api/auth/me`.
- Translation history returned only rows owned by each account. Cross-account delete returned 404; own-row delete returned 204. All temporary API test accounts and history rows were removed.
- Express successfully called the live FastAPI service as part of a translation request. With no Google Cloud ADC credentials configured, the provider returned an actionable HTTP 503 and did not save a history result.
- The final readiness check returned HTTP 200 only with PostgreSQL responding and the trained ML model loaded.
- After restarting FastAPI against the final saved model bundle, `/health` reported `model_loaded: true`. Live `/predict` checks returned the expected labels for native Hindi, English, Tamil, Odia, Hindi-English, and Tamil-English; Arabic was rejected as `unknown` with `unsupported_script`.
- Frontend/backend suites passed (1 and 11 tests) and production builds passed. In the final rerun, 30 ML tests passed; two dataset-preparation test modules could not be collected because `pyarrow` is not installed for this Python 3.15 environment. The earlier audit run recorded 33 ML tests passing, but the final run does not independently reproduce that full suite.
- A live microphone waveform is now calculated from the browser's Web Audio analyser while recording. The browser UI was checked at a mobile-sized viewport.

## Not verified in this environment

- Actual Google Cloud Translation, Speech-to-Text, or Text-to-Speech calls: Google Cloud ADC/project credentials are not configured in this workspace. Provider calls remain unverified; the app returns a configuration error instead of pretending these calls succeeded.
- End-to-end microphone capture, transcription, and audio playback: provider credentials and an authorized browser microphone were not available for a complete provider-backed flow. Odia voice input and TTS are unsupported by the configured Google catalogs and are surfaced as unavailable.
- Docker Compose build/health checks and public deployment: Docker is not installed. No production domain, hosting account, production database, or Google Cloud ADC identity is configured. There is no public URL to report.

The project is locally integrated for account, model inference, and history flows; provider-backed voice and translation and public hosting still require external credentials and infrastructure. See [deployment instructions](deployment.md) for setup requirements.
