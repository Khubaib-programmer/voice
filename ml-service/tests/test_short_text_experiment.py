from sklearn.svm import LinearSVC

from indic_id.short_text_experiment import _length_bin, _short_candidate_pipeline


def test_short_medium_long_bands_use_reproducible_token_boundaries():
    assert _length_bin("How are you?") == "short_1_to_8_tokens"
    assert _length_bin("word " * 9) == "medium_9_to_20_tokens"
    assert _length_bin("word " * 21) == "long_over_20_tokens"


def test_short_candidate_keeps_character_tfidf_and_linear_svm():
    candidate = _short_candidate_pipeline(42)
    assert candidate.named_steps["tfidf"].analyzer == "char_wb"
    assert candidate.named_steps["tfidf"].ngram_range == (2, 5)
    assert isinstance(candidate.named_steps["classifier"], LinearSVC)
