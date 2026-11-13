import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message = "provider error") { super(message); this.status = status; }
  }
  return {
    transcribeCreate: vi.fn(),
    translateCreate: vi.fn(),
    clientOptions: vi.fn(),
    toFile: vi.fn(),
    APIError: MockAPIError,
  };
});

vi.mock("groq-sdk", () => {
  class MockGroq {
    static APIError = mock.APIError;
    audio = { transcriptions: { create: mock.transcribeCreate } };
    chat = { completions: { create: mock.translateCreate } };
    constructor(options: unknown) { mock.clientOptions(options); }
  }
  mock.toFile.mockImplementation(async (buffer: Buffer, name: string, options: unknown) => ({ buffer, name, options }));
  return { default: MockGroq, Groq: MockGroq, toFile: mock.toFile };
});

process.env.COOKIE_SECRET ??= "test-only-session-secret-with-more-than-32-characters";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.GROQ_API_KEY = "test-key";

const { transcribeAudio, translateText } = await import("../src/providers/groq.js");

describe("Groq provider adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.transcribeCreate.mockResolvedValue({ text: "नमस्ते दुनिया" });
    mock.translateCreate.mockResolvedValue({ choices: [{ message: { content: "Hello world." } }] });
  });

  it("uploads WebM audio to Whisper without forcing a source language", async () => {
    const audio = Buffer.from("audio bytes");
    expect(await transcribeAudio(audio, "audio/webm;codecs=opus")).toBe("नमस्ते दुनिया");
    expect(mock.toFile).toHaveBeenCalledWith(audio, "recording.webm", { type: "audio/webm" });
    const request = mock.transcribeCreate.mock.calls[0][0];
    expect(request).toEqual(expect.objectContaining({ model: "whisper-large-v3", response_format: "json", temperature: 0 }));
    expect(request).not.toHaveProperty("language");
  });

  it("translates using the detected source and chosen target via the backend-only model", async () => {
    expect(await translateText("नमस्ते", "hi", "en")).toBe("Hello world.");
    expect(mock.translateCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: "openai/gpt-oss-120b",
      temperature: 0,
      messages: expect.arrayContaining([expect.objectContaining({ role: "user", content: expect.stringContaining("Source language: Hindi (hi)") })]),
    }));
  });

  it("asks for natural Hindi in Devanagari for ordinary English-to-Hindi text", async () => {
    mock.translateCreate.mockResolvedValueOnce({ choices: [{ message: { content: "मुझे आज आपकी मदद की बहुत ज़रूरत है।" } }] });
    const result = await translateText("I really need your help today.", "en", "hi");
    const request = mock.translateCreate.mock.calls[0][0];
    const systemPrompt = request.messages[0].content as string;

    expect(result).toMatch(/[\u0900-\u097F]/u);
    expect(result).toContain("मदद");
    expect(systemPrompt).toContain("natural Hindi in Devanagari");
    expect(systemPrompt).toContain("not by replacing words literally");
    expect(request.temperature).toBe(0);
  });

  it("guides contextual translation of expressive English into its Hindi meaning", async () => {
    const source = "The surprise birthday party my friends threw for me was absolutely supercalifragilisticexpialidocious!";
    mock.translateCreate.mockResolvedValueOnce({ choices: [{ message: { content: "मेरे दोस्तों ने मेरे लिए जो सरप्राइज़ बर्थडे पार्टी रखी थी, वह बेहद शानदार थी!" } }] });
    const result = await translateText(source, "en", "hi");
    const request = mock.translateCreate.mock.calls[0][0];
    const systemPrompt = request.messages[0].content as string;

    expect(result).toMatch(/[\u0900-\u097F]/u);
    expect(result).toMatch(/शानदार|अद्भुत|बेहतरीन|कमाल/u);
    expect(result).toContain("पार्टी");
    expect(systemPrompt).toContain("Interpret idioms, slang, humor, figurative language");
    expect(systemPrompt).toContain("intended sense");
    expect(systemPrompt).not.toContain("supercalifragilisticexpialidocious");
    expect(request.messages[1].content).toContain(source);
  });

  it("translates idioms by intent rather than literally", async () => {
    mock.translateCreate.mockResolvedValueOnce({ choices: [{ message: { content: "उसने आखिरकार अपना राज़ खोल दिया।" } }] });
    const result = await translateText("After weeks of silence, he finally spilled the beans.", "en", "hi");
    expect(result).toContain("राज़");
    expect(result).toMatch(/[\u0900-\u097F]/u);
  });

  it("preserves proper names, product names, and numbers where appropriate", async () => {
    mock.translateCreate.mockResolvedValueOnce({ choices: [{ message: { content: "Aarav ने Pixel 9 के लिए ₹2,500 चुकाए।" } }] });
    const result = await translateText("Aarav paid ₹2,500 for the Pixel 9.", "en", "hi");
    expect(result).toContain("Aarav");
    expect(result).toContain("₹2,500");
    expect(result).toContain("Pixel 9");
  });

  it.each([
    { source: "hi" as const, target: "en" as const, text: "आज मौसम बहुत अच्छा है।", output: "The weather is very nice today." },
    { source: "en" as const, target: "hi" as const, text: "The weather is very nice today.", output: "आज मौसम बहुत अच्छा है।" },
    { source: "ta" as const, target: "en" as const, text: "நன்றி, மீண்டும் சந்திப்போம்.", output: "Thank you, see you again." },
    { source: "en" as const, target: "ta" as const, text: "Thank you, see you again.", output: "நன்றி, மீண்டும் சந்திப்போம்." },
    { source: "or" as const, target: "en" as const, text: "ଆପଣ କେମିତି ଅଛନ୍ତି?", output: "How are you?" },
    { source: "en" as const, target: "or" as const, text: "How are you?", output: "ଆପଣ କେମିତି ଅଛନ୍ତି?" },
  ])("preserves translation direction for $source to $target", async ({ source, target, text, output }) => {
    mock.translateCreate.mockResolvedValueOnce({ choices: [{ message: { content: output } }] });
    expect(await translateText(text, source, target)).toBe(output);
    const request = mock.translateCreate.mock.calls[0][0];
    expect(request.messages[1].content).toContain(`Source language: ${source === "hi" ? "Hindi" : source === "en" ? "English" : source === "ta" ? "Tamil" : "Odia"} (${source})`);
    expect(request.messages[1].content).toContain(`Target language: ${target === "hi" ? "Hindi" : target === "en" ? "English" : target === "ta" ? "Tamil" : "Odia"} (${target})`);
  });

  it("returns same-language text without an unnecessary provider call", async () => {
    expect(await translateText("hello", "en", "en")).toBe("hello");
    expect(mock.translateCreate).not.toHaveBeenCalled();
  });

  it("leaves language identification to Whisper for audio in any supported voice language", async () => {
    await transcribeAudio(Buffer.from("audio"), "audio/ogg");
    const request = mock.transcribeCreate.mock.calls[0][0];
    expect(request).not.toHaveProperty("language");
    expect(request.model).toBe("whisper-large-v3");
  });

  it("does not accept unsupported audio types or empty provider responses", async () => {
    await expect(transcribeAudio(Buffer.from("audio"), "audio/mp4")).rejects.toMatchObject({ status: 415 });
    mock.transcribeCreate.mockResolvedValueOnce({ text: "  " });
    await expect(transcribeAudio(Buffer.from("audio"), "audio/ogg")).rejects.toMatchObject({ status: 422 });
  });

  it("sanitizes provider authentication errors without surfacing SDK response text", async () => {
    mock.translateCreate.mockRejectedValueOnce(new mock.APIError(401, "Invalid API Key: never-forward-provider-details"));
    await expect(translateText("hello", "en", "hi")).rejects.toThrow("Groq rejected the API key. Check GROQ_API_KEY in the backend environment.");
  });
});
