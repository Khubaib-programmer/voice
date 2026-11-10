"""Configurable CSV/TSV ingestion for documented text datasets."""

import csv
import hashlib
import unicodedata
from pathlib import Path

from indic_id.languages import LANGUAGE_CODES

ALLOWED_ORIGINS = {"licensed_source", "public_domain_source", "dataset_generated", "synthetic"}
ALLOWED_CATEGORIES = {"native_script", "romanized", "code_mixed"}


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
            text = unicodedata.normalize("NFC", " ".join((row.get(text_column) or "").split()))
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


def load_training_records(path: str | Path, include_dataset_generated: bool = False) -> list[dict[str, str]]:
    """Load verified training rows, NFC-normalize text, and derive leakage groups.

    Source-generated IndicCMix rows and marked synthetic augmentation are
    excluded from the primary real-text experiment.
    """
    path = Path(path)
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    required = {"text", "language", "category", "origin", "source", "group_id"}
    records = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"Expected columns {sorted(required)!r}; found {reader.fieldnames}")
        for line_number, row in enumerate(reader, 2):
            text = unicodedata.normalize("NFC", " ".join((row["text"] or "").split()))
            language = (row["language"] or "").strip().lower()
            category = (row["category"] or "").strip().lower()
            origin = (row["origin"] or "").strip().lower()
            group_id = (row["group_id"] or "").strip()
            if not text or "\ufffd" in text or "\x00" in text:
                raise ValueError(f"Empty or invalid Unicode text at line {line_number}")
            if language not in LANGUAGE_CODES:
                raise ValueError(f"Unsupported language {language!r} at line {line_number}")
            if category not in ALLOWED_CATEGORIES:
                raise ValueError(f"Unsupported category {category!r} at line {line_number}")
            if language == "en" and category == "romanized":
                raise ValueError(f"English romanization is not applicable (line {line_number})")
            if origin not in ALLOWED_ORIGINS or not (row["source"] or "").strip() or not group_id:
                raise ValueError(f"Missing/invalid source provenance or group ID at line {line_number}")
            if origin == "synthetic" or (origin == "dataset_generated" and not include_dataset_generated):
                continue
            records.append({
                "text": text,
                "language": language,
                "category": category,
                "origin": origin,
                "source": row["source"].strip(),
                "group_id": group_id,
            })
    if not records:
        raise ValueError("No eligible non-synthetic training rows found")

    # Union source-paired variants and exact-text duplicates across source IDs.
    parent: dict[str, str] = {}

    def find(item: str) -> str:
        parent.setdefault(item, item)
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    def union(left: str, right: str) -> None:
        a, b = find(left), find(right)
        if a != b:
            parent[max(a, b)] = min(a, b)

    for record in records:
        text_key = " ".join(record["text"].casefold().split())
        text_group = "text:" + hashlib.sha256(text_key.encode("utf-8")).hexdigest()
        source_group = "source:" + record["group_id"]
        union(source_group, text_group)
    for record in records:
        source_group = "source:" + record["group_id"]
        record["split_group"] = find(source_group)
    return records
