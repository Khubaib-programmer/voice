"""Unicode-script evidence for the project's supported language set."""

from collections import Counter

SCRIPT_RANGES = {
    "hi": ((0x0900, 0x097F),),
    "or": ((0x0B00, 0x0B7F),),
    "ta": ((0x0B80, 0x0BFF),),
}
SCRIPT_NAMES = {
    "or": "Odia",
    "ta": "Tamil",
    "hi": "Devanagari",
}


def classify_script(text: str) -> dict[str, object]:
    """Return script evidence; shared scripts remain intentionally ambiguous."""
    counts: Counter[str] = Counter()
    languages: Counter[str] = Counter()
    letters = 0
    latin = 0
    for char in text:
        if not char.isalpha():
            continue
        letters += 1
        codepoint = ord(char)
        if 0x0041 <= codepoint <= 0x024F:
            latin += 1
        for language, ranges in SCRIPT_RANGES.items():
            if any(start <= codepoint <= end for start, end in ranges):
                counts[SCRIPT_NAMES[language]] += 1
                languages[language] += 1
                break

    total_indic = sum(counts.values())
    if not letters:
        return {"script": "unknown", "indic_language_hints": [], "indic_ratio": 0.0}
    if latin / letters >= 0.8:
        script = "Latin"
    elif total_indic / letters >= 0.5:
        script = "Indic"
    elif total_indic:
        script = "mixed"
    else:
        script = "other"
    ranked = sorted(languages, key=languages.get, reverse=True)
    scripts = sorted(counts, key=counts.get, reverse=True)
    indic_script = scripts[0] if scripts and total_indic / letters >= 0.5 else "unknown"
    if len(scripts) > 1 and counts[scripts[1]] / total_indic >= 0.15:
        indic_script = "mixed"
    if script == "Indic":
        script = indic_script
    return {
        "script": script,
        "indic_language_hints": ranked[:3],
        "indic_ratio": total_indic / letters,
    }
