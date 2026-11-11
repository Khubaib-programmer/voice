import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.COOKIE_SECRET ??= "test-only-session-secret-with-more-than-32-characters";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

vi.mock("../src/providers/google-auth.js", () => ({
  googleAuthorizationHeaders: vi.fn(async () => ({ Authorization: "Bearer test-google-access-token" })),
}));

const { synthesizeSpeech, transcribeAudio, translateText } = await import("../src/providers/google.js");

describe("Google Cloud provider adapters", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("transcribes a WebM recording with the selected source language", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ alternatives: [{ transcript: "नमस्ते दुनिया" }] }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const transcript = await transcribeAudio(Buffer.from("audio bytes"), "audio/webm", "hi");
    expect(transcript).toBe("नमस्ते दुनिया");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.config.encoding).toBe("WEBM_OPUS");
    expect(request.config.languageCode).toBe("hi-IN");
    expect(request.config.alternativeLanguageCodes).toEqual(["en-US", "ta-IN"]);
    expect(request.audio.content).toBe(Buffer.from("audio bytes").toString("base64"));
    expect(fetchMock.mock.calls[0][0]).toBe("https://speech.googleapis.com/v1/speech:recognize");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-google-access-token");
  });

  it("translates using the explicitly selected source and target", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { translations: [{ translatedText: "வணக்கம்" }] },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await translateText("hello", "en", "ta")).toBe("வணக்கம்");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.source).toBe("en");
    expect(request.target).toBe("ta");
    expect(fetchMock.mock.calls[0][0]).toBe("https://translation.googleapis.com/language/translate/v2");
  });

  it("returns actual provider audio content for text-to-speech", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ audioContent: "bXAz" }), {
      status: 200, headers: { "content-type": "application/json" },
    })));
    expect(await synthesizeSpeech("வணக்கம்", "ta")).toBe("bXAz");
  });

  it("does not mislabel unsupported recording formats", async () => {
    await expect(transcribeAudio(Buffer.from("audio"), "audio/mp4", "en"))
      .rejects.toMatchObject({ status: 415 });
  });

  it("does not send unsupported Odia as an alternative STT language", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ alternatives: [{ transcript: "hello" }] }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await transcribeAudio(Buffer.from("audio bytes"), "audio/webm", "hi");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.config.alternativeLanguageCodes).not.toContain("or-IN");
  });

  it("fails clearly for Odia speech when the selected Google endpoint has no Odia support", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(transcribeAudio(Buffer.from("audio"), "audio/webm", "or"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("does not list Odia support") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not claim Google TTS can synthesize Odia", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(synthesizeSpeech("ଓଡ଼ିଆ", "or"))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("does not list an Odia voice") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
