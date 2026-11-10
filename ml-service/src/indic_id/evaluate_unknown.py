"""Evaluate rejection of labeled languages outside this service's scope."""

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import joblib

from indic_id.model import LanguageIdentifier


def evaluate(data_path: Path, model_path: Path, output_path: Path, dataset_manifest: Path):
    bundle = joblib.load(model_path)
    identifier = LanguageIdentifier(
        bundle["pipeline"], float(bundle["min_confidence"]), float(bundle["min_margin"])
    )
    with data_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    by_language = defaultdict(Counter)
    total = Counter()
    for row in rows:
        prediction = identifier.predict(row["text"])
        expected = row["unknown_language"]
        by_language[expected][prediction["language"]] += 1
        total[prediction["language"]] += 1
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_manifest": str(dataset_manifest),
        "model_sha256": hashlib.sha256(model_path.read_bytes()).hexdigest(),
        "rows": len(rows),
        "supported_labels": ["en", "hi", "or", "ta"],
        "unknown_rows_rejected": total["unknown"],
        "unknown_rejection_rate": total["unknown"] / len(rows) if rows else None,
        "unknown_rows_accepted_as_supported": len(rows) - total["unknown"],
        "unknown_false_accept_rate": (len(rows) - total["unknown"]) / len(rows) if rows else None,
        "predicted_supported_language_counts": dict(sorted((key, value) for key, value in total.items() if key != "unknown")),
        "per_unknown_language": {
            lang: {
                "rows": sum(counts.values()),
                "rejected_as_unknown": counts["unknown"],
                "rejection_rate": counts["unknown"] / sum(counts.values()),
                "accepted_as_supported": sum(value for key, value in counts.items() if key != "unknown"),
                "predictions": dict(sorted(counts.items())),
            }
            for lang, counts in sorted(by_language.items())
        },
        "limitation": "This is an unseen-label test on Romanized Dakshina examples from the Bhasha-Abhijnaanam archive family, not an independent-source benchmark. False-accept rate is not a general production guarantee.",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("data/processed/unknown-eval.tsv"))
    parser.add_argument("--model", type=Path, default=Path("artifacts/real-source-run/best_model.joblib"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/unknown-language-evaluation.json"))
    parser.add_argument("--dataset-manifest", type=Path, default=Path("artifacts/unknown-language-dataset-manifest.json"))
    args = parser.parse_args()
    print(json.dumps(evaluate(args.data, args.model, args.output, args.dataset_manifest), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
