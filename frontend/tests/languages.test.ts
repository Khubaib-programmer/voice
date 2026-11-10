import { describe, expect, it } from "vitest";
import { supportedLanguages } from "../src/languages";

describe("language selector options", () => {
  it("shows only Hindi, English, Tamil and Odia", () => {
    expect(supportedLanguages.map(({ code }) => code)).toEqual(["hi", "en", "ta", "or"]);
    expect(supportedLanguages.map(({ name }) => name)).toEqual(["Hindi", "English", "Tamil", "Odia"]);
  });
});
