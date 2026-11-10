# ML service

FastAPI service and reproducible experiments for custom character n-gram Indic language identification. It compares Logistic Regression and LinearSVC and reports accuracy, macro/per-language F1, confusion matrices, and measured per-example inference latency.

## Environment

Python 3.11 or newer is specified. This workspace has Python 3.12 and 3.15; use Python 3.12 for parquet data preparation because PyArrow is not currently available as a wheel for this Python 3.15 build. The core ML/API dependencies also work in the existing Python 3.15 `.venv`.

## Train

Prepare a normalized TSV with `text`, `language`, `category`, `origin`, `source`, and `group_id` columns. Only lowercase labels `hi`, `en`, `ta`, and `or` are accepted. Track source provenance and keep synthetic and dataset-generated text separate. The experiment reports any shortfalls rather than filling them with unverified rows:

```sh
python -m pip install -r requirements.txt
PYTHONPATH=src python -m indic_id.train --data data/processed/current.tsv --manifest artifacts/dataset-manifest.json --output-dir artifacts/real-source-run \
  --source-manifest data/processed/native-romanized.tsv.source-manifest.json \
  --source-manifest data/processed/comi-code-mixed.tsv.source-manifest.json \
  --source-manifest data/processed/english-native.tsv.source-manifest.json \
  --source-manifest data/processed/tamil-code-mixed.tsv.source-manifest.json
```

The training command compares both candidates on the same stratified group train/validation/test split, selects by validation macro F1, evaluates category-specific metrics, saves the selected pipeline as `best_model.joblib`, and writes `evaluation.json` plus the source/split manifest. The current experiment has 5,000 real-source rows and a documented 500-row Odia code-mixed shortfall. English romanization is not applicable; English uses Latin script natively. Keep downloaded data and model files outside Git.

## Text-only dataset preparation

`prepare_bhasha.py` writes 500 unique paired native/romanized examples each for Hindi, Odia, and Tamil (3,000 rows; source ZIP 10,706,705 bytes; TSV 847,099 bytes). The Tamil code-mixed sampler selects real mixed-script Tamil-English rows from the CC BY 4.0 Tamil training split, and the COMI-LINGUA sampler selects token-annotated Hindi-English examples. The English native sample uses 500 source sentences from Project Gutenberg ebook 1661. The merged corpus contains 5,000 unique rows; Odia code-mixed remains 0/500.

For IndicCMix, accept the dataset conditions in your Hugging Face account first, then set `HF_TOKEN` in your shell environment. Fetch only the two needed text parquet files using a pinned dataset commit:

```sh
PYTHONPATH=src python -m indic_id.fetch_indiccmix --revision <dataset-commit>
PYTHONPATH=src python -m indic_id.prepare_indiccmix --odia data/raw/IndicCMix/or.parquet --tamil data/raw/IndicCMix/ta.parquet --revision <dataset-commit>
```

The fetcher requests only `or.parquet` and `ta.parquet`; it never requests the `audio/` directory. It records exact local sizes in `data/raw/IndicCMix/fetch-manifest.json`. Tokens are read from the environment and are never written to files or printed.

`prepare_indiccmix.py` can read selected text columns from local Odia/Tamil parquet files, but IndicCMix is gated and its code-mixed translations are dataset-generated. Those rows are not counted as genuine code-mixed samples or used in the primary experiment. No IndicCMix or audio files have been downloaded.

Keep variant examples grouped by source ID and pass `--group-column group_id` when training so variants stay on one side of the holdout split. Use the provenance and license fields in the normalized TSV when combining outputs; do not remove attribution.

## Serve

Set `MODEL_PATH=artifacts/real-source-run/best_model.joblib`, then run `uvicorn indic_id.api:app --app-dir src --host 127.0.0.1 --port 8000`. `POST /predict` returns language, confidence evidence, latency, and script evidence. If the model artifact is unavailable, predictions return HTTP 503; the service never invents a default classification.

LinearSVC does not produce calibrated probabilities. Its normalized decision-score estimate is explicitly labeled and must not be interpreted as a probability. Rejection thresholds are configurable and provisional; the current evaluation has no unknown-language test set.
