import { supportedLanguages, type LanguageCode } from "../languages";

type LanguageSelectProps = {
  id: string;
  label: string;
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
};

export function LanguageSelect({ id, label, value, onChange }: LanguageSelectProps) {
  return (
    <label className="grid gap-2 font-display text-[11px] font-semibold uppercase tracking-[.18em] text-sand" htmlFor={id}>
      {label}
      <select
        id={id}
        className="glass-select px-3 py-3 font-sans text-sm normal-case tracking-normal outline-none transition"
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
