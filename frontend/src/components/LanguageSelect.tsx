import type { LanguageCode } from "../languages";
import { supportedLanguages } from "../languages";

type LanguageSelectProps = {
  id: string;
  label: string;
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
};

export function LanguageSelect({ id, label, value, onChange }: LanguageSelectProps) {
  return (
    <label className="grid gap-2 text-sm font-medium" htmlFor={id}>
      {label}
      <select
        id={id}
        className="w-full rounded-xl border border-line bg-[#111720] px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-mint/60 focus:ring-2 focus:ring-mint/10"
        value={value}
        onChange={(event) => onChange(event.target.value as LanguageCode)}
      >
        {supportedLanguages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.nativeName} ({language.name})
          </option>
        ))}
      </select>
    </label>
  );
}
