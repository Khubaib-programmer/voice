import { readFile } from "node:fs/promises";
import { transcribeAudio, translateText, synthesizeSpeech } from "../src/providers/google.js";

async function run(name: string, operation: () => Promise<void>) {
  try {
    await operation();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : "provider error"}`);
    process.exitCode = 1;
  }
}

await run("Cloud Translation en→hi", async () => {
  const output = await translateText("Good morning. This is a provider connectivity check.", "en", "hi");
  if (!output.trim()) throw new Error("empty translation");
});

await run("Cloud Translation en→or (experimental language support)", async () => {
  const output = await translateText("Good morning.", "en", "or");
  if (!output.trim()) throw new Error("empty translation");
});

for (const language of ["hi", "en", "ta"] as const) {
  await run(`Cloud Text-to-Speech ${language}`, async () => {
    const audio = await synthesizeSpeech("This is a short voice provider check.", language);
    if (!Buffer.from(audio, "base64").length) throw new Error("empty audio output");
  });
}

for (const [name, operation] of [
  ["Odia speech recognition unavailable", () => transcribeAudio(Buffer.from(""), "audio/webm", "or")],
  ["Odia text-to-speech unavailable", () => synthesizeSpeech("ଓଡ଼ିଆ", "or")],
] as const) {
  await run(name, async () => {
    try {
      await operation();
      throw new Error("unexpectedly succeeded; verify supported voice catalog and adapter guard");
    } catch (error) {
      if ((error as { status?: number }).status !== 503) throw error;
    }
  });
}

const audioPath = process.env.PROVIDER_SMOKE_AUDIO;
const audioLanguage = process.env.PROVIDER_SMOKE_LANGUAGE;
if (!audioPath || !["hi", "en", "ta"].includes(audioLanguage ?? "")) {
  console.log("SKIP Cloud Speech-to-Text: set PROVIDER_SMOKE_AUDIO and PROVIDER_SMOKE_LANGUAGE=hi|en|ta to test a real WebM/Opus or Ogg/Opus sample.");
} else {
  await run(`Cloud Speech-to-Text ${audioLanguage}`, async () => {
    const audio = await readFile(audioPath);
    const mimeType = audioPath.toLowerCase().endsWith(".ogg") ? "audio/ogg" : "audio/webm";
    const transcript = await transcribeAudio(audio, mimeType, audioLanguage as "hi" | "en" | "ta");
    if (!transcript.trim()) throw new Error("empty transcript");
    console.log(`  recognized ${transcript.length} characters (transcript omitted)`);
  });
}
