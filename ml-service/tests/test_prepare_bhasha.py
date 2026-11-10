import json
import zipfile

from indic_id.prepare_bhasha import prepare


def test_prepare_selects_only_target_languages_and_paired_examples(tmp_path):
    archive = tmp_path / "fixture.zip"
    data = []
    fixtures = [
        ("Hindi", "Dakshina"),
        ("Tamil", "Dakshina"),
        ("Oriya", "Manually-Collected"),
    ]
    for language, source in fixtures:
        for index in range(3):
            data.append({
                "unique_identifier": f"{language}-{index}",
                "native sentence": f"{language} native {index}",
                "romanized sentence": f"{language} latin {index}",
                "language": language,
                "source": source,
            })
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr("bhasha-abhijnaanam.json", json.dumps({"data": data}))
    output = tmp_path / "prepared.tsv"
    report = prepare(archive, output, limit=2, seed=10)
    assert report["selected_rows"] == 12
    assert report["input_archive_size_bytes"] == archive.stat().st_size
    rows = output.read_text(encoding="utf-8").splitlines()
    assert len(rows) == 13
    assert "CC BY-SA 4.0" in rows[1]
    assert "CC0-1.0" in rows[-1]
