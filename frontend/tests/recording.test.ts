import { afterEach, describe, expect, it, vi } from "vitest";
import { submitAudioRecording } from "../src/lib/api";
import {
  chooseRecordingMimeType,
  makeRecordingBlob,
  microphoneErrorMessage,
  normalizedRecordingMimeType,
  recordingCapabilityError,
} from "../src/lib/recording";

afterEach(() => vi.unstubAllGlobals());

describe("microphone recording failures", () => {
  it("explains denied permissions and missing or busy microphones", () => {
    expect(microphoneErrorMessage({ name: "NotAllowedError" })).toContain("Allow microphone access");
    expect(microphoneErrorMessage({ name: "NotFoundError" })).toContain("No microphone was found");
    expect(microphoneErrorMessage({ name: "NotReadableError" })).toContain("being used by another app");
  });

  it("distinguishes unsupported and insecure recording environments", () => {
    expect(recordingCapabilityError(false, true, true)).toContain("requires a secure page");
    expect(recordingCapabilityError(true, false, true)).toContain("does not provide microphone access");
    expect(recordingCapabilityError(true, true, false)).toContain("cannot record microphone audio");
    expect(recordingCapabilityError(true, true, true)).toBeNull();
  });

  it("selects only provider-compatible browser formats", () => {
    expect(chooseRecordingMimeType((type) => type === "audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
    expect(chooseRecordingMimeType(() => false)).toBeNull();
    expect(normalizedRecordingMimeType("audio/ogg;codecs=opus")).toBe("audio/ogg");
  });

  it("creates a normalized, non-empty recording blob and rejects unsupported or empty data", () => {
    const blob = makeRecordingBlob([new Uint8Array([1, 2, 3])], "audio/webm;codecs=opus");
    expect(blob.type).toBe("audio/webm");
    expect(blob.size).toBe(3);
    expect(() => makeRecordingBlob([], "audio/webm")).not.toThrow();
    expect(() => makeRecordingBlob([], "audio/mp4")).toThrow("unsupported recording format");
  });
});

describe("audio translation submission", () => {
  it("submits the captured blob and selected languages as multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ transcription: "hello", translatedText: "नमस्ते" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    const result = await submitAudioRecording<{ transcription: string; translatedText: string }>(blob, "en", "hi");

    expect(result).toEqual({ transcription: "hello", translatedText: "नमस्ते" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/translate/audio");
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("include");
    expect(request.headers).toBeUndefined();
    expect(request.body).toBeInstanceOf(FormData);
    const body = request.body as FormData;
    expect((body.get("audio") as File).type).toBe("audio/webm");
    expect((body.get("audio") as File).name).toBe("recording.webm");
    expect(body.get("sourceLanguage")).toBe("en");
    expect(body.get("targetLanguage")).toBe("hi");
  });

  it("rejects empty recordings before sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(submitAudioRecording(new Blob([], { type: "audio/webm" }), "en", "hi"))
      .rejects.toThrow("recording is empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a backend connection error instead of a generic fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(submitAudioRecording(new Blob([new Uint8Array([1])], { type: "audio/webm" }), "en", "hi"))
      .rejects.toThrow("Check that Express is running");
  });
});
