"""Count prepared examples by language/category/origin without changing data."""

import argparse
import csv
import hashlib
import json
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from indic_id.languages import LANGUAGE_CODES

CATEGORIES = {"native_script", "romanized", "code_mixed"}


def create_manifest(path: str | Path, target_per_cell: int = 500) -> dict[str, object]:
    path = Path(path)
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    counts: Counter[tuple[str, str, str]] = Counter()
    source_counts: Counter[str] = Counter()
    language_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    origin_counts: Counter[str] = Counter()
    seen_examples = set()
    group_ids = set()
    duplicate_rows = 0
    rows = 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        required = {"text", "language", "category", "origin", "source"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")
        for line, row in enumerate(reader, 2):
            text = unicodedata.normalize("NFC", " ".join((row["text"] or "").split()))
            language = (row["language"] or "").strip().lower()
            category = (row["category"] or "").strip().lower()
            origin = (row["origin"] or "").strip().lower()
            if not text:
                raise ValueError(f"Empty text at line {line}")
            if "\ufffd" in text or "\x00" in text:
                raise ValueError(f"Invalid Unicode text at line {line}")
            if language not in LANGUAGE_CODES:
                raise ValueError(f"Unsupported language {language!r} at line {line}")
            if category not in CATEGORIES:
                raise ValueError(f"Unsupported category {category!r} at line {line}")
            if language == "en" and category == "romanized":
                raise ValueError(f"English romanization is not applicable (line {line})")
            if not origin or not (row["source"] or "").strip():
                raise ValueError(f"Origin and source are required at line {line}")
            if origin not in {"licensed_source", "public_domain_source", "dataset_generated", "synthetic"}:
                raise ValueError(f"Unsupported origin {origin!r} at line {line}")
            counts[(language, category, origin)] += 1
            source_counts[(row["source"] or "").strip()] += 1
            language_counts[language] += 1
            category_counts[category] += 1
            origin_counts[origin] += 1
            normalized_key = (language, category, " ".join(text.casefold().split()))
            if normalized_key in seen_examples:
                duplicate_rows += 1
            seen_examples.add(normalized_key)
            if row.get("group_id"):
                group_ids.add(row["group_id"].strip())
            rows += 1

    cells = {}
    for language in sorted(LANGUAGE_CODES):
        categories = ("native_script", "code_mixed") if language == "en" else tuple(sorted(CATEGORIES))
        for category in categories:
            licensed = counts[(language, category, "licensed_source")]
            public_domain = counts[(language, category, "public_domain_source")]
            dataset_generated = counts[(language, category, "dataset_generated")]
            synthetic = counts[(language, category, "synthetic")]
            cells[f"{language}:{category}"] = {
                "licensed_source": licensed,
                "public_domain_source": public_domain,
                "dataset_generated": dataset_generated,
                "verified_real_source_total": licensed + public_domain,
                "synthetic": synthetic,
                "verified_real_source_shortfall": max(0, target_per_cell - licensed - public_domain),
            }
    data = path.read_bytes()
    licensed_rows = origin_counts["licensed_source"]
    public_domain_rows = origin_counts["public_domain_source"]
    generated_rows = origin_counts["dataset_generated"]
    synthetic_rows = origin_counts["synthetic"]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "file": str(path),
        "file_size_bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "rows": rows,
        "unique_language_category_text_rows": rows - duplicate_rows,
        "duplicate_rows_within_language_category": duplicate_rows,
        "source_group_count_before_split": len(group_ids),
        "licensed_source_rows": licensed_rows,
        "public_domain_source_rows": public_domain_rows,
        "verified_real_source_rows": licensed_rows + public_domain_rows,
        "dataset_generated_rows": generated_rows,
        "synthetic_rows": synthetic_rows,
        "source_rows": licensed_rows + public_domain_rows,
        "language_distribution": dict(sorted(language_counts.items())),
        "category_distribution": dict(sorted(category_counts.items())),
        "origin_distribution": dict(sorted(origin_counts.items())),
        "source_license_distribution": dict(sorted(source_counts.items())),
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
