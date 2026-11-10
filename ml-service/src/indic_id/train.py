"""Train, compare and test the selected TF-IDF language ID pipelines."""

import argparse
import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import sklearn

from indic_id.data import load_training_records
from indic_id.languages import LANGUAGE_CODES
from indic_id.manifest import create_manifest
from indic_id.model import compare_models


def _sanitize_source_manifest(value):
    path_keys = {"input_file", "input_archive", "input_path", "output", "output_path", "output_file"}
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            if key not in path_keys:
                sanitized[key] = _sanitize_source_manifest(item)
                continue
            path = Path(item)
            if path.is_absolute():
                try:
                    path = path.relative_to(Path.cwd())
                except ValueError:
                    path = Path(path.name)
            sanitized[key] = path.as_posix()
        return sanitized
    if isinstance(value, list):
        return [_sanitize_source_manifest(item) for item in value]
    return value


def train(data_path: Path, output_dir: Path, manifest_path: Path, source_manifests=(), random_state: int = 42):
    records = load_training_records(data_path)
    present = {row["language"] for row in records}
    missing = sorted(LANGUAGE_CODES - present)
    if missing:
        raise ValueError(f"Missing language labels: {missing}")
    examples = [
        (row["text"], row["language"], row["split_group"], row["category"], row["origin"])
        for row in records
    ]
    reports, _candidate_models, best_name, best_model = compare_models(examples, random_state=random_state)
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "best_model.joblib"
    rejection = reports[best_name]["known_input_rejection"]
    model_bundle = {
        "pipeline": best_model,
        "min_confidence": rejection["thresholds"]["min_confidence"],
        "min_margin": rejection["thresholds"]["min_margin"],
        "model_name": best_name,
    }
    joblib.dump(model_bundle, model_path)
    model_sha256 = hashlib.sha256(model_path.read_bytes()).hexdigest()

    manifest = create_manifest(data_path)
    manifest["model_training_rows"] = len(records)
    manifest["excluded_from_primary_training"] = {
        "dataset_generated": manifest["dataset_generated_rows"],
        "synthetic": manifest["synthetic_rows"],
    }
    manifest["source_file_sha256"] = hashlib.sha256(data_path.read_bytes()).hexdigest()
    manifest["selected_model_artifact"] = {
        "file": model_path.name,
        "size_bytes": model_path.stat().st_size,
        "sha256": model_sha256,
    }
    source_details = []
    for source_manifest in source_manifests:
        source_details.append(_sanitize_source_manifest(json.loads(Path(source_manifest).read_text(encoding="utf-8"))))
    manifest["source_manifests"] = source_details
    manifest["train_validation_test_distribution"] = reports[best_name]["split_distribution"]
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(data_path),
        "source_file_size_bytes": data_path.stat().st_size,
        "source_file_sha256": hashlib.sha256(data_path.read_bytes()).hexdigest(),
        "training_rows": len(records),
        "runtime": {
            "platform": platform.platform(),
            "processor": platform.processor() or "not reported by host",
            "python": sys.version.split()[0],
            "scikit_learn": sklearn.__version__,
            "latency_method": "single-example predict after 50 warm-up calls per measured split/category",
        },
        "class_counts": manifest["language_distribution"],
        "category_counts": manifest["category_distribution"],
        "origin_counts": manifest["origin_distribution"],
        "split_strategy": "stratified_group_train_validation_test_60_20_20",
        "split_distribution": reports[best_name]["split_distribution"],
        "metrics_by_model": reports,
        "selected_model": best_name,
        "selection_rule": "highest validation macro F1; test metrics are not used for selection",
        "evaluation_note": "Candidate test metrics are computed using models fitted on train only. The selected model artifact is refit on train+validation after test evaluation; the test set is never used to fit or select it.",
        "saved_model": str(model_path),
        "saved_model_size_bytes": model_path.stat().st_size,
        "saved_model_sha256": model_sha256,
        "dataset_manifest": str(manifest_path),
        "confidence_rejection": {
            **rejection["thresholds"],
            "validation_selection": rejection["validation_selection"],
            "note": "Linear SVM confidence is a normalized decision-score proxy, not a calibrated probability; thresholds are selected on known-language validation data and do not measure unknown false acceptance.",
        },
        "limitations": [
            "The Odia code-mixed category has no verified natural source rows and is absent from primary training.",
            "Tamil-English code-mixed source rows are mixed-script cases only; Latin-only Tanglish examples were excluded because automatic distinction from English-only text is not sufficiently reliable.",
            "The Hindi-English and Tamil-English sources are social-media comments and may not represent formal or spoken language.",
            "All available rows were used; the original per-cell 500-row target is reported as a target, not forced where source data is unavailable.",
        ],
    }
    evaluation_path = output_dir / "evaluation.json"
    evaluation_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, type=Path, help="Merged normalized TSV")
    parser.add_argument("--output-dir", default=Path("artifacts/training-run"), type=Path)
    parser.add_argument("--manifest", default=Path("artifacts/dataset-manifest.json"), type=Path)
    parser.add_argument("--source-manifest", action="append", default=[], help="Per-source provenance manifest; may be repeated")
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()
    report = train(args.data, args.output_dir, args.manifest, args.source_manifest, args.random_state)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
