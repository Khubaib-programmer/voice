export function isSupportedRecordingMimeType(mimeType: string): boolean {
  const baseType = mimeType.split(";", 1)[0].trim().toLowerCase();
  return baseType === "audio/webm" || baseType === "audio/ogg";
}
