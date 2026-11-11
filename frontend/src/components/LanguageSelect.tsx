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
    <label className="grid gap-2 text-sm font-semibold text-forest" htmlFor={id}>
      {label}
      <select
        id={id}
        className="glass-select w-full rounded-xl border px-3 py-3 text-sm outline-none transition focus:border-purple focus:ring-2 focus:ring-purple/20"
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
