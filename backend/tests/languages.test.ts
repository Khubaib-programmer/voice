import { describe, expect, it } from "vitest";
import { isLanguageCode, supportedLanguages } from "../src/languages.js";

describe("supported language scope", () => {
  it("contains exactly the four configured language codes", () => {
    expect(supportedLanguages).toEqual(["hi", "en", "ta", "or"]);
  });

  it("rejects unsupported language codes", () => {
    expect(isLanguageCode("hi")).toBe(true);
    for (const code of ["as", "bn", "gu", "kn", "ml", "mr", "pa", "te", "fr", ""]) {
      expect(isLanguageCode(code)).toBe(false);
    }
  });
});
