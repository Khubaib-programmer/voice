import type { LanguageCode } from "../languages";

export type DetectionView = {
  language: string;
  confidence: number;
  confidence_kind?: string;
  reason?: string | null;
};

const labels: Record<LanguageCode, string> = { hi: "Hindi", en: "English", ta: "Tamil", or: "Odia" };

export function canTranslate(text: string, detection: DetectionView | null, detectionText: string, target: LanguageCode) {
  return Boolean(
    text.trim()
    && detection
    && detectionText === text
    && detection.language !== "unknown"
    && detection.language !== target,
  );
}

export function detectionStatus(detection: DetectionView | null) {
  if (!detection) return "Enter a message or record speech to detect its language.";
  if (detection.language !== "unknown" && detection.language in labels) {
    return `Detected language: ${labels[detection.language as LanguageCode]}`;
  }
  if (detection.reason === "input_too_short") return "Too little text to identify reliably. Add a few more words.";
  if (detection.reason === "unsupported_script") return "This writing system is not supported. Use Hindi, English, Tamil, or Odia text.";
  if (detection.reason === "ambiguous") return "The model could not distinguish the language confidently. Try a fuller sentence.";
  return "The model returned unknown or ambiguous. Try a fuller sentence in Hindi, English, Tamil, or Odia.";
}

export function modelScoreLabel(detection: DetectionView) {
  const score = Number.isFinite(detection.confidence) ? detection.confidence.toFixed(3) : "unavailable";
  if (detection.confidence_kind === "model_probability") return `Model score: ${score} (calibrated probability)`;
  return `Model score: ${score} (not a probability)`;
}
