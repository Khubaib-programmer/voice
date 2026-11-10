import pytest

from indic_id.manifest import create_manifest


def test_manifest_records_file_size_and_separates_synthetic(tmp_path):
    path = tmp_path / "dataset.tsv"
    path.write_text(
        "text\tlanguage\tcategory\torigin\tsource\n"
        "नमस्ते\thi\tnative_script\tlicensed_source\tDakshina 1.0\n"
        "hello\ten\tnative_script\tsynthetic\tunit fixture\n",
        encoding="utf-8",
    )
    report = create_manifest(path)
    assert report["rows"] == 2
    assert report["licensed_source_rows"] == 1
    assert report["synthetic_rows"] == 1
    assert report["file_size_bytes"] == path.stat().st_size
    assert report["cells"]["hi:native_script"]["licensed_source"] == 1


def test_manifest_rejects_romanized_english(tmp_path):
    path = tmp_path / "dataset.csv"
    path.write_text("text,language,category,origin,source\nhello,en,romanized,source,unknown\n", encoding="utf-8")
    with pytest.raises(ValueError, match="not applicable"):
        create_manifest(path)
