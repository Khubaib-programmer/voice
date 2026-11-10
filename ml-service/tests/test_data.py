import pytest

from indic_id.data import load_examples, load_training_records


def test_loads_tsv_and_skips_empty_rows(tmp_path):
    path = tmp_path / "examples.tsv"
    path.write_text("sentence\tlang\nnamaste\thi\n\t\n", encoding="utf-8")
    assert load_examples(path, "sentence", "lang") == [("namaste", "hi")]


def test_missing_column_has_actionable_error(tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text("body,language\nhello,en\n", encoding="utf-8")
    with pytest.raises(ValueError, match="Expected columns"):
        load_examples(path, "text", "language")


def test_loads_source_group_for_leakage_safe_split(tmp_path):
    path = tmp_path / "grouped.tsv"
    path.write_text("text\tlanguage\tgroup_id\nनमस्ते\thi\tarticle-1\n", encoding="utf-8")
    assert load_examples(path, "text", "language", "group_id") == [("नमस्ते", "hi", "article-1")]


def test_training_loader_nfc_normalizes_and_excludes_generated_and_synthetic(tmp_path):
    path = tmp_path / "training.tsv"
    path.write_text(
        "text\tlanguage\tcategory\torigin\tsource\tgroup_id\n"
        "ta é\tta\tromanized\tlicensed_source\tDakshina\tpair-1\n"
        "தமிழ்\tta\tcode_mixed\tdataset_generated\tIndicCMix\tgenerated-1\n"
        "fake\thi\tcode_mixed\tsynthetic\ttest\tsynthetic-1\n",
        encoding="utf-8",
    )
    rows = load_training_records(path)
    assert len(rows) == 1
    assert rows[0]["text"] == "ta é"
    assert rows[0]["origin"] == "licensed_source"
    assert rows[0]["split_group"].startswith("source:")
