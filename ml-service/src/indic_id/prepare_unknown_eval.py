"""Create an out-of-scope language evaluation slice from Bhasha-Abhijnaanam.

This is evaluation-only data. It is deliberately not in the primary training
TSV and covers Dakshina Romanized languages outside the four supported labels.
"""

import argparse
import csv
import hashlib
import json
import re
import unicodedata
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


UNKNOWN_LANGUAGES = {
    "Bangla": "bn",
    "Gujarati": "gu",
    "Kannada": "kn",
    "Malayalam": "ml",
    "Marathi": "mr",
    "Punjabi": "pa",
    "Sindhi": "sd",
    "Telugu": "te",
}
LATIN = re.compile(r"[A-Za-z]")


def prepare(
    archive: Path,
    output: Path,
    per_language: int = 100,
    seed: int = 2026,
    manifest_output: Path | None = None,
):
    with zipfile.ZipFile(archive) as zipped:
        member = next((name for name in zipped.namelist() if name.endswith(".json")), None)
        if member is None:
            raise ValueError("Bhasha-Abhijnaanam archive has no JSON member")
        records = json.loads(zipped.read(member))["data"]

    buckets = {code: {} for code in UNKNOWN_LANGUAGES.values()}
    for row in records:
        code = UNKNOWN_LANGUAGES.get(row.get("language"))
        if not code or row.get("source") != "Dakshina":
            continue
        text = unicodedata.normalize("NFC", " ".join((row.get("romanized sentence") or "").split()))
        if not text or not LATIN.search(text) or "\ufffd" in text or "\x00" in text:
            continue
        key = " ".join(text.casefold().split())
        unique_id = str(row.get("unique_identifier") or key)
        buckets[code].setdefault(key, (text, code, "Bhasha-Abhijnaanam/Dakshina CC BY-SA 4.0", unique_id))

    selected = []
    eligible = {}
    for code, candidates in buckets.items():
        eligible[code] = len(candidates)
        ordered = sorted(
            candidates.values(),
            key=lambda item: hashlib.sha256(f"{seed}:{item[3]}".encode("utf-8")).digest(),
        )
        if len(ordered) < per_language:
            raise ValueError(f"Only {len(ordered)} unique {code} rows; need {per_language}")
        selected.extend(ordered[:per_language])

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(("text", "unknown_language", "source", "source_record_id"))
        writer.writerows(selected)
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "Bhasha-Abhijnaanam Romanized Dakshina out-of-scope evaluation slice",
        "source_url": "https://huggingface.co/datasets/ai4bharat/Bhasha-Abhijnaanam",
        "license": "CC BY-SA 4.0; source text from Google Dakshina",
        "archive_member": member,
        "archive_size_bytes": archive.stat().st_size,
        "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "source_record_count": len(records),
        "eligible_unique_rows_by_language": eligible,
        "selected_rows_by_language": dict(Counter(row[1] for row in selected)),
        "selected_rows": len(selected),
        "seed": seed,
        "output_file": str(output),
        "output_size_bytes": output.stat().st_size,
        "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "notes": [
            "Evaluation-only; excluded from training, validation, and known-language test data.",
            "These rows come from the same Bhasha-Abhijnaanam archive family as some in-scope training rows, so this tests unseen language labels but is not an independent-source or domain-shift benchmark.",
            "Romanized text is used to avoid trivially rejecting all examples by Unicode script. Results are limited to these eight Dakshina languages and this dataset domain.",
        ],
    }
    serialized_manifest = json.dumps(manifest, ensure_ascii=False, indent=2)
    output.with_suffix(output.suffix + ".manifest.json").write_text(serialized_manifest, encoding="utf-8")
    if manifest_output:
        manifest_output.parent.mkdir(parents=True, exist_ok=True)
        manifest_output.write_text(serialized_manifest, encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=Path("data/raw/bhasha-abhijnaanam.zip"))
    parser.add_argument("--output", type=Path, default=Path("data/processed/unknown-eval.tsv"))
    parser.add_argument("--per-language", type=int, default=100)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--manifest-output", type=Path, default=Path("artifacts/unknown-language-dataset-manifest.json"))
    args = parser.parse_args()
    print(json.dumps(prepare(args.archive, args.output, args.per_language, args.seed, args.manifest_output), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
