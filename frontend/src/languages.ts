export const supportedLanguages = [
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "en", name: "English", nativeName: "English" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ" },
] as const;

export type LanguageCode = (typeof supportedLanguages)[number]["code"];
