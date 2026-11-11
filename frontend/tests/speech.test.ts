import { describe, expect, it } from "vitest";
import { createTranslatedUtterance, matchingVoice, missingVoiceMessage } from "../src/lib/speech";

function voice(lang: string) {
  return { lang } as SpeechSynthesisVoice;
}

describe("translated speech voice matching", () => {
  it("matches the selected Indic locale only", () => {
    expect(matchingVoice([voice("hi-IN"), voice("ta-IN")], "hi")?.lang).toBe("hi-IN");
    expect(matchingVoice([voice("hi-IN")], "ta")).toBeNull();
    expect(matchingVoice([voice("en-US")], "or")).toBeNull();
  });

  it("uses an English voice for English only when en-IN is unavailable", () => {
    expect(matchingVoice([voice("en-IN"), voice("en-US")], "en")?.lang).toBe("en-IN");
    expect(matchingVoice([voice("en-US")], "en")?.lang).toBe("en-US");
  });

  it("explains how to resolve a missing voice", () => {
    expect(missingVoiceMessage("or")).toContain("Odia speech voice");
  });

  it("speaks the translated text using exactly the selected target voice", () => {
    class FakeUtterance {
      lang = "";
      voice: SpeechSynthesisVoice | null = null;
      constructor(public text: string) {}
    }
    const selectedVoice = voice("ta-IN");
    const utterance = createTranslatedUtterance("வணக்கம்", selectedVoice, FakeUtterance as unknown as typeof SpeechSynthesisUtterance);
    expect(utterance.text).toBe("வணக்கம்");
    expect(utterance.lang).toBe("ta-IN");
    expect(utterance.voice).toBe(selectedVoice);
  });
});
