import type { LanguageCode } from "../languages";

export function matchingVoice(voices: SpeechSynthesisVoice[], language: LanguageCode): SpeechSynthesisVoice | null {
  const locales: Record<LanguageCode, string> = { hi: "hi-IN", en: "en-IN", ta: "ta-IN", or: "or-IN" };
  const voiceCodes = voices.map((voice) => ({ voice, code: voice.lang.trim().toLowerCase().replaceAll("_", "-") }));
  const locale = locales[language].toLowerCase();
  return voiceCodes.find(({ code }) => code === locale)?.voice
    ?? voiceCodes.find(({ code }) => code === language)?.voice
    ?? voiceCodes.find(({ code }) => code.startsWith(`${language}-`))?.voice
    ?? null;
}

export function loadAvailableVoices(
  synth: SpeechSynthesis,
  language: LanguageCode,
  timeoutMs = 5_000,
): Promise<SpeechSynthesisVoice[]> {
  const current = synth.getVoices();
  if (matchingVoice(current, language)) return Promise.resolve(current);

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      synth.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(voices);
    };
    const onVoicesChanged = () => {
      const voices = synth.getVoices();
      if (matchingVoice(voices, language)) finish(voices);
    };

    timer = setTimeout(() => finish(synth.getVoices()), timeoutMs);
    synth.addEventListener("voiceschanged", onVoicesChanged);

    // Close the race where the browser loads voices between the first check
    // and listener registration.
    const loadedAfterSubscription = synth.getVoices();
    if (matchingVoice(loadedAfterSubscription, language)) finish(loadedAfterSubscription);
  });
}

export function missingVoiceMessage(language: LanguageCode) {
  const name = { hi: "Hindi", en: "English", ta: "Tamil", or: "Odia" }[language];
  return `No ${name} speech voice is available in this browser. Install ${name} speech data in your device’s text-to-speech settings, then try again.`;
}

export function createTranslatedUtterance(
  text: string,
  voice: SpeechSynthesisVoice,
  Utterance: typeof SpeechSynthesisUtterance = SpeechSynthesisUtterance,
) {
  const utterance = new Utterance(text);
  utterance.lang = voice.lang;
  utterance.voice = voice;
  return utterance;
}
