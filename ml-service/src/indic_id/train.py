"""Command line training/evaluation entry point."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib

from indic_id.data import load_examples
from indic_id.languages import LANGUAGE_CODES
from indic_id.model import compare_models


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, help="CSV or TSV with text and language columns")
    parser.add_argument("--text-column", default="text")
    parser.add_argument("--label-column", default="language")
    parser.add_argument("--group-column", default="group_id", help="Set empty to use a row-stratified holdout")
    parser.add_argument("--output-dir", default="artifacts")
    parser.add_argument("--manifest", default="artifacts/dataset-manifest.json")
    parser.add_argument("--target-per-cell", type=int, default=500)
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.is_file():
        parser.error(f"Dataset manifest not found: {manifest_path}; run indic_id.manifest first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    shortfalls = {
        cell: values["source_shortfall"]
        for cell, values in manifest["cells"].items()
        if values["source_total"] < args.target_per_cell
    }
    if shortfalls:
        parser.error(f"Target source-sample quota is incomplete: {shortfalls}")

    group_column = args.group_column or None
    examples = load_examples(args.data, args.text_column, args.label_column, group_column)
    unsupported = sorted({example[1] for example in examples} - LANGUAGE_CODES)
    if unsupported:
        parser.error(f"Unsupported labels: {', '.join(unsupported)}")
    missing_languages = sorted(LANGUAGE_CODES - {example[1] for example in examples})
    if missing_languages:
        parser.error(f"Missing required language labels: {', '.join(missing_languages)}")
    counts = {}
    for example in examples:
        label = example[1]
        counts[label] = counts.get(label, 0) + 1
    if len(counts) < 2 or min(counts.values()) < 2:
        parser.error("Need at least two languages and at least two examples per language")

    reports, models = compare_models(examples)
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    for name, model in models.items():
        joblib.dump(model, output / f"{name}.joblib")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(Path(args.data).resolve()),
        "example_count": len(examples),
        "class_counts": counts,
        "dataset_manifest": str(manifest_path.resolve()),
        "dataset_file_size_bytes": manifest["file_size_bytes"],
        "dataset_source_rows": manifest["source_rows"],
        "dataset_licensed_source_rows": manifest["licensed_source_rows"],
        "dataset_provided_generated_rows": manifest["dataset_generated_rows"],
        "synthetic_augmentation_rows": manifest["synthetic_rows"],
        "target_per_applicable_cell": manifest["target_per_applicable_cell"],
        "metrics": reports,
        "note": "Metrics are from this run only; confidence scores from LinearSVC are normalized decision scores, not calibrated probabilities.",
    }
    (output / "evaluation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
