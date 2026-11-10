import csv

from indic_id.prepare_english import prepare


def test_english_sampler_uses_real_source_sentences_and_records_bytes(tmp_path):
    source = tmp_path / "pg1661.txt"
    source.write_text(
        "*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\n"
        + " ".join(f"This is a distinct source sentence number {i}, with enough words to sample." for i in range(8))
        + "\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***",
        encoding="utf-8",
    )
    output = tmp_path / "english.tsv"
    report = prepare(source, output, limit=5, seed=4)
    rows = list(csv.DictReader(output.open(encoding="utf-8"), delimiter="\t"))
    assert len(rows) == 5
    assert all(row["language"] == "en" and row["category"] == "native_script" for row in rows)
    assert report["input_size_bytes"] == source.stat().st_size
    assert report["output_size_bytes"] == output.stat().st_size
    assert report["synthetic_rows"] == 0
