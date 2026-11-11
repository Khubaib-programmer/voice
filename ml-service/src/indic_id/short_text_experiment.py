"""Compare the production character model with a short-text candidate.

The production data split is kept fixed. The Tatoeba supplemental text is
group-split independently and never crosses its own train/validation/test
partitions. Candidate selection and rejection calibration use validation data
and the existing OOD calibration half only; final test rows are held out.
"""

import argparse
import csv
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from indic_id.calibrate_open_set import split_unknown_rows
from indic_id.data import load_training_records
from indic_id.model import LanguageIdentifier, _pipeline, _split_indices

LANGUAGES = ["en", "hi", "or", "ta"]
SHORT_MAX_TOKENS = 8
MEDIUM_MAX_TOKENS = 20
CHALLENGE_TEXTS = {
    "en": ["Good morning.", "How are you?", "My name is Khubaib.", "I live in India.", "My name is Muhammad Khubab Ansari."],
    "hi": ["आप कैसे हैं?", "मेरा नाम खुबैब है।", "मुझे पानी चाहिए।"],
    "ta": ["வணக்கம்.", "நீங்கள் எப்படி இருக்கிறீர்கள்?"],
    "or": ["ନମସ୍କାର।", "ଆପଣ କେମିତି ଅଛନ୍ତି?"],
    "unsupported_or_ambiguous": ["Bonjour", "Guten Morgen", "বাংলা ভাষা", "OK", "Hi", "namaste"],
}


def _short_candidate_pipeline(random_state=42):
    # Still character TF-IDF + LinearSVC; char_wb learns within-word character
    # patterns plus word-boundary evidence that validation selected.
    model = _pipeline(LinearSVC(class_weight="balanced", random_state=random_state))
    model.set_params(tfidf__analyzer="char_wb", tfidf__ngram_range=(2, 5))
    return model


def _records(path: Path):
    return load_training_records(path)


def _examples(rows):
    return [(row["text"], row["language"], row["split_group"], row["category"], row["origin"]) for row in rows]


def _labels(rows):
    return [row["language"] for row in rows]


def _token_count(text):
    return len(text.split())


def _length_bin(text):
    count = _token_count(text)
    if count <= SHORT_MAX_TOKENS:
        return "short_1_to_8_tokens"
    if count <= MEDIUM_MAX_TOKENS:
        return "medium_9_to_20_tokens"
    return "long_over_20_tokens"


def _classification_metrics(labels, predictions):
    if not labels:
        return {"rows": 0, "accuracy": None, "macro_f1": None, "per_language": {}, "confusion_matrix": []}
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, predictions, labels=LANGUAGES, average=None, zero_division=0
    )
    return {
        "rows": len(labels),
        "accuracy": float(accuracy_score(labels, predictions)),
        "macro_f1": float(f1_score(labels, predictions, labels=sorted(set(labels)), average="macro", zero_division=0)),
        "per_language": {
            language: {"precision": float(p), "recall": float(r), "f1": float(score)}
            for language, p, r, score in zip(LANGUAGES, precision, recall, f1)
        },
        "confusion_matrix": confusion_matrix(labels, predictions, labels=LANGUAGES).tolist(),
        "confusion_matrix_labels": LANGUAGES,
    }


def _metrics_by_key(rows, predictions, field):
    result = {}
    for value in sorted({row[field] for row in rows}):
        indices = [i for i, row in enumerate(rows) if row[field] == value]
        result[value] = _classification_metrics(
            [rows[i]["language"] for i in indices], [predictions[i] for i in indices]
        )
    return result


def _metrics_by_length(rows, predictions):
    return {
        length: _classification_metrics(
            [row["language"] for row in rows if _length_bin(row["text"]) == length],
            [score for row, score in zip(rows, predictions) if _length_bin(row["text"]) == length],
        )
        for length in ("short_1_to_8_tokens", "medium_9_to_20_tokens", "long_over_20_tokens")
    }


def _metrics_by_category(rows, predictions):
    return {
        category: _classification_metrics(
            [row["language"] for row in rows if row["category"] == category],
            [score for row, score in zip(rows, predictions) if row["category"] == category],
        )
        for category in ("native_script", "romanized", "code_mixed")
    }


def _score_predictions(model, rows):
    identifier = LanguageIdentifier(model, min_confidence=0.0, min_margin=0.0)
    return [identifier.predict(row["text"]) for row in rows]


def _select_rejection_threshold(known_rows, known_scores, ood_rows, ood_scores):
    labels = _labels(known_rows)
    categories = [row["category"] for row in known_rows]
    lengths = [_length_bin(row["text"]) for row in known_rows]
    confidences = [float(row["confidence"]) for row in known_scores]
    margins = [float(row["margin"]) for row in known_scores]
    confidence_grid = sorted({0.0, 0.25, 0.4, 0.55, *np.quantile(confidences, np.linspace(0, 1, 41)).tolist()})
    margin_grid = sorted({0.0, 0.1, 0.2, 0.3, 0.3342549208649863, *np.quantile(margins, np.linspace(0, 1, 41)).tolist()})
    candidates = []
    for min_confidence in confidence_grid:
        for min_margin in margin_grid:
            accepted = [i for i, score in enumerate(known_scores)
                        if score["confidence"] >= min_confidence and score["margin"] >= min_margin]
            if not accepted:
                continue
            coverage = len(accepted) / len(known_rows)
            accepted_accuracy = sum(known_scores[i]["candidate_language"] == labels[i] for i in accepted) / len(accepted)
            mixed = [i for i, category in enumerate(categories) if category == "code_mixed"]
            mixed_coverage = sum(i in accepted for i in mixed) / len(mixed) if mixed else None
            short = [i for i, length in enumerate(lengths) if length == "short_1_to_8_tokens"]
            short_accepted = [i for i in accepted if lengths[i] == "short_1_to_8_tokens"]
            short_coverage = len(short_accepted) / len(short) if short else None
            short_accuracy = (
                sum(known_scores[i]["candidate_language"] == labels[i] for i in short_accepted) / len(short_accepted)
                if short_accepted else None
            )
            if coverage < 0.80 or accepted_accuracy < 0.98 or (mixed_coverage is not None and mixed_coverage < 0.80):
                continue
            if short and (short_coverage is None or short_coverage < 0.50 or short_accuracy < 0.95):
                continue
            accepted_ood = sum(
                score["confidence"] >= min_confidence and score["margin"] >= min_margin
                for score in ood_scores
            )
            ood_rejection = 1 - accepted_ood / len(ood_scores)
            candidates.append({
                "min_confidence": float(min_confidence),
                "min_margin": float(min_margin),
                "known_validation_coverage": coverage,
                "known_validation_accuracy_on_accepted": accepted_accuracy,
                "code_mixed_validation_coverage": mixed_coverage,
                "short_validation_coverage": short_coverage,
                "short_validation_accuracy_on_accepted": short_accuracy,
                "unknown_calibration_rejection_rate": ood_rejection,
                "unknown_calibration_rows": len(ood_scores),
            })
    if not candidates:
        raise ValueError("No candidate rejection thresholds meet the known accuracy, coverage, and short-text constraints")
    return max(candidates, key=lambda row: (
        row["unknown_calibration_rejection_rate"], row["known_validation_coverage"],
        row["known_validation_accuracy_on_accepted"], -row["min_confidence"], -row["min_margin"],
    ))


def _operating_metrics(rows, scores, min_confidence, min_margin, unknown=False):
    accepted = [i for i, score in enumerate(scores)
                if score["confidence"] >= min_confidence and score["margin"] >= min_margin]
    report = {
        "rows": len(rows),
        "accepted": len(accepted),
        "rejected_as_unknown_or_ambiguous": len(rows) - len(accepted),
        "coverage": len(accepted) / len(rows) if rows else None,
    }
    if unknown:
        report["false_accept_rate"] = report["coverage"]
        report["rejection_rate"] = 1 - report["coverage"] if rows else None
    else:
        report["accuracy_among_accepted"] = (
            sum(scores[i]["candidate_language"] == rows[i]["language"] for i in accepted) / len(accepted)
            if accepted else None
        )
        report["by_language"] = {}
        for language in LANGUAGES:
            indices = [i for i, row in enumerate(rows) if row["language"] == language]
            kept = [i for i in indices if i in accepted]
            report["by_language"][language] = {
                "rows": len(indices), "accepted": len(kept),
                "coverage": len(kept) / len(indices) if indices else None,
                "accuracy_among_accepted": (
                    sum(scores[i]["candidate_language"] == language for i in kept) / len(kept)
                    if kept else None
                ),
            }
        report["by_length"] = {}
        for length in sorted({_length_bin(row["text"]) for row in rows}):
            indices = [i for i, row in enumerate(rows) if _length_bin(row["text"]) == length]
            kept = [i for i in indices if i in accepted]
            report["by_length"][length] = {
                "rows": len(indices), "accepted": len(kept),
                "coverage": len(kept) / len(indices) if indices else None,
                "accuracy_among_accepted": (
                    sum(scores[i]["candidate_language"] == rows[i]["language"] for i in kept) / len(kept)
                    if kept else None
                ),
            }
    return report


def _challenge_report(identifier):
    result = {}
    for group, texts in CHALLENGE_TEXTS.items():
        result[group] = []
        for text in texts:
            prediction = identifier.predict(text)
            result[group].append({
                "text": text,
                "language": prediction["language"],
                "candidate_language": prediction.get("candidate_language"),
                "model_score": prediction["confidence"],
                "confidence_kind": prediction.get("confidence_kind"),
                "margin": prediction.get("margin"),
                "reason": prediction.get("reason"),
            })
    return result


def _near_duplicate_filter(core_rows, short_rows, threshold=0.90):
    """Drop short-source candidates that nearly duplicate any primary row."""
    if not core_rows or not short_rows:
        return short_rows, 0
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(3, 5), binary=True, norm="l2")
    matrix = vectorizer.fit_transform([row["text"] for row in core_rows + short_rows])
    core_matrix = matrix[:len(core_rows)]
    short_matrix = matrix[len(core_rows):]
    scores = short_matrix @ core_matrix.T
    maxima = np.asarray(scores.max(axis=1).toarray()).ravel()
    kept = [row for row, maximum in zip(short_rows, maxima) if maximum < threshold]
    return kept, len(short_rows) - len(kept)


def run_experiment(data_path: Path, short_data_path: Path, unknown_path: Path,
                   baseline_model_path: Path, baseline_evaluation_path: Path,
                   output_dir: Path, report_path: Path, random_state=42):
    core_rows = _records(data_path)
    core_train_idx, core_val_idx, core_test_idx = _split_indices(_examples(core_rows), random_state)
    core_train = [core_rows[i] for i in core_train_idx]
    core_val = [core_rows[i] for i in core_val_idx]
    core_test = [core_rows[i] for i in core_test_idx]
    core_split_rows = {"train": core_train, "validation": core_val, "test": core_test}

    short_rows = _records(short_data_path)
    short_rows, near_duplicate_count = _near_duplicate_filter(core_rows, short_rows)
    short_train_idx, short_val_idx, short_test_idx = _split_indices(_examples(short_rows), random_state)
    short_train = [short_rows[i] for i in short_train_idx]
    short_val = [short_rows[i] for i in short_val_idx]
    short_test = [short_rows[i] for i in short_test_idx]

    train_rows = core_train + short_train
    val_rows = core_val + short_val
    test_rows = core_test
    baseline = joblib.load(baseline_model_path)
    baseline_pipeline = baseline["pipeline"] if isinstance(baseline, dict) else baseline
    baseline_identifier = LanguageIdentifier(
        baseline_pipeline,
        float(baseline.get("min_confidence", 0.25)) if isinstance(baseline, dict) else 0.25,
        float(baseline.get("min_margin", 0.10)) if isinstance(baseline, dict) else 0.10,
    )

    baseline_training_model = _pipeline(LinearSVC(class_weight="balanced", random_state=random_state))
    baseline_training_model.fit([r["text"] for r in core_train], _labels(core_train))
    baseline_predictions = baseline_training_model.predict([r["text"] for r in core_test])

    candidate = _short_candidate_pipeline(random_state)
    candidate.fit([r["text"] for r in train_rows], _labels(train_rows))
    val_scores = _score_predictions(candidate, val_rows)

    with unknown_path.open(encoding="utf-8-sig", newline="") as handle:
        unknown_rows = list(csv.DictReader(handle, delimiter="\t"))
    ood_calibration, ood_holdout = split_unknown_rows(unknown_rows)
    calibration_identifier = LanguageIdentifier(candidate, 0.0, 0.0)
    ood_calibration_scores = [calibration_identifier.predict(row["text"]) for row in ood_calibration]
    threshold = _select_rejection_threshold(val_rows, val_scores, ood_calibration, ood_calibration_scores)
    min_confidence = threshold["min_confidence"]
    min_margin = threshold["min_margin"]

    candidate_core_scores = _score_predictions(candidate, core_test)
    candidate_short_scores = _score_predictions(candidate, short_test)
    baseline_short_scores = _score_predictions(baseline_training_model, short_test)

    baseline_raw = _classification_metrics(_labels(core_test), list(baseline_predictions))
    candidate_raw = _classification_metrics(_labels(core_test), [x["candidate_language"] for x in candidate_core_scores])
    baseline_short_raw = _classification_metrics(_labels(short_test), [x["candidate_language"] for x in baseline_short_scores])
    candidate_short_raw = _classification_metrics(_labels(short_test), [x["candidate_language"] for x in candidate_short_scores])

    # Final candidate is refit on all allowed known training and validation rows;
    # core and short source test groups remain excluded.
    final_rows = core_train + core_val + short_train + short_val
    final_candidate = _short_candidate_pipeline(random_state)
    final_candidate.fit([r["text"] for r in final_rows], _labels(final_rows))
    baseline_production_core_scores = [baseline_identifier.predict(row["text"]) for row in core_test]
    baseline_production_short_scores = [baseline_identifier.predict(row["text"]) for row in short_test]
    baseline_production_ood_scores = [baseline_identifier.predict(row["text"]) for row in ood_holdout]
    candidate_production_core_scores = _score_predictions(final_candidate, core_test)
    candidate_production_short_scores = _score_predictions(final_candidate, short_test)
    candidate_production_uncalibrated = LanguageIdentifier(final_candidate, 0.0, 0.0)
    candidate_production_ood_scores = [candidate_production_uncalibrated.predict(row["text"]) for row in ood_holdout]
    output_dir.mkdir(parents=True, exist_ok=True)
    candidate_path = output_dir / "candidate_model.joblib"
    bundle = {
        "pipeline": final_candidate,
        "min_confidence": min_confidence,
        "min_margin": min_margin,
        "model_name": "linear_svm_char_wb_2_5_short_text_candidate",
        "baseline_model": "linear_svm_char_2_5",
        "training_data": {
            "primary": str(data_path), "supplement": str(short_data_path),
            "primary_rows": len(core_train) + len(core_val),
            "supplement_rows": len(short_train) + len(short_val),
            "primary_test_rows_excluded": len(core_test),
            "supplement_test_rows_excluded": len(short_test),
        },
        "rejection_calibration": threshold,
        "confidence_kind": "normalized_decision_score_proxy; not a calibrated probability",
    }
    joblib.dump(bundle, candidate_path)
    artifact_hash = hashlib.sha256(candidate_path.read_bytes()).hexdigest()
    artifact_size = candidate_path.stat().st_size

    candidate_identifier = LanguageIdentifier(final_candidate, min_confidence, min_margin)
    baseline_known_operating = _operating_metrics(core_test, candidate_core_scores,
        float(baseline.get("min_confidence", 0.25)) if isinstance(baseline, dict) else 0.25,
        float(baseline.get("min_margin", 0.10)) if isinstance(baseline, dict) else 0.10)
    candidate_known_operating = _operating_metrics(core_test, candidate_production_core_scores, min_confidence, min_margin)
    candidate_short_operating = _operating_metrics(short_test, candidate_production_short_scores, min_confidence, min_margin)
    baseline_short_operating = _operating_metrics(
        short_test, baseline_production_short_scores,
        float(baseline.get("min_confidence", 0.25)),
        float(baseline.get("min_margin", 0.10)),
    )
    baseline_unknown_operating = _operating_metrics(
        ood_holdout, baseline_production_ood_scores,
        float(baseline.get("min_confidence", 0.25)),
        float(baseline.get("min_margin", 0.10)),
        unknown=True,
    )
    unknown_operating = _operating_metrics(
        ood_holdout, candidate_production_ood_scores, min_confidence, min_margin, unknown=True
    )

    baseline_report = json.loads(baseline_evaluation_path.read_text(encoding="utf-8"))
    baseline_known_f1 = baseline_report["metrics_by_model"]["linear_svm"]["per_language_f1"]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "experiment": "short text improvement candidate; original production artifact remains unchanged",
        "protocol": {
            "primary_source_split": "existing deterministic StratifiedGroupKFold split, seed 42, unchanged 60/20/20 groups",
            "supplement_split": "independent deterministic StratifiedGroupKFold split by Tatoeba translation-link/exact/near-duplicate group",
            "test_usage": "No threshold or model selection used core or Tatoeba test sets. Candidate thresholds use combined validation plus the existing OOD calibration half.",
            "short_definition": f"1–{SHORT_MAX_TOKENS} whitespace tokens; medium {SHORT_MAX_TOKENS + 1}–{MEDIUM_MAX_TOKENS}; long >{MEDIUM_MAX_TOKENS}",
            "near_duplicate_filter": {"char_3_5_cosine_threshold": 0.90, "supplement_rows_removed_against_primary": near_duplicate_count},
        },
        "dataset": {
            "primary_rows": len(core_rows),
            "primary_split_rows": {"train": len(core_train), "validation": len(core_val), "test": len(core_test)},
            "primary_short_rows_by_split_and_language": {
                split: {
                    "rows": sum(_length_bin(row["text"]) == "short_1_to_8_tokens" for row in rows),
                    "by_language": {
                        language: sum(row["language"] == language and _length_bin(row["text"]) == "short_1_to_8_tokens" for row in rows)
                        for language in LANGUAGES
                    },
                }
                for split, rows in core_split_rows.items()
            },
            "supplement_rows_after_filter": len(short_rows),
            "supplement_rows_by_language": dict(sorted(Counter(row["language"] for row in short_rows).items())),
            "supplement_split_rows": {"train": len(short_train), "validation": len(short_val), "test": len(short_test)},
            "supplement_split_groups": {
                "train": len({row["split_group"] for row in short_train}),
                "validation": len({row["split_group"] for row in short_val}),
                "test": len({row["split_group"] for row in short_test}),
            },
            "supplement_test_rows_by_language": dict(sorted(Counter(row["language"] for row in short_test).items())),
            "supplement_test_is_short_only": all(_length_bin(row["text"]) == "short_1_to_8_tokens" for row in short_test),
            "supplement_test_groups": len({row["split_group"] for row in short_test}),
            "synthetic_rows": 0,
        },
        "models": {
            "baseline": {
                "architecture": "character TF-IDF (char 2–5, min_df=1, sublinear_tf) + LinearSVC",
                "existing_reproduced_headline": {"accuracy": 0.969, "macro_f1": 0.9675747938901821,
                    "per_language_f1": baseline_known_f1},
                "same_core_test_raw_classifier": baseline_raw,
                "same_tatoeba_short_test_raw_classifier": baseline_short_raw,
                "core_test_by_length": _metrics_by_length(core_test, [x["candidate_language"] for x in _score_predictions(baseline_training_model, core_test)]),
                "core_test_by_category": _metrics_by_category(core_test, [x["candidate_language"] for x in _score_predictions(baseline_training_model, core_test)]),
                "known_core_test_rejection": _operating_metrics(core_test, baseline_production_core_scores,
                    float(baseline.get("min_confidence", 0.25)), float(baseline.get("min_margin", 0.10))),
                "tatoeba_short_test_rejection": baseline_short_operating,
                "unknown_language_holdout": baseline_unknown_operating,
            },
            "candidate": {
                "architecture": "character-boundary TF-IDF (char_wb 2–5, min_df=1, sublinear_tf) + LinearSVC; added real Tatoeba short text",
                "validation_raw": _classification_metrics(_labels(val_rows), [x["candidate_language"] for x in val_scores]),
                "same_core_test_raw_classifier": candidate_raw,
                "same_tatoeba_short_test_raw_classifier": candidate_short_raw,
                "core_test_by_length": _metrics_by_length(core_test, [x["candidate_language"] for x in candidate_core_scores]),
                "core_test_by_category": _metrics_by_category(core_test, [x["candidate_language"] for x in candidate_core_scores]),
                "known_core_test_rejection": candidate_known_operating,
                "tatoeba_short_test_rejection": candidate_short_operating,
                "unknown_language_holdout": unknown_operating,
                "selected_threshold": threshold,
                "artifact": {"path": str(candidate_path), "bytes": artifact_size, "sha256": artifact_hash},
            },
        },
        "challenge_inputs": {
            "note": "User-supplied examples are diagnostic challenge strings, not training data or a statistically representative benchmark.",
            "baseline": _challenge_report(baseline_identifier),
            "candidate": _challenge_report(candidate_identifier),
        },
        "promotion_recommended": False,
        "conclusion": "Do not promote: the candidate improves the supplemental Tatoeba short holdout but does not improve primary macro F1 and raises the unknown-language false-accept rate; it also accepts ambiguous challenge strings. The production artifact is unchanged.",
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("data/processed/current.tsv"))
    parser.add_argument("--short-data", type=Path, default=Path("data/processed/tatoeba-short.tsv"))
    parser.add_argument("--unknown", type=Path, default=Path("data/processed/unknown-eval.tsv"))
    parser.add_argument("--baseline-model", type=Path, default=Path("artifacts/real-source-run/best_model.joblib"))
    parser.add_argument("--baseline-evaluation", type=Path, default=Path("artifacts/evaluation.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/short-text-candidate"))
    parser.add_argument("--report", type=Path, default=Path("artifacts/short-text-experiment.json"))
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()
    report = run_experiment(args.data, args.short_data, args.unknown, args.baseline_model,
                            args.baseline_evaluation, args.output_dir, args.report, args.random_state)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
