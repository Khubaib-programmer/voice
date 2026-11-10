"""Merge prepared TSVs with schema validation and duplicate removal."""

import argparse
import csv
from pathlib import Path

FIELDS = ("text", "language", "category", "origin", "source", "group_id")


def merge(inputs: list[Path], output: Path) -> dict[str, int]:
    seen = set()
    output.parent.mkdir(parents=True, exist_ok=True)
    count = duplicates = 0
    with output.open("w", encoding="utf-8", newline="") as out_handle:
        writer = csv.DictWriter(out_handle, fieldnames=FIELDS, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        for path in inputs:
            with path.open("r", encoding="utf-8-sig", newline="") as in_handle:
                reader = csv.DictReader(in_handle, delimiter="\t")
                if tuple(reader.fieldnames or ()) != FIELDS:
                    raise ValueError(f"{path} must have columns {FIELDS}")
                for row in reader:
                    key = (row["language"], row["category"], " ".join(row["text"].casefold().split()))
                    if key in seen:
                        duplicates += 1
                        continue
                    seen.add(key)
                    writer.writerow(row)
                    count += 1
    return {"rows": count, "duplicates_removed": duplicates, "output_size_bytes": output.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("inputs", nargs="+", type=Path)
    args = parser.parse_args()
    print(merge(args.inputs, args.output))


if __name__ == "__main__":
    main()
