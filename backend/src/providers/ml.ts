import { config } from "../config.js";
import { httpError } from "../http.js";
import type { LanguageCode } from "../languages.js";

export type Detection = {
  language: LanguageCode | "unknown";
  confidence: number;
  confidence_kind?: string;
  reason?: string | null;
};

export async function detectLanguage(text: string): Promise<Detection> {
  let response: Response;
  try {
    response = await fetch(new URL("/predict", config.ML_SERVICE_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw httpError(503, "The custom language-identification service is unavailable.");
  }
  const result = await response.json().catch(() => null) as Detection | null;
  if (!response.ok || !result || !["hi", "en", "ta", "or", "unknown"].includes(result.language)) {
    throw httpError(502, "The custom language-identification service returned an invalid response.");
  }
  return result;
}
