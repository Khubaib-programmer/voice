import pytest

from indic_id.data import load_examples


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
