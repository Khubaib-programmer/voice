"""Select real mixed-script Tamil-English comments from OffensEval Dravidian."""

import argparse
import csv
import hashlib
import json
import random
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

TAMIL = re.compile(r"[\u0b80-\u0bff]")
LATIN = re.compile(r"[A-Za-z]")
SOURCE = "community-datasets/offenseval_dravidian Tamil train split, CC BY 4.0"


def _normalized(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).split())


def sample_tamil_mixed(parquet_path: Path, limit: int = 500, seed: int = 2026):
    import pyarrow.parquet as pq

    table = pq.read_table(parquet_path, columns=["text", "label"])
    rows = table.to_pylist()
    label_counts = Counter(str(row.get("label")) for row in rows)
    candidates = {}
    invalid = 0
    non_tamil_label = 0
    for row in rows:
        text, label = row.get("text"), row.get("label")
        if not isinstance(text, str) or not text.strip() or "\ufffd" in text:
            invalid += 1
            continue
        # Label 5 explicitly means not-Tamil in this dataset.
        if label == 5:
            non_tamil_label += 1
            continue
        text = _normalized(text)
        # Requiring both Tamil-script and Latin letters excludes English-only
        # comments and conservatively selects verifiable intra-sentence mixes.
        if not TAMIL.search(text) or not LATIN.search(text):
            continue
        key = _normalized(text.casefold())
        group_id = hashlib.sha256(key.encode("utf-8")).hexdigest()
        candidates.setdefault(key, (text, "ta", "code_mixed", "licensed_source", SOURCE, group_id))

    ordered = list(candidates.values())
    random.Random(seed).shuffle(ordered)
    selected = ordered[:limit]
    return selected, {
        "input_rows": len(rows),
        "source_label_distribution": dict(sorted(label_counts.items())),
        "invalid_or_empty_rows": invalid,
        "excluded_not_tamil_label_rows": non_tamil_label,
        "eligible_unique_mixed_script_rows": len(ordered),
        "selected_rows": len(selected),
        "requested_rows": limit,
    }


def prepare(source: Path, output: Path, limit: int = 500, seed: int = 2026):
    raw_size = source.stat().st_size
    rows, counts = sample_tamil_mixed(source, limit, seed)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(("text", "language", "category", "origin", "source", "group_id"))
        writer.writerows(rows)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "OffensEval Dravidian Tamil code-mixed training split",
        "source_url": "https://huggingface.co/datasets/community-datasets/offenseval_dravidian",
        "source_revision": "main; exact source parquet sha256 recorded below",
        "source_parquet_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "license": "CC BY 4.0 (dataset card); attribution required",
        "source_data_note": "Dataset card identifies YouTube comments and marks collection details as unavailable. Only Tamil-labeled mixed-script rows containing both Tamil Unicode characters and Latin letters are selected; no English-only rows qualify.",
        "input_file": str(source),
        "input_size_bytes": raw_size,
        "seed": seed,
        **counts,
        "output_file": str(output),
        "output_size_bytes": output.stat().st_size,
        "synthetic_rows": 0,
    }
    output.with_suffix(output.suffix + ".source-manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("data/raw/tamil-code-mixed-train.parquet"))
    parser.add_argument("--output", type=Path, default=Path("data/processed/tamil-code-mixed.tsv"))
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    report = prepare(args.source, args.output, args.limit, args.seed)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
