import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { isSupportedRecordingMimeType } from "../audio.js";
import { requireUser } from "../auth.js";
import { config } from "../config.js";
import { asyncRoute, httpError } from "../http.js";
import { isLanguageCode } from "../languages.js";
import { transcribeAudio } from "../providers/groq.js";
import { detectText, translateDetectedText } from "../translation.js";

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

const textInput = z.object({ text: z.string().trim().min(1, "Enter text first.").max(10_000) });
const targetInput = z.object({
  text: z.string().trim().min(1, "Enter text first.").max(10_000),
  targetLanguage: z.string().refine(isLanguageCode, "Unsupported target language"),
});

router.post("/detect", asyncRoute(async (req, res) => {
  const { text } = textInput.parse(req.body);
  res.json({ detection: await detectText(text) });
}));

router.post("/transcribe", upload.single("audio"), asyncRoute(async (req, res) => {
  if (!req.file) throw httpError(400, "Select a voice recording first.");
  if (!req.file.size) throw httpError(400, "The recording is empty. Record a short message and try again.");
  const transcript = await transcribeAudio(req.file.buffer, req.file.mimetype);
  const detection = await detectText(transcript);
  res.json({ text: transcript, detection });
}));

router.post("/translate", asyncRoute(async (req, res) => {
  const input = targetInput.parse(req.body);
  res.json(await translateDetectedText(input.text, input.targetLanguage as "hi" | "en" | "ta" | "or"));
}));

export default router;
