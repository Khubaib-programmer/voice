# Vaani production setup checklist

**Deployment gate:** no production deployment should be started until the Google Cloud identity, domain/DNS, VM, database password, session secret, and model artifact are ready. Never send a service-account JSON file or secret value in chat or commit it to Git.

## Environment variables and credentials

### Compose host (`.env` at repository root)

| Variable | Required | Purpose / where it comes from |
| --- | --- | --- |
| `APP_DOMAIN` | Yes | Public DNS name you control, such as `vaani.example.org`; create an `A` record pointing at the VM IPv4 address. Caddy requests and renews HTTPS certificates for it. |
| `POSTGRES_PASSWORD` | Yes | Create a unique URL-safe value (letters, digits, `-`, `_`) with `openssl rand -hex 32`. Compose uses it for the private PostgreSQL database and its `DATABASE_URL`. |
| `COOKIE_SECRET` | Yes | Generate at least 32 random characters with `openssl rand -base64 48`. It signs the backend's seven-day session cookie. |
| `GOOGLE_CLOUD_PROJECT` | Yes | Project ID in Google Cloud Console, used to select the provider quota/billing project through `x-goog-user-project`. |

The backend service account JSON is a **mounted Compose secret file**, not a `.env` string: `secrets/google-service-account.json`. The Compose service exposes it in the container as `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-service-account.json`. Keep the host file out of Git and restrict its file permissions.

### Backend (`backend/.env` for local development; Compose supplies production values)

| Variable | Required | Purpose / source |
| --- | --- | --- |
| `NODE_ENV` | Production: yes | Set to `production`; enables secure session cookie settings and proxy trust. |
| `PORT` | Usually supplied | HTTP listen port; Compose uses `4000`, while platforms commonly inject `PORT`. |
| `HOST` | No | Optional bind override. The server binds to `0.0.0.0` in production by default and loopback in development. |
| `FRONTEND_ORIGIN` | Yes | Exact browser origin, including scheme and port. For Compose use `https://<APP_DOMAIN>`; do not use `*` with credentialed CORS. |
| `DATABASE_URL` | Yes | PostgreSQL connection string from the database provider. Compose builds it using the database service name and `POSTGRES_PASSWORD`. |
| `COOKIE_SECRET` | Yes | Same strong value as the root Compose secret. |
| `ML_SERVICE_URL` | Yes | Private FastAPI base URL; in Compose it is `http://ml-service:8000`. |
| `GOOGLE_CLOUD_PROJECT` | Yes for provider calls | Google project ID selected above. |
| `GOOGLE_APPLICATION_CREDENTIALS` | ADC file path if using a key file | Local path to a service-account JSON; omit it locally when using `gcloud auth application-default login`. On the Compose VM it points to the mounted secret path. |
| `MAX_AUDIO_BYTES` | No | Defaults to `10485760` (10 MiB), matching the short synchronous Speech-to-Text request path used by the app. |

Google authentication uses Application Default Credentials (ADC) and OAuth bearer tokens on the backend. There is no Google provider credential in Vite or browser code. The backend no longer expects `GOOGLE_CLOUD_API_KEY`.

### ML service

| Variable | Required | Purpose / source |
| --- | --- | --- |
| `MODEL_PATH` | Yes in production | Path to the trained, audited artifact. Compose mounts it read-only at `/app/artifacts/real-source-run/best_model.joblib`. |
| `MIN_CONFIDENCE` | No | Optional inference override; leave unset to use the saved audited threshold. |
| `MIN_MARGIN` | No | Optional inference override; leave unset to use the saved audited threshold. |

The model artifact is excluded from Git. Before copying it to the host, verify SHA-256 `2a7f9b1e370d7ef3bea013c305f7e789d3fd711a619fcc3b87aa56cdd153126a`.

### Frontend

| Variable | Required | Purpose / source |
| --- | --- | --- |
| `VITE_API_URL` | No | Build-time API base URL. Leave empty for the recommended single-domain Caddy deployment, so requests use the same HTTPS origin. Set an API origin only if the frontend is deployed separately, then set backend `FRONTEND_ORIGIN` to the exact frontend origin. Never put provider credentials here. |

### Provider smoke test (optional test inputs)

| Variable | Purpose |
| --- | --- |
| `PROVIDER_SMOKE_AUDIO` | Path to a test `.webm` or `.ogg` recording for a real STT call. Use a short self-recorded/authorized sample. |
| `PROVIDER_SMOKE_LANGUAGE` | One of `hi`, `en`, `ta`, matching the test audio. Odia STT is unsupported by the selected Google API. |

## Google Cloud account setup

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/). Create a project for Vaani (or select a project dedicated to this app) and record its **Project ID**.
2. Link a billing account. Set a small budget alert and review API quotas. Translation is billed by characters; speech and synthesis by usage. A budget alert notifies you; it does not itself cap spend.
3. In **APIs & Services → Library**, enable **Cloud Translation API**, **Cloud Speech-to-Text API**, and **Cloud Text-to-Speech API**. The app uses Translation Basic v2, Speech-to-Text v1, and Text-to-Speech v1.
4. In **IAM & Admin → Service Accounts**, create a dedicated runtime identity named `vaani-runtime`. Do not use a personal Owner credential for the app.
5. Grant only the runtime access it needs: **Cloud Speech Client** (`roles/cloudspeech.client`), **Cloud Translation API User** (`roles/cloudtranslate.user`), and **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) for quota-project use. Do not grant Owner or Editor. Verify classic TTS calls with the smoke test after enabling the API; if Google returns a permission error, follow the TTS error's required permission before adding any role.
6. For local testing, install the Google Cloud CLI and run `gcloud init`, `gcloud config set project YOUR_PROJECT_ID`, `gcloud auth application-default login`, then `gcloud auth application-default set-quota-project YOUR_PROJECT_ID`. This uses your developer identity locally and creates ADC outside the repository.
7. For the recommended non-Google VPS, create a service-account key only if workload identity federation is not configured. Create it directly into the ignored secrets directory, then lock down permissions:

   ```sh
   mkdir -p secrets
   chmod 700 secrets
   gcloud iam service-accounts keys create secrets/google-service-account.json \
     --iam-account=vaani-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com \
     --project=YOUR_PROJECT_ID
   chmod 600 secrets/google-service-account.json
   ```

   Keep that file on the server only, mount it through Compose, and rotate/delete the key if the host is replaced. On a Google Cloud VM, attach the service account to the VM and use ADC from the metadata server instead of downloading a key.
8. Set `GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID` in the root `.env`. For local development, set it in `backend/.env`; omit `GOOGLE_APPLICATION_CREDENTIALS` when using local ADC, or point it to an ignored service-account file. Never paste credential JSON or access tokens into source code, frontend variables, issues, or chat.

Official setup/auth references: [Cloud Translation setup](https://docs.cloud.google.com/translate/docs/setup), [Speech-to-Text setup](https://docs.cloud.google.com/speech-to-text/docs/setup), [Text-to-Speech setup](https://docs.cloud.google.com/text-to-speech/docs/get-started), and [Google Cloud ADC authentication](https://docs.cloud.google.com/docs/authentication).

## Verify real provider calls after credentials are set

From `backend/`, after the local `.env` and ADC are configured, run:

```sh
npm run providers:smoke
```

This performs live Translation calls for English→Hindi and English→Odia, and live TTS calls for Hindi, English, and Tamil. Odia STT/TTS are expected to return the app's explicit unsupported response. Speech recognition is skipped unless a short authorized sample is supplied:

```sh
PROVIDER_SMOKE_AUDIO=/absolute/path/short-tamil.webm PROVIDER_SMOKE_LANGUAGE=ta npm run providers:smoke
```

Then verify the full authenticated UI flow: record a short supported-language utterance, translate it, confirm the transcription/translation, and use **Listen** for Hindi, English, or Tamil output. Test Odia typed translation separately; the Google catalog marks Odia translation experimental, so successful language listing does not guarantee every pair/request behaves like the fully supported pairs. Translation/speech provider output is third-party service output and is not produced by the custom Vaani identifier.

## Voice availability by language

| Language | Google STT v1 in app | Google TTS v1 in app | Translation |
| --- | --- | --- | --- |
| Hindi (`hi`) | Supported catalog code `hi-IN`; WebM/Opus and Ogg/Opus path implemented | `hi-IN` voices listed | Supported |
| English (`en`) | App uses `en-US` (supported; this is not an India-English-specific setting) | `en-US` voices listed | Supported |
| Tamil (`ta`) | Supported catalog code `ta-IN` | `ta-IN` voices listed | Supported |
| Odia (`or`) | Not listed by Speech-to-Text v1; app rejects voice input | No Odia voice is listed; app returns unavailable | Experimental support; test each direction after enabling billing |

These are provider catalog/configuration capabilities, **not claims of successful live calls**. No project credentials are available in the current workspace, so provider calls still need to be tested using the smoke-test process above. Google catalogs: [STT languages](https://docs.cloud.google.com/speech-to-text/docs/v1/speech-to-text-supported-languages), [TTS voices](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types), and [Translation languages](https://docs.cloud.google.com/translate/docs/languages).

## Affordable deployment architecture

### Recommended for a student demonstration: one Docker Compose VM

The repository's Compose stack fits a single Linux VM: Caddy (public HTTPS reverse proxy), Nginx static React/Vite frontend, Express API, private FastAPI classifier, and PostgreSQL on a private Docker network. Only ports 80/443 (and SSH restricted to your IP) are public. Caddy handles TLS renewal, exact-origin CORS is configured on Express, production cookies are HttpOnly/Secure, and health checks cover PostgreSQL, the loaded ML model, Express dependencies, and the frontend web root.

An example low-cost size is Hetzner **CX23, 2 vCPU / 4 GB RAM / 40 GB disk**. The provider's current table lists it at **€5.49/month excluding VAT** in its Germany/Finland price column; other region/currency prices and availability differ. This is one small, single-failure-domain host with a self-managed database: schedule encrypted off-host PostgreSQL backups and test restore. See [current Hetzner cloud prices](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/). Google API usage, domain registration, taxes, and backup storage are additional costs.

If you prefer less server administration, Railway supports Dockerfiles, private service networking, health checks, managed secrets, and a PostgreSQL service. Its Hobby plan currently has a **$5/month minimum usage with $5 usage credit**; actual compute/storage can exceed that, and it is not a fixed all-in price. See [Railway pricing](https://railway.com/pricing) and [health-check behavior](https://docs.railway.com/deployments/healthchecks). The current Compose/Caddy settings target a single origin; a separate-platform frontend needs `VITE_API_URL` set at build time and `FRONTEND_ORIGIN` set to its exact HTTPS origin.

## Production hardening and readiness checks

- Point the domain's A record at the VM. Permit inbound TCP 80/443 and restrict SSH to your IP. Do not publish ports 4000, 5432, or 8000.
- Use a unique DB password and session secret in the host `.env`, `chmod 600 .env`, and never commit it. Keep the service-account JSON in the ignored `secrets/` directory with `chmod 600`.
- `FRONTEND_ORIGIN=https://$APP_DOMAIN`; CORS uses credentials and exact origin matching. Production cookies are Secure and HttpOnly; cross-site mode is enabled for the supported credentialed frontend/API arrangement. Caddy serves HTTPS and baseline security headers.
- Verify the API readiness at `https://$APP_DOMAIN/health`. It returns 200 only when PostgreSQL answers and FastAPI reports the model loaded. Check the ML health endpoint from inside the private network and the frontend `/health-web` container check.
- Back up PostgreSQL before updates; verify the ML artifact hash; keep secrets separate from source; check Google Cloud usage/quota after provider smoke tests.

## Account-side actions still required before deployment

- Complete Google project/billing/API/service-account setup above and configure local ADC or the server secret file.
- Choose and create the VM/hosting account, configure SSH access and firewall, and provide a domain/DNS name.
- Create production `.env` values locally/on the server and put the service-account secret on the host.
- Copy the audited model artifact to the host and verify its SHA-256.

Deployment should happen only after these settings exist and `npm run providers:smoke` passes for the provider paths you intend to claim. Public launch then requires the Compose health checks and real signup, history isolation, HTTPS microphone/STT, translation, and TTS flows to pass on the deployed URL.
