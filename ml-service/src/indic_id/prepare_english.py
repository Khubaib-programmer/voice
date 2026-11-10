"""Prepare a small English native-script sample from a public-domain text file."""

import argparse
import csv
import hashlib
import json
import random
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


def _sentences(text: str):
    # Gutenberg front/back matter is removed when the standard markers exist.
    start = text.find("*** START OF THE PROJECT GUTENBERG EBOOK")
    end = text.find("*** END OF THE PROJECT GUTENBERG EBOOK")
    if start >= 0:
        text = text[text.find("\n", start) + 1 :]
    if end >= 0:
        text = text[:end]
    text = re.sub(r"\s+", " ", text)
    sentences = [unicodedata.normalize("NFC", s).strip() for s in re.split(r"(?<=[.!?])\s+", text)]
    return [s for s in sentences if 35 <= len(s) <= 400]


def prepare(source: Path, output: Path, limit: int = 500, seed: int = 2026):
    raw = source.read_bytes()
    text = raw.decode("utf-8-sig", errors="replace")
    candidates = list(dict.fromkeys(_sentences(text)))
    if len(candidates) < limit:
        raise ValueError(f"English source has only {len(candidates)} eligible sentences; {limit} required")
    random.Random(seed).shuffle(candidates)
    chosen = candidates[:limit]
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(("text", "language", "category", "origin", "source", "group_id"))
        for sentence in chosen:
            group_id = hashlib.sha256(sentence.casefold().encode("utf-8")).hexdigest()
            writer.writerow((sentence, "en", "native_script", "public_domain_source", "Project Gutenberg ebook 1661 (US public domain; India term expired under Copyright Act s.22)", group_id))
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "Project Gutenberg ebook 1661, The Adventures of Sherlock Holmes",
        "source_url": "https://www.gutenberg.org/cache/epub/1661/pg1661.txt",
        "license": "Public domain in the United States; author died 1930 and Indian Copyright Act s.22 provides life plus 60 years for published literary works",
        "input_path": str(source.resolve()),
        "input_size_bytes": len(raw),
        "input_sha256": hashlib.sha256(raw).hexdigest(),
        "eligible_unique_sentences": len(candidates),
        "seed": seed,
        "selected_rows": len(chosen),
        "output_path": str(output.resolve()),
        "output_size_bytes": output.stat().st_size,
        "synthetic_rows": 0,
    }
    output.with_suffix(output.suffix + ".source-manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Locally downloaded UTF-8 Project Gutenberg text")
    parser.add_argument("--output", type=Path, default=Path("data/processed/english-native.tsv"))
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.output, args.limit, args.seed), indent=2))


if __name__ == "__main__":
    main()
