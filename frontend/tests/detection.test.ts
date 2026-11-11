import { describe, expect, it } from "vitest";
import { canTranslate, detectionStatus, modelScoreLabel } from "../src/lib/detection";

describe("custom language detection workflow rules", () => {
  it("only enables translation for current, known text and a different target", () => {
    const detected = { language: "hi", confidence: 0.83 };
    expect(canTranslate("नमस्ते दुनिया", detected, "नमस्ते दुनिया", "en")).toBe(true);
    expect(canTranslate("नमस्ते दुनिया", detected, "नमस्ते दुनिया", "hi")).toBe(false);
    expect(canTranslate("नमस्ते दुनिया", { language: "unknown", confidence: 0.2 }, "नमस्ते दुनिया", "en")).toBe(false);
    expect(canTranslate("नमस्ते दुनिया", detected, "previous text", "en")).toBe(false);
    expect(canTranslate("  ", detected, "  ", "en")).toBe(false);
  });

  it("explains short and ambiguous input without inventing a language label", () => {
    expect(detectionStatus({ language: "unknown", confidence: 0, reason: "input_too_short" })).toContain("Add a few more words");
    expect(detectionStatus({ language: "unknown", confidence: 0.4, reason: "ambiguous" })).toContain("fuller sentence");
    expect(detectionStatus({ language: "unknown", confidence: 0.1 })).toContain("unknown or ambiguous");
  });

  it("labels the SVM score as non-probabilistic", () => {
    expect(modelScoreLabel({ language: "hi", confidence: 0.525, confidence_kind: "normalized_decision_score_proxy" }))
      .toBe("Model score: 0.525 (not a probability)");
  });
});
