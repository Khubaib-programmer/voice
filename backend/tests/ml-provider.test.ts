import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.COOKIE_SECRET ??= "test-only-session-secret-with-more-than-32-characters";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

const { detectLanguage } = await import("../src/providers/ml.js");

const documentedSwaggerPrediction = {
  language: "en",
  candidate_language: "en",
  confidence: 0.5308,
  confidence_kind: "normalized_decision_score_proxy",
  script: "Latin",
};

const currentFastApiPrediction = {
  language: "en",
  candidate_language: "en",
  confidence: 0.5308,
  confidence_kind: "normalized_decision_score_proxy",
  margin: 0.164,
  reason: null,
  latency_ms: 1.2,
  script: { script: "Latin", indic_language_hints: [], indic_ratio: 0 },
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("custom ML language identification provider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts the documented Swagger response for an English prediction", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(documentedSwaggerPrediction));

    await expect(detectLanguage("Hello, how are you?")).resolves.toMatchObject({
      language: "en",
      confidence: 0.5308,
      confidence_kind: "normalized_decision_score_proxy",
    });
  });

  it("accepts the full FastAPI prediction shape, including script evidence", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(currentFastApiPrediction));

    await expect(detectLanguage("Hello, how are you?")).resolves.toMatchObject({
      language: "en",
      candidate_language: "en",
      script: { script: "Latin" },
    });
  });

  it("accepts valid unknown-language responses returned by the model", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      language: "unknown",
      confidence: 0,
      reason: "unsupported_script",
      script: { script: "other", indic_language_hints: [], indic_ratio: 0 },
    }));

    await expect(detectLanguage("Журнал")).resolves.toMatchObject({
      language: "unknown",
      confidence: 0,
      reason: "unsupported_script",
    });
  });

  it("keeps supported-language validation and rejects malformed confidence fields", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ language: "fr", confidence: 0.9 }));
    await expect(detectLanguage("Bonjour")).rejects.toMatchObject({ status: 502 });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ language: "en", confidence: "high" }));
    await expect(detectLanguage("Hello")).rejects.toMatchObject({ status: 502 });
  });

  it("reports an upstream 502 as service unavailable and logs structure only", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("upstream body must not be logged", {
      status: 502,
      headers: { "content-type": "text/html" },
    }));

    await expect(detectLanguage("private user text")).rejects.toMatchObject({ status: 503 });

    expect(diagnostic).toHaveBeenCalledWith("[ml] Prediction response rejected", expect.objectContaining({
      reason: "upstream_http_error",
      status: 502,
      contentType: "text/html",
      bodyType: "invalid-json",
    }));
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("private user text");
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("upstream body must not be logged");
  });

  it("logs the schema summary, not response values, for a malformed successful response", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      language: "en",
      confidence: "high",
      private_text: "response value must not be logged",
    }));

    await expect(detectLanguage("private user text")).rejects.toMatchObject({ status: 502 });

    const call = diagnostic.mock.calls[0];
    expect(call[1]).toMatchObject({
      reason: "invalid_prediction_schema",
      status: 200,
      bodyType: "object",
      keys: ["confidence", "language"],
      unexpectedKeyCount: 1,
    });
    expect(JSON.stringify(call)).not.toContain("private user text");
    expect(JSON.stringify(call)).not.toContain("response value must not be logged");
  });
});
