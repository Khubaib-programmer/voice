# Deployment

## Container deployment with HTTPS

The repository includes Dockerfiles for the React site, Express API, and FastAPI model service, plus PostgreSQL and Caddy in `docker-compose.yml`. Caddy obtains and renews HTTPS certificates after the server's DNS points at the host and ports 80/443 are reachable.

1. Provision a Linux host with Docker Engine and the Docker Compose plugin. Create DNS `A`/`AAAA` records for a domain you control.
2. Copy `.env.example` to `.env`. Set `APP_DOMAIN`, a strong URL-safe `POSTGRES_PASSWORD` (letters, digits, hyphens, underscores), a random `COOKIE_SECRET` of at least 32 characters, and a Google Cloud API key with Speech-to-Text, Translation, and Text-to-Speech APIs enabled. Do not commit `.env`.
3. Place the trained bundle at `ml-service/artifacts/real-source-run/best_model.joblib`; for the audited open-set calibration verify SHA-256 `2a7f9b1e370d7ef3bea013c305f7e789d3fd711a619fcc3b87aa56cdd153126a`. This 17.7 MB binary is generated locally and excluded from Git.
4. From the repository root, run `docker compose up --build -d`. The API container applies the committed Prisma migration before starting. Only Caddy's HTTP/HTTPS ports are public; PostgreSQL and the model API remain on the private compose network.
5. Verify `https://$APP_DOMAIN/`, `https://$APP_DOMAIN/health`, and the container health states. Create an account and verify all provider APIs are enabled and billed for the Google Cloud project.

To inspect logs, use `docker compose logs -f backend ml-service caddy`. Back up the `postgres_data` and `caddy_data` volumes. Upgrade schema by adding a Prisma migration and deploying it before new application code. Keep Docker, OS packages, Node/Python dependencies, and provider keys updated.

## Provider and data requirements

The app sends supported-language recordings to Google Cloud Speech-to-Text in memory. Transcribed and typed text is sent to the local custom language detector and Google Cloud Translation. TTS text is sent to Google Cloud Text-to-Speech. The app itself does not retain raw audio. Configure Google Cloud data handling, API restrictions, budget alerts, and regional policy to meet your institution's privacy requirements. Google Cloud's current Speech-to-Text v1 catalog and Text-to-Speech voice catalog do not list Odia (`or-IN`); this implementation returns a clear unavailable response for Odia voice input/playback. Google Translation lists Odia as experimental. An Odia-capable speech/TTS provider and validation are required before claiming complete four-language voice coverage. See the [current speech language catalog](https://docs.cloud.google.com/speech-to-text/docs/v1/speech-to-text-supported-languages) and [TTS voice catalog](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types).

## Deployment status and limits

Container configuration is prepared, but this project has **not** been published to a public host from this workspace. No hosting account, DNS domain, remote server, production database, or Google Cloud credential was available. Public deployment requires those external resources. The Caddy edge configuration enables HTTPS certificate management and baseline security headers; Express limits cross-origin requests to the configured frontend and uses secure, HttpOnly production session cookies. No live URL or successful production provider call is claimed. Before academic demonstration, provision those resources and validate signup, PostgreSQL persistence, microphone recording over HTTPS, provider calls, and history against the deployed environment.
