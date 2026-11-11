import { config } from "../config.js";
import { httpError } from "../http.js";
import type { LanguageCode } from "../languages.js";
import { isSupportedRecordingMimeType } from "../audio.js";
import { googleAuthorizationHeaders } from "./google-auth.js";

const GOOGLE_LANGUAGES: Record<LanguageCode, string> = {
  hi: "hi-IN",
  en: "en-US",
  ta: "ta-IN",
  or: "or-IN",
};

const DEV_DICTIONARY: Record<string, Record<LanguageCode, string>> = {
  "hello": { hi: "नमस्ते", en: "Hello", ta: "வணக்கம்", or: "ନମସ୍କାର" },
  "hi": { hi: "नमस्ते", en: "Hi", ta: "வணக்கம்", or: "ନମସ୍କାର" },
  "hey": { hi: "अरे नमस्ते", en: "Hey", ta: "வணக்கம்", or: "ନମସ୍କାର" },
  "how are you": { hi: "आप कैसे हैं?", en: "How are you?", ta: "நீங்கள் எப்படி இருக்கிறீர்கள்?", or: "ଆପଣ କେମିତି ଅଛନ୍ତି?" },
  "how are you?": { hi: "आप कैसे हैं?", en: "How are you?", ta: "நீங்கள் எப்படி இருக்கிறீர்கள்?", or: "ଆପଣ କେମିତି ଅଛନ୍ତି?" },
  "good morning": { hi: "शुभ प्रभात", en: "Good morning", ta: "காலை வணக்கம்", or: "ଶୁଭ ସକାଳ" },
  "good night": { hi: "शुभ रात्रि", en: "Good night", ta: "இனிய இரவு", or: "ଶୁଭ ରାତ୍ରି" },
  "thank you": { hi: "धन्यवाद", en: "Thank you", ta: "நன்றி", or: "ଧନ୍ୟବାଦ" },
  "thanks": { hi: "शुक्रिया", en: "Thanks", ta: "நன்றி", or: "ଧନ୍ୟବାଦ" },
  "welcome": { hi: "स्वागत है", en: "Welcome", ta: "நல்வரவு", or: "ସ୍ଵାଗତ" },
  "yes": { hi: "हाँ", en: "Yes", ta: "ஆம்", or: "ହଁ" },
  "no": { hi: "नहीं", en: "No", ta: "இல்லை", or: "ନାହିଁ" },
  "what is your name": { hi: "आपका नाम क्या है?", en: "What is your name?", ta: "உங்கள் பெயர் என்ன?", or: "ଆପଣଙ୍କ ନାମ କ’ଣ?" },
  "what is your name?": { hi: "आपका नाम क्या है?", en: "What is your name?", ta: "உங்கள் பெயர் என்ன?", or: "ଆପଣଙ୍କ ନାମ କ’ଣ?" },
  "my name is": { hi: "मेरा नाम है", en: "My name is", ta: "என் பெயர்", or: "ମୋର ନାମ ହେଉଛି" },
  "water": { hi: "पानी", en: "Water", ta: "தண்ணீர்", or: "ପାଣି" },
  "food": { hi: "खाना", en: "Food", ta: "உணவு", or: "ଖାଦ୍ୟ" },
};

function devMockTranslate(text: string, _source: LanguageCode, target: LanguageCode): string {
  const normalized = text.trim().toLowerCase().replace(/[.,!?;]+$/, "");
  if (DEV_DICTIONARY[normalized]?.[target]) {
    return DEV_DICTIONARY[normalized][target];
  }
  const targetLabel: Record<LanguageCode, string> = {
    hi: "हिन्दी",
    en: "English",
    ta: "தமிழ்",
    or: "ଓଡ଼ିଆ",
  };
  return `[${targetLabel[target]}]: ${text}`;
}

async function googlePost(url: string, body: unknown, providerName: string) {
  const authorization = await googleAuthorizationHeaders();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...authorization },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw httpError(502, `${providerName} could not be reached. Please try again.`);
  }
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    const code = response.status === 429 ? 429 : 502;
    throw httpError(code, `${providerName} failed: ${payload.error?.message ?? "upstream request error"}`);
  }
  return payload;
}

export async function transcribeAudio(audio: Buffer, mimeType: string, source: LanguageCode) {
  const normalizedMimeType = isSupportedRecordingMimeType(mimeType) ? mimeType.split(";", 1)[0].trim().toLowerCase() : null;
  const encoding = normalizedMimeType === "audio/ogg" ? "OGG_OPUS" : normalizedMimeType === "audio/webm" ? "WEBM_OPUS" : null;
  if (!encoding) throw httpError(415, "Use a WebM/Opus or Ogg/Opus recording for speech recognition.");
  if (source === "or") {
    throw httpError(503, "Google Cloud Speech-to-Text v1 does not list Odia support. Configure an Odia-capable speech provider before using Odia voice input.");
  }
  try {
    const payload = await googlePost(
      "https://speech.googleapis.com/v1/speech:recognize",
      {
        config: {
          encoding,
          languageCode: GOOGLE_LANGUAGES[source],
          alternativeLanguageCodes: supportedProviderLanguages(source),
          enableAutomaticPunctuation: true,
        },
        audio: { content: audio.toString("base64") },
      },
      "Google Cloud Speech-to-Text",
    );
    const text = (payload.results ?? [])
      .map((result: any) => result.alternatives?.[0]?.transcript ?? "")
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!text) throw httpError(422, "No speech was recognized. Try speaking closer to the microphone.");
    return text;
  } catch (error: any) {
    if (config.DEV_MOCK_PROVIDERS && config.NODE_ENV !== "production" && error?.status === 503) {
      const devTranscripts: Record<LanguageCode, string> = {
        en: "Hello, how are you?",
        hi: "नमस्ते, आप कैसे हैं?",
        ta: "வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?",
        or: "ନମସ୍କାର, ଆପଣ କେମିତି ଅଛନ୍ତି?",
      };
      return devTranscripts[source] ?? "Hello, this is a test recording.";
    }
    throw error;
  }
}

function supportedProviderLanguages(source: LanguageCode) {
  return (Object.keys(GOOGLE_LANGUAGES) as LanguageCode[])
    .filter((language) => language !== source && language !== "or")
    .map((language) => GOOGLE_LANGUAGES[language]);
}

export async function translateText(text: string, source: LanguageCode, target: LanguageCode) {
  try {
    const payload = await googlePost(
      "https://translation.googleapis.com/language/translate/v2",
      {
        q: text,
        source: GOOGLE_LANGUAGES[source].split("-")[0],
        target: GOOGLE_LANGUAGES[target].split("-")[0],
        format: "text",
      },
      "Google Cloud Translation",
    );
    const translated = payload.data?.translations?.[0]?.translatedText;
    if (typeof translated !== "string" || !translated.trim()) {
      throw httpError(502, "Google Cloud Translation returned an empty result.");
    }
    return translated;
  } catch (error: any) {
    if (config.DEV_MOCK_PROVIDERS && config.NODE_ENV !== "production" && error?.status === 503) {
      return devMockTranslate(text, source, target);
    }
    throw error;
  }
}

export async function synthesizeSpeech(text: string, language: LanguageCode) {
  if (language === "or") {
    throw httpError(503, "Google Cloud Text-to-Speech does not list an Odia voice. Configure an Odia-capable TTS provider before using Odia playback.");
  }
  try {
    const payload = await googlePost(
      "https://texttospeech.googleapis.com/v1/text:synthesize",
      {
        input: { text },
        voice: { languageCode: GOOGLE_LANGUAGES[language] },
        audioConfig: { audioEncoding: "MP3" },
      },
      "Google Cloud Text-to-Speech",
    );
    if (typeof payload.audioContent !== "string") throw httpError(502, "Google Cloud Text-to-Speech returned no audio.");
    return payload.audioContent;
  } catch (error: any) {
    if (config.DEV_MOCK_PROVIDERS && config.NODE_ENV !== "production" && error?.status === 503) {
      return Buffer.from([
        0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]).toString("base64");
    }
    throw error;
  }
}
