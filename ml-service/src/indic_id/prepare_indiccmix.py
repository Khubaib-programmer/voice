"""Create a capped text-only sample from local IndicCMix parquet files.

This script never reads the parquet audio column and never downloads files.
Users must obtain the two required parquet files through the dataset's
official access flow before running it.
"""

import argparse
import csv
import hashlib
import json
import random
import re
from datetime import datetime, timezone
from pathlib import Path

TEXT_FIELDS = ("english", "full_native_script", "romanized_casual", "native_script_codemixed")


def _group_id(english: str) -> str:
    normalized = re.sub(r"\s+", " ", english.casefold()).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _rows(parquet_path: Path):
    import pyarrow.parquet as pq

    parquet = pq.ParquetFile(parquet_path)
    missing = set(TEXT_FIELDS) - set(parquet.schema.names)
    if missing:
        raise ValueError(f"{parquet_path} is missing columns: {', '.join(sorted(missing))}")
    # Explicit projection keeps even audio path/metadata bytes out of memory.
    table = parquet.read(columns=list(TEXT_FIELDS))
    return table.to_pylist()


def _sample(candidates, language: str, category: str, limit: int, seed: int):
    unique = {}
    for text, group_id, source in candidates:
        text = (text or "").strip()
        if text:
            unique.setdefault(text, (text, language, category, "dataset_generated", source, group_id))
    values = list(unique.values())
    random.Random(seed).shuffle(values)
    if len(values) < limit:
        raise ValueError(f"{language}/{category} has only {len(values)} unique samples; {limit} required")
    return values[:limit]


def prepare(files: dict[str, Path], output: Path, limit: int = 500, seed: int = 2026, revision: str = "unknown"):
    selected = []
    source_stats = {}
    for language, path in files.items():
        path = Path(path)
        source_stats[language] = {"path": str(path.resolve()), "size_bytes": path.stat().st_size}
        rows = _rows(path)
        source_name = f"ai4bharat/IndicCMix@{revision}:{language}"
        category_fields = {"code_mixed": "native_script_codemixed"}
        for category, field in category_fields.items():
            candidates = []
            for row in rows:
                english = row["english"] or ""
                candidates.append((row[field], _group_id(english), source_name))
            selected_rows = _sample(candidates, language, category, limit, seed)
            selected.extend(selected_rows)

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(("text", "language", "category", "origin", "source", "group_id"))
        writer.writerows(selected)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "AI4Bharat IndicCMix",
        "dataset_revision": revision,
        "license": "MIT (dataset card)",
        "selection_seed": seed,
        "requested_per_cell": limit,
        "selected_rows": len(selected),
        "output_path": str(output.resolve()),
        "output_size_bytes": output.stat().st_size,
        "input_files": source_stats,
        "input_total_bytes": sum(item["size_bytes"] for item in source_stats.values()),
        "audio_column_read": False,
        "note": "Source card describes these Indic code-mixed texts as translations of English. Rows are labeled dataset_generated and are not represented as naturally authored conversation.",
    }
    report_path = output.with_suffix(output.suffix + ".source-manifest.json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--odia", required=True, type=Path)
    parser.add_argument("--tamil", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/processed/indiccmix-sample.tsv"))
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--revision", default="unknown", help="Pin to dataset commit hash for reproducibility")
    args = parser.parse_args()
    files = {"or": args.odia, "ta": args.tamil}
    print(json.dumps(prepare(files, args.output, args.limit, args.seed, args.revision), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
