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
      messages: expect.arrayContaining([expect.objectContaining({ role: "user", content: expect.stringContaining("Source language: Hindi (hi)") })]),
    }));
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
