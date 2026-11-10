import csv

import pyarrow as pa
import pyarrow.parquet as pq

from indic_id.prepare_tamil_codemix import prepare, sample_tamil_mixed


def test_only_real_tamil_labeled_mixed_script_comments_selected(tmp_path):
    source = tmp_path / "tamil.parquet"
    pq.write_table(pa.table({
        "text": ["நல்ல படம் super", "English only sentence", "தமிழ் மட்டும்", "நல்ல படம் super"],
        "label": [0, 5, 0, 1],
    }), source)
    rows, counts = sample_tamil_mixed(source, limit=10, seed=1)
    assert len(rows) == 1
    assert rows[0][0] == "நல்ல படம் super"
    assert rows[0][1:4] == ("ta", "code_mixed", "licensed_source")
    assert counts["input_rows"] == 4
    assert counts["excluded_not_tamil_label_rows"] == 1
    assert counts["eligible_unique_mixed_script_rows"] == 1


def test_tamil_sampler_normalizes_nfc_and_records_actual_sizes(tmp_path):
    source = tmp_path / "tamil.parquet"
    pq.write_table(pa.table({
        "text": ["தமிழ் e\u0301 English", "தமிழ் é English"],
        "label": [0, 0],
    }), source)
    output = tmp_path / "selected.tsv"
    report = prepare(source, output, limit=500)
    rows = list(csv.DictReader(output.open(encoding="utf-8"), delimiter="\t"))
    assert len(rows) == 1
    assert report["eligible_unique_mixed_script_rows"] == 1
    assert report["selected_rows"] == 1
    assert report["input_size_bytes"] == source.stat().st_size
    assert report["output_size_bytes"] == output.stat().st_size
    assert report["synthetic_rows"] == 0
