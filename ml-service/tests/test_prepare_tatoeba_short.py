import json
import csv

from indic_id.prepare_tatoeba_short import prepare


def test_tatoeba_preparation_filters_unverified_rows_and_keeps_pairs_grouped(tmp_path):
    snapshot = {
        "source": "Tatoeba API",
        "queried_at_utc": "2026-11-11T00:00:00Z",
        "source_url": "https://api.tatoeba.org/v1/sentences",
        "query_filters": {"word_count": "3-8"},
        "api_totals": {},
        "fetched_by_language": {"en": 2, "hi": 1},
        "rows": [
            {"target_label": "en", "sentence": {
                "id": 100, "text": "I enjoy fresh apples.", "lang": "eng",
                "license": "CC BY 2.0 FR", "owner": "speakerA", "is_unapproved": False,
                "translations": [{"id": 200, "lang": "hin"}],
            }},
            {"target_label": "hi", "sentence": {
                "id": 200, "text": "मुझे मीठे आम चाहिए।", "lang": "hin",
                "license": "CC BY 2.0 FR", "owner": "speakerB", "is_unapproved": False,
                "translations": [{"id": 100, "lang": "eng"}],
            }},
            {"target_label": "en", "sentence": {
                "id": 102, "text": "Good morning!", "lang": "eng",
                "license": "CC0 1.0", "owner": "speakerC", "is_unapproved": False,
                "translations": [],
            }},
            {"target_label": "en", "sentence": {
                "id": 101, "text": "I like the apples.", "lang": "eng",
                "license": "CC BY 2.0 FR", "owner": "speakerA", "is_unapproved": True,
                "translations": [],
            }},
        ],
    }
    source_path = tmp_path / "source.json"
    output_path = tmp_path / "prepared.tsv"
    manifest_path = tmp_path / "manifest.json"
    compact_path = tmp_path / "raw" / "snapshot.json"
    source_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")

    manifest = prepare(source_path, output_path, manifest_path, compact_path)

    rows = output_path.read_text(encoding="utf-8").splitlines()
    assert len(rows) == 4  # header plus the three approved source records
    assert manifest["prepared_rows"] == 3
    assert manifest["prepared_rows_by_language"] == {"en": 2, "hi": 1}
    assert manifest["excluded_counts"]["unapproved_or_missing_status"] == 1
    assert manifest["synthetic_rows"] == 0
    assert manifest["group_count"] == 2
    with output_path.open(encoding="utf-8", newline="") as handle:
        prepared = list(csv.DictReader(handle, delimiter="\t"))
    paired = {row["source_record_id"]: row["group_id"] for row in prepared}
    assert paired["100"] == paired["200"]
    assert compact_path.exists()


def test_tatoeba_preparation_excludes_mixed_script_and_unlicensed_text(tmp_path):
    snapshot = {
        "rows": [
            {"target_label": "en", "sentence": {
                "id": 1, "text": "Hello नमस्ते friend.", "lang": "eng",
                "license": "CC BY 2.0 FR", "owner": "person", "is_unapproved": False,
                "translations": [],
            }},
            {"target_label": "ta", "sentence": {
                "id": 2, "text": "வணக்கம் நண்பா இன்று", "lang": "tam",
                "license": "PROBLEM", "owner": "person", "is_unapproved": False,
                "translations": [],
            }},
        ],
    }
    source_path = tmp_path / "source.json"
    source_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    manifest = prepare(source_path, tmp_path / "prepared.tsv", tmp_path / "manifest.json")
    assert manifest["prepared_rows"] == 0
    assert manifest["excluded_counts"]["script_mismatch_or_mixed_script"] == 1
    assert manifest["excluded_counts"]["unsupported_license"] == 1
