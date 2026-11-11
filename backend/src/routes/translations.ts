import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { isSupportedRecordingMimeType } from "../audio.js";
import { requireUser } from "../auth.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { asyncRoute, httpError } from "../http.js";
import { isLanguageCode } from "../languages.js";
import { detectLanguage } from "../providers/ml.js";
import { synthesizeSpeech, transcribeAudio, translateText } from "../providers/google.js";

const router = Router();
router.use(requireUser);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (isSupportedRecordingMimeType(file.mimetype)) callback(null, true);
    else callback(httpError(415, "Use a WebM/Opus or Ogg/Opus recording."));
  },
});

const translationInput = z.object({
  text: z.string().trim().min(1).max(10_000),
  sourceLanguage: z.string().refine(isLanguageCode, "Unsupported source language"),
  targetLanguage: z.string().refine(isLanguageCode, "Unsupported target language"),
}).refine((value) => value.sourceLanguage !== value.targetLanguage, {
  message: "Choose different source and target languages.",
});

async function processTranslation(text: string, sourceLanguage: "hi" | "en" | "ta" | "or", targetLanguage: "hi" | "en" | "ta" | "or", userId: string) {
  const detection = await detectLanguage(text);
  const translatedText = await translateText(text, sourceLanguage, targetLanguage);
  const record = await prisma.translationHistory.create({
    data: { userId, sourceLanguage, targetLanguage, sourceText: text, translatedText, detectionLanguage: detection.language },
    select: { id: true, createdAt: true },
  });
  return { text, translatedText, sourceLanguage, targetLanguage, detection, history: record };
}

router.post("/translate", asyncRoute(async (req, res) => {
  const input = translationInput.parse(req.body);
  res.json(await processTranslation(input.text, input.sourceLanguage, input.targetLanguage, res.locals.userId));
}));

router.post("/translate/audio", upload.single("audio"), asyncRoute(async (req, res) => {
  if (!req.file) throw httpError(400, "Select a voice recording first.");
  if (!req.file.size) throw httpError(400, "The recording is empty. Record a short message and try again.");
  const input = translationInput.omit({ text: true }).parse(req.body);
  const transcript = await transcribeAudio(req.file.buffer, req.file.mimetype, input.sourceLanguage as "hi" | "en" | "ta" | "or");
  const result = await processTranslation(transcript, input.sourceLanguage as "hi" | "en" | "ta" | "or", input.targetLanguage as "hi" | "en" | "ta" | "or", res.locals.userId);
  res.json({ ...result, transcription: transcript });
}));

router.post("/tts", asyncRoute(async (req, res) => {
  const input = z.object({ text: z.string().trim().min(1).max(5_000), language: z.string().refine(isLanguageCode) }).parse(req.body);
  res.json({ audioContent: await synthesizeSpeech(input.text, input.language as "hi" | "en" | "ta" | "or"), mimeType: "audio/mpeg" });
}));

router.get("/history", asyncRoute(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const translations = await prisma.translationHistory.findMany({
    where: { userId: res.locals.userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ translations });
}));

router.delete("/history/:id", asyncRoute(async (req, res) => {
  const result = await prisma.translationHistory.deleteMany({ where: { id: req.params.id, userId: res.locals.userId } });
  if (!result.count) throw httpError(404, "Translation history item not found.");
  res.status(204).end();
}));

export default router;
