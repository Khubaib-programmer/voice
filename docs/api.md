# ML service API (initial)

Base URL during local development: `http://127.0.0.1:8000`.

## `GET /health`

Returns service status and whether a trained artifact loaded. `model_loaded: false` means predictions are unavailable.

## `POST /predict`

Request JSON:

```json
{"text":"नमस्ते"}
```

Supported languages are Hindi (`hi`), English (`en`), Tamil (`ta`), and Odia (`or`). Input length is limited to 10,000 characters. Successful response includes `language`, `candidate_language`, confidence evidence, rejection reason, latency in milliseconds, and script evidence. Language can be `unknown` when text is too short or ambiguous. HTTP 503 indicates there is no trained artifact; 422 indicates invalid input.
