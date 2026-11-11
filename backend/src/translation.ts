import { httpError } from "./http.js";
import type { LanguageCode } from "./languages.js";
import { detectLanguage } from "./providers/ml.js";
import { translateText } from "./providers/groq.js";

export async function detectText(text: string) {
  return detectLanguage(text);
}

export async function translateDetectedText(text: string, targetLanguage: LanguageCode) {
  const detection = await detectLanguage(text);
  if (detection.language === "unknown") {
    throw httpError(422, "The custom language model could not identify this text with enough confidence. Try a longer, clearer sentence in Hindi, English, Tamil, or Odia.");
  }
  if (detection.language === targetLanguage) throw httpError(422, `This text is already detected as ${detection.language}. Choose a different target language.`);
  const translatedText = await translateText(text, detection.language, targetLanguage);
  return { text, translatedText, sourceLanguage: detection.language, targetLanguage, detection };
}
