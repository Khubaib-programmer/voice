import csv

import pyarrow as pa
import pyarrow.parquet as pq

from indic_id.prepare_indiccmix import prepare


def test_prepare_reads_text_columns_and_selects_expected_cells(tmp_path):
    files = {}
    for language in ("or", "ta"):
        path = tmp_path / f"{language}.parquet"
        pq.write_table(pa.table({
            "english": [f"English source one {language}", f"English source two {language}"],
            "full_native_script": [f"native one {language}", f"native two {language}"],
            "romanized_casual": [f"roman one {language}", f"roman two {language}"],
            "native_script_codemixed": [f"mixed one {language}", f"mixed two {language}"],
            "audio": ["audio/not-read-1.wav", "audio/not-read-2.wav"],
        }), path)
        files[language] = path
    output = tmp_path / "sample.tsv"
    report = prepare(files, output, limit=1, seed=42, revision="test")
    rows = list(csv.DictReader(output.open(encoding="utf-8"), delimiter="\t"))
    assert report["selected_rows"] == 2
    assert report["audio_column_read"] is False
    assert len(rows) == 2
    assert sum(row["category"] == "code_mixed" for row in rows) == 2
    assert {row["language"] for row in rows} == {"ta", "or"}
