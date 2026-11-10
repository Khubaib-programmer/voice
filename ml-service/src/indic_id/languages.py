"""Single source of truth for supported language labels."""

LANGUAGES = {
    "hi": {"name": "Hindi", "script": "Devanagari"},
    "en": {"name": "English", "script": "Latin"},
    "ta": {"name": "Tamil", "script": "Tamil"},
    "or": {"name": "Odia", "script": "Odia"},
}
LANGUAGE_CODES = frozenset(LANGUAGES)
