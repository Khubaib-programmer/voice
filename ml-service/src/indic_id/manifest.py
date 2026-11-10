"""Count prepared examples by language/category/origin without changing data."""

import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from indic_id.languages import LANGUAGE_CODES

CATEGORIES = {"native_script", "romanized", "code_mixed"}


def create_manifest(path: str | Path, target_per_cell: int = 500) -> dict[str, object]:
    path = Path(path)
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    counts: Counter[tuple[str, str, str]] = Counter()
    rows = 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        required = {"text", "language", "category", "origin", "source"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")
        for line, row in enumerate(reader, 2):
            text = (row["text"] or "").strip()
            language = (row["language"] or "").strip().lower()
            category = (row["category"] or "").strip().lower()
            origin = (row["origin"] or "").strip().lower()
            if not text:
                raise ValueError(f"Empty text at line {line}")
            if language not in LANGUAGE_CODES:
                raise ValueError(f"Unsupported language {language!r} at line {line}")
            if category not in CATEGORIES:
                raise ValueError(f"Unsupported category {category!r} at line {line}")
            if language == "en" and category == "romanized":
                raise ValueError(f"English romanization is not applicable (line {line})")
            if not origin or not (row["source"] or "").strip():
                raise ValueError(f"Origin and source are required at line {line}")
            if origin not in {"licensed_source", "dataset_generated", "synthetic"}:
                raise ValueError(f"Unsupported origin {origin!r} at line {line}")
            counts[(language, category, origin)] += 1
            rows += 1

    cells = {}
    for language in sorted(LANGUAGE_CODES):
        categories = ("native_script", "code_mixed") if language == "en" else tuple(sorted(CATEGORIES))
        for category in categories:
            licensed = counts[(language, category, "licensed_source")]
            dataset_generated = counts[(language, category, "dataset_generated")]
            synthetic = counts[(language, category, "synthetic")]
            cells[f"{language}:{category}"] = {
                "licensed_source": licensed,
                "dataset_generated": dataset_generated,
                "source_total": licensed + dataset_generated,
                "synthetic": synthetic,
                "source_shortfall": max(0, target_per_cell - licensed - dataset_generated),
            }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "file": str(path),
        "file_size_bytes": path.stat().st_size,
        "rows": rows,
        "licensed_source_rows": sum(v for (_, _, origin), v in counts.items() if origin == "licensed_source"),
        "dataset_generated_rows": sum(v for (_, _, origin), v in counts.items() if origin == "dataset_generated"),
        "synthetic_rows": sum(v for (_, _, origin), v in counts.items() if origin == "synthetic"),
        "source_rows": sum(v for (_, _, origin), v in counts.items() if origin != "synthetic"),
        "target_per_applicable_cell": target_per_cell,
        "cells": cells,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", help="Normalized CSV/TSV with text/language/category/origin/source columns")
    parser.add_argument("--target-per-cell", type=int, default=500)
    parser.add_argument("--output", default="artifacts/dataset-manifest.json")
    args = parser.parse_args()
    report = create_manifest(args.data, args.target_per_cell)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
