import { config } from "../config.js";
import { httpError } from "../http.js";
import type { LanguageCode } from "../languages.js";

export type Detection = {
  language: LanguageCode | "unknown";
  confidence: number;
  confidence_kind?: string;
  reason?: string | null;
};

const acceptedLanguages = new Set<string>(["hi", "en", "ta", "or", "unknown"]);

function isPrediction(value: unknown): value is Detection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prediction = value as Record<string, unknown>;
  if (typeof prediction.language !== "string" || !acceptedLanguages.has(prediction.language)) return false;
  if (typeof prediction.confidence !== "number" || !Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1) return false;
  if (prediction.confidence_kind !== undefined && typeof prediction.confidence_kind !== "string") return false;
  if (prediction.reason !== undefined && prediction.reason !== null && typeof prediction.reason !== "string") return false;
  return true;
}

function responseShape(value: unknown) {
  if (value === undefined) return { bodyType: "invalid-json" };
  if (value === null) return { bodyType: "null" };
  if (Array.isArray(value)) return { bodyType: "array", itemCount: value.length };
  if (typeof value !== "object") return { bodyType: typeof value };

  const body = value as Record<string, unknown>;
  const expectedKeys = ["candidate_language", "confidence", "confidence_kind", "language", "latency_ms", "margin", "reason", "script"];
  return {
    bodyType: "object",
    keys: Object.keys(body).filter((key) => expectedKeys.includes(key)).sort(),
    unexpectedKeyCount: Object.keys(body).filter((key) => !expectedKeys.includes(key)).length,
    languageType: typeof body.language,
    confidenceType: typeof body.confidence,
    confidenceKindType: typeof body.confidence_kind,
  };
}

function logResponseIssue(response: Response, body: unknown, reason: string) {
  // Never include request text, response values, provider details, or credentials.
  console.error("[ml] Prediction response rejected", {
    reason,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "missing",
    ...responseShape(body),
  });
}

export async function detectLanguage(text: string): Promise<Detection> {
  let response: Response;
  try {
    response = await fetch(new URL("/predict", config.ML_SERVICE_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    console.error("[ml] Prediction request failed before an HTTP response", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    throw httpError(503, "The custom language-identification service is unavailable.");
  }
  const result: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    logResponseIssue(response, result, "upstream_http_error");
    if (response.status >= 500 || (response.status !== 400 && response.status !== 422)) {
      throw httpError(503, "The custom language-identification service is temporarily unavailable. Please retry shortly.");
    }
    throw httpError(422, "The custom language-identification service rejected the text.");
  }
  if (!isPrediction(result)) {
    logResponseIssue(response, result, "invalid_prediction_schema");
    throw httpError(502, "The custom language-identification service returned an invalid response.");
  }
  return result;
}
