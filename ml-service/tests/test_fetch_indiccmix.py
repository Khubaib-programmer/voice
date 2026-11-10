import sys
import types

import pytest

from indic_id.fetch_indiccmix import FILES, fetch


def test_fetch_requires_token_after_user_acceptance(tmp_path, monkeypatch):
    monkeypatch.delenv("HF_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="Set HF_TOKEN"):
        fetch(tmp_path, "pinned-revision")


def test_fetch_requests_only_odia_and_tamil_and_records_bytes(tmp_path, monkeypatch):
    calls = []

    def fake_download(**kwargs):
        calls.append(kwargs)
        path = tmp_path / kwargs["filename"]
        path.write_bytes(b"parquet-test-bytes")
        return str(path)

    monkeypatch.setitem(sys.modules, "huggingface_hub", types.SimpleNamespace(hf_hub_download=fake_download))
    manifest = fetch(tmp_path, "abc123", token="test-token")
    assert [call["filename"] for call in calls] == list(FILES) == ["or.parquet", "ta.parquet"]
    assert all(call["repo_id"] == "ai4bharat/IndicCMix" for call in calls)
    assert all(call["revision"] == "abc123" for call in calls)
    assert manifest["audio_downloaded"] is False
    assert all(file["size_bytes"] == len(b"parquet-test-bytes") for file in manifest["files"].values())
