"""Fetch only the Odia and Tamil IndicCMix parquet text datasets.

The user must accept the dataset conditions in their own Hugging Face account
and provide a read token through HF_TOKEN. No audio files are requested.
"""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

REPO_ID = "ai4bharat/IndicCMix"
FILES = ("or.parquet", "ta.parquet")


def fetch(output_dir: Path, revision: str, token: str | None = None):
    token = token or os.environ.get("HF_TOKEN")
    if not token:
        raise RuntimeError("Set HF_TOKEN in the process environment after accepting the dataset conditions.")
    try:
        from huggingface_hub import hf_hub_download
    except ImportError as exc:
        raise RuntimeError("Install requirements.txt to fetch the gated dataset.") from exc

    output_dir.mkdir(parents=True, exist_ok=True)
    files = {}
    for filename in FILES:
        path = Path(hf_hub_download(
            repo_id=REPO_ID,
            filename=filename,
            repo_type="dataset",
            revision=revision,
            token=token,
            local_dir=output_dir,
        ))
        files[filename] = {"path": filename, "size_bytes": path.stat().st_size}
    manifest = {
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "dataset": REPO_ID,
        "revision": revision,
        "license": "MIT (dataset card)",
        "files": files,
        "downloaded_files_only": list(FILES),
        "audio_downloaded": False,
    }
    (output_dir / "fetch-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", required=True, help="Pinned Hugging Face dataset commit hash")
    parser.add_argument("--output-dir", type=Path, default=Path("data/raw/IndicCMix"))
    args = parser.parse_args()
    print(json.dumps(fetch(args.output_dir, args.revision), indent=2))


if __name__ == "__main__":
    main()
