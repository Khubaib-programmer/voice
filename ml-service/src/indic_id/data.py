"""Configurable CSV/TSV ingestion for documented text datasets."""

import csv
from pathlib import Path


def load_examples(
    path: str | Path,
    text_column: str,
    label_column: str,
    group_column: str | None = None,
) -> list[tuple[str, str] | tuple[str, str, str]]:
    path = Path(path)
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        required = {text_column, label_column} | ({group_column} if group_column else set())
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"Expected columns {sorted(required)!r}; found {reader.fieldnames}")
        rows = []
        for line_number, row in enumerate(reader, start=2):
            text = (row.get(text_column) or "").strip()
            label = (row.get(label_column) or "").strip().lower()
            if text and label:
                if group_column:
                    group = (row.get(group_column) or "").strip()
                    if not group:
                        raise ValueError(f"Missing group value at line {line_number}")
                    rows.append((text, label, group))
                else:
                    rows.append((text, label))
        if not rows:
            raise ValueError("No non-empty labeled examples found")
        return rows
