export const supportedLanguages = ["hi", "en", "ta", "or"] as const;
export type LanguageCode = (typeof supportedLanguages)[number];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (supportedLanguages as readonly string[]).includes(value);
}
