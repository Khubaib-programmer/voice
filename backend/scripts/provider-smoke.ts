import { readFile } from "node:fs/promises";
import { transcribeAudio, translateText } from "../src/providers/groq.js";

async function run(name: string, operation: () => Promise<void>) {
  try {
    await operation();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : "provider error"}`);
    process.exitCode = 1;
  }
}

if (!process.env.GROQ_API_KEY) {
  console.log("SKIP Groq provider checks: set GROQ_API_KEY in the backend environment.");
  process.exit(0);
}

await run("Groq translation en→hi", async () => {
  const output = await translateText("Good morning. This is a provider connectivity check.", "en", "hi");
  if (!output.trim()) throw new Error("empty translation");
});

await run("Groq translation en→or", async () => {
  const output = await translateText("Good morning.", "en", "or");
  if (!output.trim()) throw new Error("empty translation");
});

const audioPath = process.env.PROVIDER_SMOKE_AUDIO;
const audioLanguage = process.env.PROVIDER_SMOKE_LANGUAGE;
if (!audioPath || !["hi", "en", "ta"].includes(audioLanguage ?? "")) {
  console.log("SKIP Groq speech-to-text: set PROVIDER_SMOKE_AUDIO and PROVIDER_SMOKE_LANGUAGE=hi|en|ta to test a real WebM/Opus or Ogg/Opus sample.");
} else {
await run(`Groq speech-to-text sample (${audioLanguage}; Whisper auto-detect)`, async () => {
    const audio = await readFile(audioPath);
    const mimeType = audioPath.toLowerCase().endsWith(".ogg") ? "audio/ogg" : "audio/webm";
    const transcript = await transcribeAudio(audio, mimeType);
    if (!transcript.trim()) throw new Error("empty transcript");
    console.log(`  recognized ${transcript.length} characters (transcript omitted)`);
  });
}
