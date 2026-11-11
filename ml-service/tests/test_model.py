from indic_id.model import LanguageIdentifier, compare_models


class _NormalizationProbe:
    def __init__(self):
        self.seen = None
        self.named_steps = {"classifier": self}
        self.classes_ = ["en", "hi"]

    def predict(self, samples):
        self.seen = samples[0]
        return ["en"]

    def decision_function(self, samples):
        return [4.0]


def test_inference_normalization_matches_training_nfc_without_dropping_text():
    probe = _NormalizationProbe()
    result = LanguageIdentifier(probe, min_confidence=0.0, min_margin=0.0).predict("  cafe\u0301   today  ")
    assert result["language"] == "en"
    assert probe.seen == "café today"


def test_comparison_reports_required_metrics():
    examples = []
    for i in range(8):
        examples.extend([
            (f"hello world greeting {i}", "en"),
            (f"नमस्ते हिंदी संसार {i}", "hi"),
        ])
    reports, models, best_name, best_model = compare_models(examples)
    for name in ("logistic_regression", "linear_svm"):
        report = reports[name]
        assert 0 <= report["accuracy"] <= 1
        assert 0 <= report["macro_f1"] <= 1
        assert set(report["per_language_f1"]) == {"en", "hi"}
        assert len(report["confusion_matrix"]) == 2
        assert report["latency_ms"]["samples"] > 0
        assert name in models
    assert best_name in {"logistic_regression", "linear_svm"}
    assert best_model is not None
    assert reports[best_name]["known_input_rejection"]["test_rows"] > 0
    assert set(reports[best_name]["category_metrics"]) == {"native_script", "romanized", "code_mixed"}


def test_short_text_is_rejected_before_model_inference():
    examples = []
    for i in range(10):
        examples.extend([
            (f"good morning friend {i}", "en"),
            (f"नमस्ते हिंदी मित्र {i}", "hi"),
        ])
    _, models, _, _ = compare_models(examples)
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
    reports, _, _, _ = compare_models(examples)
    assert reports["linear_svm"]["split_strategy"] == "stratified_group_train_validation_test_60_20_20"
    splits = reports["linear_svm"]["split_distribution"]
    assert splits["train"]["groups"] + splits["validation"]["groups"] + splits["test"]["groups"] == 40
    assert not (set(splits["train"]["language"]) - {"en", "hi"})


def test_low_confidence_prediction_is_rejected():
    examples = []
    for i in range(10):
        examples.extend([
            (f"hello world phrase {i}", "en"),
            (f"नमस्ते हिंदी वाक्य {i}", "hi"),
        ])
    _, _, _, best_model = compare_models(examples)
    result = LanguageIdentifier(best_model, min_confidence=1.0).predict("hello world")
    assert result["language"] == "unknown"
    assert result["reason"] == "ambiguous"


def test_unsupported_script_is_rejected_as_unknown():
    examples = []
    for i in range(10):
        examples.extend([
            (f"good morning friend {i}", "en"),
            (f"नमस्ते हिंदी मित्र {i}", "hi"),
        ])
    _, _, _, best_model = compare_models(examples)
    result = LanguageIdentifier(best_model).predict("مرحبا")
    assert result["language"] == "unknown"
    assert result["reason"] == "unsupported_script"
