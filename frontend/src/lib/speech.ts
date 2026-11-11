import type { LanguageCode } from "../languages";

export function matchingVoice(voices: SpeechSynthesisVoice[], language: LanguageCode): SpeechSynthesisVoice | null {
  const locale = { hi: "hi-IN", en: "en-IN", ta: "ta-IN", or: "or-IN" }[language].toLowerCase();
  const exact = voices.find((voice) => voice.lang.toLowerCase() === locale);
  if (exact) return exact;
  if (language === "en") {
    return voices.find((voice) => voice.lang.toLowerCase().startsWith("en-in"))
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en-"))
      ?? null;
  }
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(`${language}-`)) ?? null;
}

export function missingVoiceMessage(language: LanguageCode) {
  const name = { hi: "Hindi", en: "English", ta: "Tamil", or: "Odia" }[language];
  return `This device does not have a ${name} speech voice. Add a ${name} voice in your system or browser speech settings, then try again.`;
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
