export const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
] as const;

export function chooseRecordingMimeType(isTypeSupported: (mimeType: string) => boolean): string | null {
  return RECORDING_MIME_CANDIDATES.find(isTypeSupported) ?? null;
}

export function recordingCapabilityError(secureContext: boolean, hasGetUserMedia: boolean, hasMediaRecorder: boolean): string | null {
  if (!secureContext) return "Microphone recording requires a secure page. Open Vaani over HTTPS or localhost.";
  if (!hasGetUserMedia) return "This browser does not provide microphone access. Try a current version of Chrome, Edge, Firefox, or Safari.";
  if (!hasMediaRecorder) return "This browser cannot record microphone audio. Try a current version of Chrome, Edge, Firefox, or Safari.";
  return null;
}

export function normalizedRecordingMimeType(mimeType: string): "audio/webm" | "audio/ogg" | null {
  const baseType = mimeType.split(";", 1)[0].trim().toLowerCase();
  return baseType === "audio/webm" || baseType === "audio/ogg" ? baseType : null;
}

export function microphoneErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name)
    : "";

  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
    return "Microphone access was denied. Allow microphone access for this site in your browser settings, then try again.";
  }
  if (["NotFoundError", "DevicesNotFoundError"].includes(name)) {
    return "No microphone was found. Connect or enable a microphone, then try again.";
  }
  if (["NotReadableError", "TrackStartError"].includes(name)) {
    return "The microphone is unavailable or being used by another app. Close other recording apps and try again.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "The microphone does not meet this browser’s recording requirements. Try another microphone.";
  }
  if (name === "AbortError") {
    return "The microphone stopped unexpectedly. Check the device and try recording again.";
  }
  if (name === "NotSupportedError") {
    return "This browser cannot encode a format supported by the speech service. Try Chrome, Edge, or Firefox.";
  }
  return "Could not start the microphone. Check that it is connected and allowed for this site.";
}

export function makeRecordingBlob(chunks: BlobPart[], mimeType: string): Blob {
  const normalizedMimeType = normalizedRecordingMimeType(mimeType);
  if (!normalizedMimeType) throw new Error("This browser produced an unsupported recording format. Use a browser that records WebM/Opus or Ogg/Opus.");
  return new Blob(chunks, { type: normalizedMimeType });
}
