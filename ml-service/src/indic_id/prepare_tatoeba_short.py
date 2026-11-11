"""Prepare a bounded, attributed short-text snapshot from Tatoeba API JSON."""

import argparse
import csv
import hashlib
import json
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from indic_id.scripts import classify_script

API_TO_APP = {"eng": "en", "hin": "hi", "tam": "ta", "ori": "or"}
EXPECTED_SCRIPT = {"en": "Latin", "hi": "Devanagari", "ta": "Tamil", "or": "Odia"}
ALLOWED_LICENSES = {"CC BY 2.0 FR", "CC0 1.0"}
FIELDS = [
    "text", "language", "category", "origin", "source", "group_id",
    "source_record_id", "license", "owner", "url", "related_ids",
]


def _normalized(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).casefold().split())


def prepare(snapshot_path: Path, output_path: Path, manifest_path: Path, compact_snapshot_path: Path | None = None):
    payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    source_rows = payload.get("rows", [])
    rows = []
    excluded = Counter()
    for item in source_rows:
        sentence = item.get("sentence", {})
        language = item.get("target_label")
        if language not in EXPECTED_SCRIPT:
            excluded["unsupported_language"] += 1
            continue
        text = unicodedata.normalize("NFC", " ".join(str(sentence.get("text") or "").split()))
        if not text or "\ufffd" in text or "\x00" in text:
            excluded["empty_or_invalid_text"] += 1
            continue
        if sentence.get("is_unapproved") is not False:
            excluded["unapproved_or_missing_status"] += 1
            continue
        if sentence.get("license") not in ALLOWED_LICENSES:
            excluded["unsupported_license"] += 1
            continue
        if not sentence.get("owner"):
            excluded["missing_contributor"] += 1
            continue
        token_count = len(text.split())
        if token_count < 1 or token_count > 8:
            excluded["outside_1_to_8_tokens"] += 1
            continue
        evidence = classify_script(text)
        if evidence["script"] != EXPECTED_SCRIPT[language]:
            excluded["script_mismatch_or_mixed_script"] += 1
            continue
        sentence_id = str(sentence.get("id") or "")
        if not sentence_id.isdigit():
            excluded["missing_sentence_id"] += 1
            continue
        related_ids = sorted({
            str(link.get("id"))
            for link in sentence.get("translations", [])
            if str(link.get("id", "")).isdigit()
        })
        rows.append({
            "text": text,
            "language": language,
            "category": "native_script",
            "origin": "public_domain_source" if sentence["license"] == "CC0 1.0" else "licensed_source",
            "source": "Tatoeba",
            "group_id": f"tatoeba:{sentence_id}",
            "source_record_id": sentence_id,
            "license": sentence["license"],
            "owner": sentence["owner"],
            "url": f"https://tatoeba.org/en/sentences/show/{sentence_id}",
            "related_ids": ",".join(related_ids),
        })

    # Group known Tatoeba sentence-pair links and exact normalized duplicates.
    parent = {row["source_record_id"]: row["source_record_id"] for row in rows}

    def find(value):
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(left, right):
        left, right = find(left), find(right)
        if left != right:
            parent[max(left, right)] = min(left, right)

    ids = set(parent)
    for row in rows:
        for related_id in row["related_ids"].split(",") if row["related_ids"] else []:
            if related_id in ids:
                union(row["source_record_id"], related_id)
    by_text = {}
    for row in rows:
        key = _normalized(row["text"])
        if key in by_text:
            union(row["source_record_id"], by_text[key])
        else:
            by_text[key] = row["source_record_id"]

    # Join near-identical Tatoeba lines to prevent close variants crossing splits.
    if len(rows) > 1:
        from sklearn.feature_extraction.text import TfidfVectorizer

        matrix = TfidfVectorizer(analyzer="char", ngram_range=(3, 5), binary=True, norm="l2").fit_transform(
            [row["text"] for row in rows]
        )
        similarities = matrix @ matrix.T
        for left in range(len(rows)):
            start, end = similarities.indptr[left], similarities.indptr[left + 1]
            for right, score in zip(similarities.indices[start:end], similarities.data[start:end]):
                if right > left and score >= 0.90:
                    union(rows[left]["source_record_id"], rows[right]["source_record_id"])

    for row in rows:
        row["group_id"] = f"tatoeba-group:{find(row['source_record_id'])}"
    # Duplicate strings are represented once after their source groups have been joined.
    deduplicated = {}
    for row in rows:
        key = (_normalized(row["text"]), row["language"])
        existing = deduplicated.get(key)
        if existing is None or int(row["source_record_id"]) < int(existing["source_record_id"]):
            deduplicated[key] = row
    rows = list(deduplicated.values())
    rows.sort(key=lambda row: (row["language"], row["source_record_id"]))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    if compact_snapshot_path:
        compact = {
            "source": "Tatoeba API",
            "queried_at_utc": payload.get("queried_at_utc"),
            "source_url": payload.get("source_url", "https://api.tatoeba.org/v1/sentences"),
            "query_filters": payload.get("query_filters", {}),
            "api_totals": payload.get("api_totals", {}),
            "fetched_by_language": dict(Counter(row["target_label"] for row in source_rows)),
            "rows": [
                {
                    "target_label": item["target_label"],
                    "sentence": {
                        key: item["sentence"].get(key)
                        for key in ("id", "text", "lang", "license", "owner", "is_unapproved")
                    },
                    "related_target_sentence_ids": [
                        str(link["id"])
                        for link in item["sentence"].get("translations", [])
                        if str(link.get("id", "")) in ids
                    ],
                }
                for item in source_rows
                if item.get("target_label") in EXPECTED_SCRIPT
            ],
        }
        compact_snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        compact_snapshot_path.write_text(json.dumps(compact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    counts_by_language = Counter(row["language"] for row in rows)
    counts_by_license = Counter(row["license"] for row in rows)
    manifest = {
        "dataset": "Tatoeba short sentence subset",
        "source": "Tatoeba API (https://api.tatoeba.org/v1/sentences)",
        "attribution": "Sentence text is from Tatoeba (https://tatoeba.org); attribute each sentence to its recorded contributor and sentence URL. Text is published under CC BY 2.0 FR or CC0 1.0 as recorded per row.",
        "query_filters": payload.get("query_filters", {}),
        "input_snapshot": snapshot_path.as_posix(),
        "input_snapshot_bytes": snapshot_path.stat().st_size,
        "input_snapshot_sha256": hashlib.sha256(snapshot_path.read_bytes()).hexdigest(),
        "api_totals_at_query": payload.get("api_totals", {}),
        "api_totals_1_to_2_at_query": payload.get("api_totals_1_to_2", {}),
        "fetched_rows_by_language": payload.get("fetched_by_language", {}),
        "fetched_1_to_2_by_language": payload.get("fetched_1_to_2_by_language", {}),
        "prepared_rows": len(rows),
        "prepared_rows_by_language": dict(sorted(counts_by_language.items())),
        "category_distribution": {"native_script": len(rows), "romanized": 0, "code_mixed": 0},
        "license_distribution": dict(sorted(counts_by_license.items())),
        "synthetic_rows": 0,
        "dataset_generated_rows": 0,
        "excluded_counts": dict(sorted(excluded.items())),
        "pair_and_duplicate_grouping": "Tatoeba translation-link IDs plus normalized exact text and binary character 3-5 gram cosine >= 0.90; groups are split together.",
        "group_count": len({row["group_id"] for row in rows}),
        "output": output_path.as_posix(),
        "output_bytes": output_path.stat().st_size,
        "output_sha256": hashlib.sha256(output_path.read_bytes()).hexdigest(),
        "limitations": [
            "Community-contributed sentence labels and text are not individually expert-verified; script mismatches and mixed-script rows are excluded.",
            "The available short Odia pool is small and its evaluation must be reported with its exact count.",
            "This supplemental corpus is evaluated separately and does not replace the original 5,000-row source-aware holdout.",
        ],
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True, help="Saved text-only Tatoeba API snapshot")
    parser.add_argument("--output", type=Path, default=Path("data/processed/tatoeba-short.tsv"))
    parser.add_argument("--manifest", type=Path, default=Path("artifacts/tatoeba-short-manifest.json"))
    parser.add_argument("--compact-snapshot", type=Path, default=None)
    args = parser.parse_args()
    print(json.dumps(prepare(args.snapshot, args.output, args.manifest, args.compact_snapshot), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
