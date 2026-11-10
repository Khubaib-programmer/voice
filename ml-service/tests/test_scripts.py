from indic_id.scripts import classify_script
from indic_id.languages import LANGUAGE_CODES


def test_supported_language_scope_is_exactly_four_codes():
    assert LANGUAGE_CODES == {"hi", "en", "ta", "or"}


def test_identifies_latin_script():
    assert classify_script("Hello world") ["script"] == "Latin"


def test_identifies_indic_script():
    assert classify_script("नमस्ते दुनिया")["script"] == "Devanagari"


def test_identifies_tamil_and_odia_scripts():
    assert classify_script("வணக்கம் உலகம்")["script"] == "Tamil"
    assert classify_script("ନମସ୍କାର ଜଗତ")["script"] == "Odia"


def test_empty_input_is_unknown():
    assert classify_script("  ")["script"] == "unknown"
