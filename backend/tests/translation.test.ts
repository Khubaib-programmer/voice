import { afterEach, describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => ({ detectLanguage: vi.fn(), translateText: vi.fn() }));
vi.mock("../src/providers/ml.js", () => ({ detectLanguage: providers.detectLanguage }));
vi.mock("../src/providers/groq.js", () => ({ translateText: providers.translateText }));
process.env.COOKIE_SECRET ??= "test-only-session-secret-with-more-than-32-characters";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

const { detectText, translateDetectedText } = await import("../src/translation.js");

afterEach(() => vi.clearAllMocks());

describe("shared custom-detection translation pipeline", () => {
  it("returns the model response for text language detection", async () => {
    const detection = { language: "hi", confidence: 0.84, confidence_kind: "normalized_decision_score_proxy" };
    providers.detectLanguage.mockResolvedValue(detection);
    expect(await detectText("मुझे पानी चाहिए")).toEqual(detection);
    expect(providers.detectLanguage).toHaveBeenCalledWith("मुझे पानी चाहिए");
  });

  it("uses custom detected source and selected target without trusting a client source label", async () => {
    const detection = { language: "hi", confidence: 0.84 };
    providers.detectLanguage.mockResolvedValue(detection);
    providers.translateText.mockResolvedValue("I need water.");
    expect(await translateDetectedText("मुझे पानी चाहिए", "en")).toEqual({
      text: "मुझे पानी चाहिए", translatedText: "I need water.", sourceLanguage: "hi", targetLanguage: "en", detection,
    });
    expect(providers.translateText).toHaveBeenCalledWith("मुझे पानी चाहिए", "hi", "en");
  });

  it("rejects unknown text and uses the detected language as source", async () => {
    providers.detectLanguage.mockResolvedValue({ language: "unknown", confidence: 0.2 });
    await expect(translateDetectedText("xyzqv", "hi")).rejects.toMatchObject({ status: 422 });
    providers.detectLanguage.mockResolvedValue({ language: "ta", confidence: 0.8 });
    providers.translateText.mockResolvedValue("Tamil text");
    const translated = await translateDetectedText("தமிழ் உரை", "en");
    expect(translated.sourceLanguage).toBe("ta");
    expect(providers.translateText).toHaveBeenCalledWith("தமிழ் உரை", "ta", "en");
  });

  it("rejects translation when target equals the custom model's detected language", async () => {
    providers.detectLanguage.mockResolvedValue({ language: "en", confidence: 0.8 });
    await expect(translateDetectedText("Good morning, how are you?", "en"))
      .rejects.toMatchObject({ status: 422, message: expect.stringContaining("Choose a different target language") });
    expect(providers.translateText).not.toHaveBeenCalled();
  });
});
