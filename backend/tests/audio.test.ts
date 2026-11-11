import { describe, expect, it } from "vitest";
import { isSupportedRecordingMimeType } from "../src/audio.js";

describe("recording MIME handling", () => {
  it("accepts browser WebM and Ogg Opus MIME values with codec parameters", () => {
    expect(isSupportedRecordingMimeType("audio/webm;codecs=opus")).toBe(true);
    expect(isSupportedRecordingMimeType("audio/ogg; codecs=opus")).toBe(true);
  });

  it("rejects formats the configured Google STT adapter cannot decode", () => {
    expect(isSupportedRecordingMimeType("audio/mp4")).toBe(false);
    expect(isSupportedRecordingMimeType("application/octet-stream")).toBe(false);
  });
});
