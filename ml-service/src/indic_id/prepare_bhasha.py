"""Sample paired native/romanized examples from Bhasha-Abhijnaanam."""

import argparse
import csv
from collections import Counter
import hashlib
import json
import random
import unicodedata
import zipfile
from datetime import datetime, timezone
from pathlib import Path

SOURCES = {
    "hi": ("Hindi", "Dakshina", "Google Dakshina 1.0 CC BY-SA 4.0"),
    "ta": ("Tamil", "Dakshina", "Google Dakshina 1.0 CC BY-SA 4.0"),
    "or": ("Oriya", "Manually-Collected", "AI4Bharat manually collected data CC0-1.0"),
}
DATASET_REVISION = "c54a95d9b9d62c891a03bd5da60715df7176b097"


def prepare(archive: Path, output: Path, limit: int = 500, seed: int = 2026):
    with zipfile.ZipFile(archive) as zipped:
        json_name = next((name for name in zipped.namelist() if name.endswith(".json")), None)
        if not json_name:
            raise ValueError("Archive contains no JSON data file")
        data = json.load(zipped.open(json_name))["data"]

    raw_source_counts = Counter((row.get("language", ""), row.get("source", "")) for row in data)

    selected = []
    available = {}
    for language, (dataset_language, allowed_source, license_text) in SOURCES.items():
        candidates = []
        for row in data:
            if row.get("language") != dataset_language or row.get("source") != allowed_source:
                continue
            native = unicodedata.normalize("NFC", (row.get("native sentence") or "").strip())
            romanized = unicodedata.normalize("NFC", (row.get("romanized sentence") or "").strip())
            if native and romanized:
                candidates.append((row["unique_identifier"], native, romanized))
        available[language] = len(candidates)
        # Keep the native/romanized pair intact and remove text duplicates
        # before quota sampling so the final corpus does not contain repeats.
        unique_candidates = []
        seen_native, seen_romanized = set(), set()
        for item in candidates:
            native_key = " ".join(item[1].casefold().split())
            romanized_key = " ".join(item[2].casefold().split())
            if native_key in seen_native or romanized_key in seen_romanized:
                continue
            seen_native.add(native_key)
            seen_romanized.add(romanized_key)
            unique_candidates.append(item)
        available[language] = len(unique_candidates)
        unique_candidates.sort(key=lambda item: item[0])
        random.Random(seed).shuffle(unique_candidates)
        if len(unique_candidates) < limit:
            raise ValueError(f"{language} has only {len(unique_candidates)} unique eligible paired rows; {limit} required")
        for group_id, native, romanized in unique_candidates[:limit]:
            source = f"AI4Bharat/Bhasha-Abhijnaanam -> {license_text}"
            selected.append((native, language, "native_script", "licensed_source", source, group_id))
            selected.append((romanized, language, "romanized", "licensed_source", source, group_id))

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(("text", "language", "category", "origin", "source", "group_id"))
        writer.writerows(selected)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "AI4Bharat Bhasha-Abhijnaanam",
        "source_url": "https://huggingface.co/datasets/ai4bharat/Bhasha-Abhijnaanam",
        "dataset_revision": DATASET_REVISION,
        "archive_member": json_name,
        "archive_member_size_bytes": next(info.file_size for info in zipfile.ZipFile(archive).infolist() if info.filename == json_name),
        "archive_record_count": len(data),
        "archive_language_source_distribution": {
            f"{language}:{source}": count
            for (language, source), count in sorted(raw_source_counts.items())
            if language in {"Hindi", "Tamil", "Oriya"}
        },
        "requested_per_cell": limit,
        "seed": seed,
        "eligible_paired_source_rows": available,
        "selected_rows": len(selected),
        "selected_counts": {f"{language}:{category}": limit for language in SOURCES for category in ("native_script", "romanized")},
        "input_archive": str(archive.resolve()),
        "input_archive_size_bytes": archive.stat().st_size,
        "input_archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "output_file": str(output.resolve()),
        "output_size_bytes": output.stat().st_size,
        "notes": [
            "Bhasha-Abhijnaanam is an existing language-identification test set; these selected examples are used as project training/evaluation data, so results are not an independent evaluation on that benchmark.",
            "Hindi/Tamil rows originate from Dakshina and retain CC BY-SA attribution; Odia rows are manually collected under CC0-1.0.",
        ],
    }
    manifest = output.with_suffix(output.suffix + ".source-manifest.json")
    manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=Path("data/raw/bhasha-abhijnaanam.zip"))
    parser.add_argument("--output", type=Path, default=Path("data/processed/native-romanized.tsv"))
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    print(json.dumps(prepare(args.archive, args.output, args.limit, args.seed), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
