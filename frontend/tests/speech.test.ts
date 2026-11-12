import { describe, expect, it } from "vitest";
import { createTranslatedUtterance, loadAvailableVoices, matchingVoice, missingVoiceMessage } from "../src/lib/speech";

function voice(lang: string) {
  return { lang } as SpeechSynthesisVoice;
}

describe("translated speech voice matching", () => {
  it("matches the selected Indic locale only", () => {
    expect(matchingVoice([voice("hi-IN"), voice("ta-IN")], "hi")?.lang).toBe("hi-IN");
    expect(matchingVoice([voice("hi")], "hi")?.lang).toBe("hi");
    expect(matchingVoice([voice("hi_IN")], "hi")?.lang).toBe("hi_IN");
    expect(matchingVoice([voice("hi-IN")], "ta")).toBeNull();
    expect(matchingVoice([voice("en-US")], "or")).toBeNull();
  });

  it("waits for the target voice even if other browser voices are already listed", async () => {
    let available: SpeechSynthesisVoice[] = [voice("en-US")];
    const listeners = new Set<EventListener>();
    const synth = {
      getVoices: () => available,
      addEventListener: (_type: string, listener: EventListener) => { listeners.add(listener); },
      removeEventListener: (_type: string, listener: EventListener) => { listeners.delete(listener); },
    } as unknown as SpeechSynthesis;

    const pending = loadAvailableVoices(synth, "hi", 500);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    available = [voice("en-US"), voice("hi-IN")];
    listeners.forEach((listener) => listener(new Event("voiceschanged")));

    await expect(pending).resolves.toEqual(available);
    expect(listeners.size).toBe(0);
  });

  it("does not substitute English when the target voice never loads", async () => {
    const synth = {
      getVoices: () => [voice("en-US")],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as SpeechSynthesis;

    const available = await loadAvailableVoices(synth, "hi", 1);
    expect(matchingVoice(available, "hi")).toBeNull();
    expect(missingVoiceMessage("hi")).toContain("Install Hindi speech data");
  });

  it("uses an English voice for English only when en-IN is unavailable", () => {
    expect(matchingVoice([voice("en-IN"), voice("en-US")], "en")?.lang).toBe("en-IN");
    expect(matchingVoice([voice("en-US")], "en")?.lang).toBe("en-US");
  });

  it("explains how to resolve a missing voice", () => {
    expect(missingVoiceMessage("hi")).toContain("Install Hindi speech data");
    expect(missingVoiceMessage("or")).toContain("Install Odia speech data");
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
