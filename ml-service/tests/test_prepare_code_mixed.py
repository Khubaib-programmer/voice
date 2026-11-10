import json

from indic_id.prepare_code_mixed import sample_comi_lingua


def test_comi_sampler_uses_mixed_majority_annotated_sentences(tmp_path):
    def annotation(hi, en):
        return ([{"key": f"h{i}", "value": "hi", "index": i} for i in range(hi)] +
                [{"key": f"e{i}", "value": "en", "index": hi + i} for i in range(en)])

    path = tmp_path / "comi.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        import csv
        writer = csv.DictWriter(handle, fieldnames=[
            "Sentences", "Annotated by: Annotator 1", "Annotated by: Annotator 2", "Annotated by: Annotator 3",
        ])
        writer.writeheader()
        writer.writerow({
            "Sentences": "Hindi first",
            "Annotated by: Annotator 1": json.dumps(annotation(3, 1)),
            "Annotated by: Annotator 2": json.dumps(annotation(3, 1)),
            "Annotated by: Annotator 3": json.dumps(annotation(3, 1)),
        })
        writer.writerow({
            "Sentences": "English first",
            "Annotated by: Annotator 1": json.dumps(annotation(1, 3)),
            "Annotated by: Annotator 2": json.dumps(annotation(1, 3)),
            "Annotated by: Annotator 3": json.dumps(annotation(1, 3)),
        })
        writer.writerow({
            "Sentences": "English only, not a mixed sample",
            "Annotated by: Annotator 1": json.dumps([{"key": "e", "value": "en", "index": 0}]),
            "Annotated by: Annotator 2": json.dumps([{"key": "e", "value": "en", "index": 0}]),
            "Annotated by: Annotator 3": json.dumps([{"key": "e", "value": "en", "index": 0}]),
        })
    rows = sample_comi_lingua(path, limit=1, seed=1)
    assert {(row[0], row[1], row[2]) for row in rows} == {
        ("Hindi first", "hi", "code_mixed"),
        ("English first", "en", "code_mixed"),
    }


def test_comi_sampler_does_not_label_english_only_as_code_mixed(tmp_path):
    import csv

    path = tmp_path / "comi.csv"
    def ann(values):
        return json.dumps([{"key": str(i), "value": value, "index": i} for i, value in enumerate(values)])
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Sentences", "Annotator 1", "Annotator 2"])
        writer.writeheader()
        writer.writerow({"Sentences": "Hindi mixed", "Annotator 1": ann(["hi", "en", "hi"]), "Annotator 2": ann(["hi", "en", "hi"])})
        writer.writerow({"Sentences": "English mixed", "Annotator 1": ann(["en", "hi", "en"]), "Annotator 2": ann(["en", "hi", "en"])})
        writer.writerow({"Sentences": "English only", "Annotator 1": ann(["en", "en"]), "Annotator 2": ann(["en", "en"])})
    rows = sample_comi_lingua(path, limit=1)
    assert all(row[0] != "English only" for row in rows)


def test_comi_source_is_attributed_under_stricter_license(tmp_path):
    import csv

    path = tmp_path / "comi.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Sentences", "Annotator 1", "Annotator 2"])
        writer.writeheader()
        hi_mixed = json.dumps([{"value": "hi"}, {"value": "hi"}, {"value": "en"}])
        en_mixed = json.dumps([{"value": "en"}, {"value": "en"}, {"value": "hi"}])
        writer.writerow({"Sentences": "Hindi sample", "Annotator 1": hi_mixed, "Annotator 2": hi_mixed})
        writer.writerow({"Sentences": "English sample", "Annotator 1": en_mixed, "Annotator 2": en_mixed})
    sample = sample_comi_lingua(path, limit=1)[0]
    assert sample[3] == "licensed_source"
    assert "CC BY-SA 4.0" in sample[4]
