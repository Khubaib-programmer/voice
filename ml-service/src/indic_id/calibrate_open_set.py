"""Tune an explicit unknown rejection threshold on a separate OOD calibration slice.

The primary classifier and its published accuracy/F1 evaluation remain unchanged.
Only the saved inference bundle's rejection threshold is recalibrated.
"""

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC

from indic_id.data import load_training_records
from indic_id.model import LanguageIdentifier, _parts, _pipeline, _split_indices


def split_unknown_rows(rows):
    """Deterministically split each OOD label 50/50 using source record IDs."""
    by_language = defaultdict(list)
    for row in rows:
        by_language[row["unknown_language"]].append(row)
    calibration, holdout = [], []
    for language, language_rows in sorted(by_language.items()):
        ordered = sorted(
            language_rows,
            key=lambda row: hashlib.sha256(row["source_record_id"].encode("utf-8")).digest(),
        )
        if len(ordered) < 2 or len(ordered) % 2:
            raise ValueError(f"Unknown language {language} needs a positive, even number of rows")
        midpoint = len(ordered) // 2
        calibration.extend(ordered[:midpoint])
        holdout.extend(ordered[midpoint:])
    return calibration, holdout


def choose_confidence_threshold(known_predictions, known_labels, unknown_predictions, min_margin,
                                min_known_coverage=0.80, target_known_accuracy=0.98,
                                known_categories=None, min_code_mixed_coverage=0.80):
    """Maximize unknown rejection while preserving known and mixed validation coverage."""
    thresholds = sorted({0.25, *(
        float(item["confidence"])
        for item in known_predictions
        if float(item["confidence"]) >= 0.25
    )})
    candidates = []
    for threshold in thresholds:
        accepted_known = [
            i for i, item in enumerate(known_predictions)
            if item["confidence"] >= threshold and item["margin"] >= min_margin
        ]
        coverage = len(accepted_known) / len(known_predictions)
        if coverage < min_known_coverage:
            continue
        mixed_indexes = [i for i, category in enumerate(known_categories or []) if category == "code_mixed"]
        mixed_coverage = (
            sum(i in set(accepted_known) for i in mixed_indexes) / len(mixed_indexes)
            if mixed_indexes else None
        )
        if mixed_coverage is not None and mixed_coverage < min_code_mixed_coverage:
            continue
        accuracy = sum(
            known_predictions[i]["candidate_language"] == known_labels[i]
            for i in accepted_known
        ) / len(accepted_known)
        if accuracy < target_known_accuracy:
            continue
        accepted_unknown = sum(
            item["confidence"] >= threshold and item["margin"] >= min_margin
            for item in unknown_predictions
        )
        rejection = 1 - accepted_unknown / len(unknown_predictions)
        candidates.append({
            "min_confidence": threshold,
            "min_margin": float(min_margin),
            "known_validation_coverage": coverage,
            "known_validation_accuracy_on_accepted": accuracy,
            "code_mixed_validation_coverage": mixed_coverage,
            "unknown_calibration_rejection_rate": rejection,
            "unknown_calibration_accepted": accepted_unknown,
            "unknown_calibration_rows": len(unknown_predictions),
        })
    if not candidates:
        raise ValueError("No confidence threshold satisfies the known accuracy and coverage constraints")
    return max(candidates, key=lambda item: (
        item["unknown_calibration_rejection_rate"],
        item["known_validation_coverage"],
        item["known_validation_accuracy_on_accepted"],
        -item["min_confidence"],
    ))


def _candidate_pipeline(model_name, random_state):
    if model_name == "linear_svm":
        estimator = LinearSVC(class_weight="balanced", random_state=random_state)
    elif model_name == "logistic_regression":
        estimator = LogisticRegression(max_iter=2000, class_weight="balanced")
    else:
        raise ValueError(f"Unsupported saved model: {model_name}")
    return _pipeline(estimator)


def _prediction_metrics(identifier, rows, text_key, label_key, category_key=None):
    labels = [row[label_key] for row in rows]
    decisions = [identifier.predict(row[text_key]) for row in rows]
    accepted = [i for i, item in enumerate(decisions) if item["language"] != "unknown"]
    report = {
        "rows": len(rows),
        "accepted_as_supported": len(accepted),
        "rejected_as_unknown": len(rows) - len(accepted),
    }
    if label_key == "unknown_language":
        report["false_accept_rate"] = len(accepted) / len(rows) if rows else None
        report["rejection_rate"] = (len(rows) - len(accepted)) / len(rows) if rows else None
    else:
        report["accepted_coverage"] = len(accepted) / len(rows) if rows else None
        report["correct_among_accepted"] = sum(decisions[i]["candidate_language"] == labels[i] for i in accepted)
        report["accuracy_among_accepted"] = (
            sum(decisions[i]["candidate_language"] == labels[i] for i in accepted) / len(accepted)
            if accepted else None
        )
    if category_key:
        report["by_category"] = {}
        for category in sorted({row[category_key] for row in rows}):
            subset = [i for i, row in enumerate(rows) if row[category_key] == category]
            subset_accepted = [i for i in subset if i in set(accepted)]
            report["by_category"][category] = {
                "rows": len(subset),
                "accepted": len(subset_accepted),
                "coverage": len(subset_accepted) / len(subset),
                "accuracy_among_accepted": (
                    sum(decisions[i]["candidate_language"] == labels[i] for i in subset_accepted) / len(subset_accepted)
                    if subset_accepted else None
                ),
            }
    if text_key == "text" and label_key == "unknown_language":
        per_language = {}
        for language in sorted(set(labels)):
            indexes = [i for i, label in enumerate(labels) if label == language]
            per_language[language] = {
                "rows": len(indexes),
                "rejected": sum(decisions[i]["language"] == "unknown" for i in indexes),
                "accepted_as_supported": dict(sorted(Counter(
                    decisions[i]["candidate_language"] for i in indexes
                    if decisions[i]["language"] != "unknown"
                ).items())),
            }
        report["by_unknown_language"] = per_language
    return report


def calibrate(data_path, unknown_path, model_path, output_path, training_evaluation_path,
              run_evaluation_path, manifest_path, random_state=42):
    source_hash = hashlib.sha256(data_path.read_bytes()).hexdigest()
    known = load_training_records(data_path)
    examples = [
        (row["text"], row["language"], row["split_group"], row["category"], row["origin"])
        for row in known
    ]
    train_indices, validation_indices, test_indices = _split_indices(
        [_parts(row, i) for i, row in enumerate(examples)], random_state
    )
    training = [examples[i] for i in train_indices]
    validation = [examples[i] for i in validation_indices]
    test = [examples[i] for i in test_indices]

    with unknown_path.open(encoding="utf-8-sig", newline="") as handle:
        unknown_rows = list(csv.DictReader(handle, delimiter="\t"))
    ood_calibration, ood_holdout = split_unknown_rows(unknown_rows)

    bundle = joblib.load(model_path)
    model_name = bundle["model_name"]
    min_margin = float(bundle["min_margin"])
    candidate = _candidate_pipeline(model_name, random_state)
    candidate.fit([row[0] for row in training], [row[1] for row in training])
    calibration_identifier = LanguageIdentifier(candidate, min_confidence=0.0, min_margin=0.0)
    known_validation_decisions = [calibration_identifier.predict(row[0]) for row in validation]
    unknown_validation_decisions = [calibration_identifier.predict(row["text"]) for row in ood_calibration]
    selected = choose_confidence_threshold(
        known_validation_decisions,
        [row[1] for row in validation],
        unknown_validation_decisions,
        min_margin,
        known_categories=[row[3] for row in validation],
    )

    old_thresholds = bundle.get("pre_calibration_thresholds", {
        "min_confidence": float(bundle["min_confidence"]),
        "min_margin": min_margin,
    })
    bundle["pre_calibration_thresholds"] = old_thresholds
    old_identifier = LanguageIdentifier(bundle["pipeline"], **old_thresholds)
    old_full_ood = _prediction_metrics(old_identifier, unknown_rows, "text", "unknown_language")

    bundle["min_confidence"] = selected["min_confidence"]
    bundle["min_margin"] = selected["min_margin"]
    bundle["rejection_calibration"] = {
        "method": "confidence threshold tuned on known validation plus OOD calibration split",
        "unknown_dataset_split": "per-language deterministic 50/50 source_record_id hash split",
        "minimum_known_validation_coverage": 0.80,
        "minimum_known_validation_accepted_accuracy": 0.98,
        "minimum_code_mixed_validation_coverage": 0.80,
        "selected_validation_metrics": selected,
        "random_state": random_state,
    }
    joblib.dump(bundle, model_path)
    model_hash = hashlib.sha256(model_path.read_bytes()).hexdigest()
    identifier = LanguageIdentifier(bundle["pipeline"], bundle["min_confidence"], bundle["min_margin"])

    known_test_rows = [
        {"text": row[0], "language": row[1], "category": row[3]}
        for row in test
    ]
    holdout_known = _prediction_metrics(identifier, known_test_rows, "text", "language", "category")
    holdout_unknown = _prediction_metrics(identifier, ood_holdout, "text", "unknown_language")
    unknown_manifest_path = unknown_path.with_suffix(unknown_path.suffix + ".manifest.json")
    unknown_manifest = json.loads(unknown_manifest_path.read_text(encoding="utf-8"))
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": "open-set rejection threshold calibration; classifier weights and primary held-out language metrics are unchanged",
        "primary_training_data_sha256": source_hash,
        "unknown_dataset_manifest": str(unknown_manifest_path),
        "unknown_dataset_sha256": unknown_manifest["output_sha256"],
        "unknown_source": unknown_manifest["dataset"],
        "unknown_total_rows": len(unknown_rows),
        "unknown_language_split": {
            "calibration_rows": len(ood_calibration),
            "heldout_rows": len(ood_holdout),
            "counts_by_language_calibration": dict(sorted(Counter(row["unknown_language"] for row in ood_calibration).items())),
            "counts_by_language_heldout": dict(sorted(Counter(row["unknown_language"] for row in ood_holdout).items())),
            "split_rule": "within each language, sort by SHA-256(source_record_id); first half calibrates, second half is untouched evaluation",
        },
        "precalibration_full_slice_result": {
            "thresholds": old_thresholds,
            "metrics": old_full_ood,
            "note": "Historical result using the old threshold across all 800 rows; it is descriptive and was not used for threshold selection.",
        },
        "selected_threshold": {
            "min_confidence": bundle["min_confidence"],
            "min_margin": bundle["min_margin"],
            "confidence_kind": "normalized_decision_score_proxy; not a calibrated probability",
            "validation_selection": selected,
        },
        "heldout_known_language_test": holdout_known,
        "heldout_unknown_language_test": holdout_unknown,
        "model_artifact": {
            "path": str(model_path),
            "size_bytes": model_path.stat().st_size,
            "sha256": model_hash,
        },
        "limitations": [
            "The 400-row OOD holdout contains eight Romanized Dakshina language labels from the Bhasha-Abhijnaanam archive family; it is not an independent-source or global unknown-language benchmark.",
            "The rejection threshold is tuned to these calibration domains and reduces known-language acceptance coverage; calibration should be repeated with production-like OOD and ambiguous text.",
            "Odia code-mixed text has no verified training/evaluation examples.",
        ],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    for path in {Path(training_evaluation_path), Path(run_evaluation_path)}:
        if not path.exists():
            continue
        training_report = json.loads(path.read_text(encoding="utf-8"))
        training_report["saved_model_sha256"] = model_hash
        training_report["saved_model_size_bytes"] = model_path.stat().st_size
        training_report["confidence_rejection"] = {
            **selected,
            "note": "Calibrated using a known-language validation set and a separate OOD calibration half. The SVM confidence remains a normalized decision-score proxy, not a calibrated probability. See unknown-language-evaluation.json for untouched holdout results and coverage tradeoffs.",
        }
        path.write_text(json.dumps(training_report, ensure_ascii=False, indent=2), encoding="utf-8")
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["selected_model_artifact"] = {
            "file": model_path.name,
            "size_bytes": model_path.stat().st_size,
            "sha256": model_hash,
        }
        Path(manifest_path).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("data/processed/current.tsv"))
    parser.add_argument("--unknown-data", type=Path, default=Path("data/processed/unknown-eval.tsv"))
    parser.add_argument("--model", type=Path, default=Path("artifacts/real-source-run/best_model.joblib"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/unknown-language-evaluation.json"))
    parser.add_argument("--training-evaluation", type=Path, default=Path("artifacts/evaluation.json"))
    parser.add_argument("--run-evaluation", type=Path, default=Path("artifacts/real-source-run/evaluation.json"))
    parser.add_argument("--manifest", type=Path, default=Path("artifacts/dataset-manifest.json"))
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()
    result = calibrate(args.data, args.unknown_data, args.model, args.output,
                       args.training_evaluation, args.run_evaluation, args.manifest,
                       args.random_state)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
