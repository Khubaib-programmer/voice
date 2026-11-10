"""Sample licensed Hindi-English and Tamil-English code-mixed text sources."""

import argparse
import ast
import csv
import hashlib
import json
import unicodedata
from pathlib import Path
from datetime import datetime, timezone


def _group(text: str) -> str:
    return hashlib.sha256(" ".join(text.casefold().split()).encode("utf-8")).hexdigest()


def _majority_mixed(annotations: list[list[dict]]) -> str | None:
    totals = {"hi": 0, "en": 0}
    annotators_with_both = 0
    for annotation in annotations:
        per_annotator = {"hi": 0, "en": 0}
        for token in annotation or []:
            candidates = token if isinstance(token, list) else [token]
            for item in candidates:
                if isinstance(item, dict) and item.get("value") in per_annotator:
                    per_annotator[item["value"]] += 1
        if per_annotator["hi"] and per_annotator["en"]:
            annotators_with_both += 1
            for label in totals:
                totals[label] += per_annotator[label]
    if annotators_with_both < 2 or totals["hi"] == totals["en"]:
        return None
    return max(totals, key=totals.get)


def _decode_annotation(value):
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        decoded = json.loads(value)
        return decoded if isinstance(decoded, list) else []
    except (TypeError, json.JSONDecodeError):
        try:
            decoded = ast.literal_eval(value)
            return decoded if isinstance(decoded, list) else []
        except (ValueError, SyntaxError):
            return []


def sample_comi_lingua(path: Path, limit: int = 500, seed: int = 2026, return_stats: bool = False):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        names = reader.fieldnames or []
        sentence_column = next((name for name in names if name.casefold() in {"sentences", "sentence", "text"}), None)
        annotation_columns = [name for name in names if "annotator" in name.casefold()]
        if not sentence_column or len(annotation_columns) < 2:
            raise ValueError("COMI-LINGUA CSV must contain a sentence field and at least two annotator fields")
        rows = list(reader)
    source_row_count = len(rows)
    buckets = {"hi": {}, "en": {}}
    for row in rows:
        text = unicodedata.normalize("NFC", (row.get(sentence_column) or "").strip())
        if not text:
            continue
        annotations = [_decode_annotation(row.get(column)) for column in annotation_columns]
        language = _majority_mixed(annotations)
        if language:
            buckets[language].setdefault(text, (text, language, "code_mixed", "licensed_source", "COMI-LINGUA CC BY-SA 4.0", _group(text)))
    samples = []
    eligible_counts = {language: len(candidates) for language, candidates in buckets.items()}
    for language, candidates in buckets.items():
        rows = list(candidates.values())
        rows.sort(key=lambda row: hashlib.sha256(f"{seed}:{row[5]}".encode("utf-8")).digest())
        if len(rows) < limit:
            raise ValueError(f"COMI-LINGUA has only {len(rows)} eligible {language}-dominant mixed rows; {limit} required")
        samples.extend(rows[:limit])
    if return_stats:
        return samples, {"source_row_count": source_row_count, "eligible_unique_mixed_rows": eligible_counts}
    return samples


def write_samples(rows, output: Path):
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(("text", "language", "category", "origin", "source", "group_id"))
        writer.writerows(rows)
    return output.stat().st_size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--comi-csv", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/processed/code-mixed.tsv"))
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    rows, counts = sample_comi_lingua(args.comi_csv, args.limit, args.seed, return_stats=True)
    size = write_samples(rows, args.output)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "COMI-LINGUA LID training split",
        "source_url": "https://github.com/lingo-iitgn/COMI-LINGUA",
        "license": "CC BY-SA 4.0 (repository license; follow stricter repository term)",
        "input_file": str(args.comi_csv.resolve()),
        "input_file_size_bytes": args.comi_csv.stat().st_size,
        "input_file_sha256": hashlib.sha256(args.comi_csv.read_bytes()).hexdigest(),
        "source_row_count": counts["source_row_count"],
        "eligible_unique_mixed_rows": counts["eligible_unique_mixed_rows"],
        "seed": args.seed,
        "requested_per_cell": args.limit,
        "output": str(args.output.resolve()), "size_bytes": size, "rows": len(rows),
        "counts": {language: sum(row[1] == language for row in rows) for language in ("hi", "en")},
        "origin": "licensed_source", "synthetic_rows": 0,
    }
    args.output.with_suffix(args.output.suffix + ".source-manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
