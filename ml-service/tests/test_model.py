from indic_id.model import LanguageIdentifier, compare_models


def test_comparison_reports_required_metrics():
    examples = []
    for i in range(8):
        examples.extend([
            (f"hello world greeting {i}", "en"),
            (f"नमस्ते हिंदी संसार {i}", "hi"),
        ])
    reports, models = compare_models(examples)
    for name in ("logistic_regression", "linear_svm"):
        report = reports[name]
        assert 0 <= report["accuracy"] <= 1
        assert 0 <= report["macro_f1"] <= 1
        assert set(report["per_language_f1"]) == {"en", "hi"}
        assert len(report["confusion_matrix"]) == 2
        assert report["latency_ms"]["samples"] > 0
        assert name in models


def test_short_text_is_rejected_before_model_inference():
    examples = []
    for i in range(10):
        examples.extend([
            (f"good morning friend {i}", "en"),
            (f"नमस्ते हिंदी मित्र {i}", "hi"),
        ])
    _, models = compare_models(examples)
    result = LanguageIdentifier(models["linear_svm"]).predict("x")
    assert result["language"] == "unknown"
    assert result["reason"] == "input_too_short"


def test_grouped_holdout_is_used_for_sentence_variants():
    examples = []
    for i in range(20):
        examples.extend([
            (f"hello world {i}", "en", f"group-{i}"),
            (f"नमस्ते हिंदी {i}", "hi", f"group-{i + 20}"),
            (f"hello variant {i}", "en", f"group-{i}"),
            (f"नमस्ते रूपांतर {i}", "hi", f"group-{i + 20}"),
        ])
    reports, _ = compare_models(examples)
    assert reports["linear_svm"]["split_strategy"] == "stratified_group_5fold_holdout"


def test_low_confidence_prediction_is_rejected():
    examples = []
    for i in range(10):
        examples.extend([
            (f"hello world phrase {i}", "en"),
            (f"नमस्ते हिंदी वाक्य {i}", "hi"),
        ])
    _, models = compare_models(examples)
    result = LanguageIdentifier(models["logistic_regression"], min_confidence=1.0).predict("hello world")
    assert result["language"] == "unknown"
    assert result["reason"] == "ambiguous"
