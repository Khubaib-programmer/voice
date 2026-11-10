from indic_id.calibrate_open_set import choose_confidence_threshold, split_unknown_rows


def test_unknown_rows_split_per_language_without_overlap():
    rows = [
        {"unknown_language": language, "source_record_id": f"{language}-{i}"}
        for language in ("bn", "gu")
        for i in range(10)
    ]
    calibration, holdout = split_unknown_rows(rows)
    assert len(calibration) == len(holdout) == 10
    for language in ("bn", "gu"):
        left = {row["source_record_id"] for row in calibration if row["unknown_language"] == language}
        right = {row["source_record_id"] for row in holdout if row["unknown_language"] == language}
        assert len(left) == len(right) == 5
        assert not left & right


def test_confidence_threshold_obeys_known_coverage_and_accuracy_constraints():
    known = [
        {"confidence": 0.9, "margin": 0.8, "candidate_language": "hi"},
        {"confidence": 0.8, "margin": 0.7, "candidate_language": "en"},
        {"confidence": 0.7, "margin": 0.6, "candidate_language": "ta"},
        {"confidence": 0.6, "margin": 0.5, "candidate_language": "or"},
        {"confidence": 0.4, "margin": 0.4, "candidate_language": "en"},
    ]
    unknown = [
        {"confidence": 0.3, "margin": 0.4, "candidate_language": "en"},
        {"confidence": 0.35, "margin": 0.5, "candidate_language": "hi"},
        {"confidence": 0.8, "margin": 0.9, "candidate_language": "ta"},
    ]
    result = choose_confidence_threshold(known, ["hi", "en", "ta", "or", "en"], unknown, 0.1)
    assert result["known_validation_coverage"] >= 0.8
    assert result["known_validation_accuracy_on_accepted"] >= 0.98
    assert abs(result["unknown_calibration_rejection_rate"] - 2 / 3) < 1e-9


def test_confidence_threshold_preserves_code_mixed_validation_coverage():
    known = [
        {"confidence": score, "margin": 0.5, "candidate_language": "hi"}
        for score in (0.9, 0.8, 0.7, 0.6, 0.4)
    ]
    result = choose_confidence_threshold(
        known, ["hi"] * 5, [{"confidence": 0.3, "margin": 0.5}], 0.1,
        known_categories=["native_script", "native_script", "code_mixed", "code_mixed", "code_mixed"],
    )
    assert result["code_mixed_validation_coverage"] >= 0.8
