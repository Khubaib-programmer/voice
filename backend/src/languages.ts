export const supportedLanguages = ["hi", "en", "ta", "or"] as const;
export type LanguageCode = (typeof supportedLanguages)[number];

export function isLanguageCode(value: string): value is LanguageCode {
  return (supportedLanguages as readonly string[]).includes(value);
}
