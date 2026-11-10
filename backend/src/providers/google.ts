import { config } from "../config.js";
import { httpError } from "../http.js";
import type { LanguageCode } from "../languages.js";

const GOOGLE_LANGUAGES: Record<LanguageCode, string> = {
  hi: "hi-IN",
  en: "en-US",
  ta: "ta-IN",
  or: "or-IN",
};

function requireGoogleKey() {
  if (!config.GOOGLE_CLOUD_API_KEY) {
    throw httpError(503, "Speech and translation providers are not configured. Set GOOGLE_CLOUD_API_KEY on the backend.");
  }
  return config.GOOGLE_CLOUD_API_KEY;
}

async function googlePost(url: string, body: unknown, providerName: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
  const key = requireGoogleKey();
  const encoding = mimeType.includes("ogg") ? "OGG_OPUS" : mimeType.includes("webm") ? "WEBM_OPUS" : null;
  if (!encoding) throw httpError(415, "Use a WebM/Opus or Ogg/Opus recording for speech recognition.");
  if (source === "or") {
    throw httpError(503, "Google Cloud Speech-to-Text v1 does not list Odia support. Configure an Odia-capable speech provider before using Odia voice input.");
  }
  const payload = await googlePost(
    `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(key)}`,
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
}

function supportedProviderLanguages(source: LanguageCode) {
  return (Object.keys(GOOGLE_LANGUAGES) as LanguageCode[])
    .filter((language) => language !== source)
    .map((language) => GOOGLE_LANGUAGES[language]);
}

export async function translateText(text: string, source: LanguageCode, target: LanguageCode) {
  const key = requireGoogleKey();
  const payload = await googlePost(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
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
}

export async function synthesizeSpeech(text: string, language: LanguageCode) {
  const key = requireGoogleKey();
  if (language === "or") {
    throw httpError(503, "Google Cloud Text-to-Speech does not list an Odia voice. Configure an Odia-capable TTS provider before using Odia playback.");
  }
  const payload = await googlePost(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
    {
      input: { text },
      voice: { languageCode: GOOGLE_LANGUAGES[language] },
      audioConfig: { audioEncoding: "MP3" },
    },
    "Google Cloud Text-to-Speech",
  );
  if (typeof payload.audioContent !== "string") throw httpError(502, "Google Cloud Text-to-Speech returned no audio.");
  return payload.audioContent;
}
