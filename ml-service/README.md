# ML service

FastAPI service and reproducible experiments for custom character n-gram Indic language identification. It compares Logistic Regression and LinearSVC and reports accuracy, macro/per-language F1, confusion matrices, and measured per-example inference latency.

## Environment

Python 3.11 or newer is specified. This workspace has Python 3.12 and 3.15; use Python 3.12 for parquet data preparation because PyArrow is not currently available as a wheel for this Python 3.15 build. The core ML/API dependencies also work in the existing Python 3.15 `.venv`.

## Train

Prepare a normalized TSV with `text`, `language`, `category`, `origin`, `source`, and `group_id` columns. Only lowercase labels `hi`, `en`, `ta`, and `or` are accepted. Track source provenance and keep synthetic augmentation separate. Generate `artifacts/dataset-manifest.json` and verify every applicable source quota before fitting:

```sh
python -m pip install -r requirements.txt
PYTHONPATH=src python -m indic_id.manifest /path/to/text-only-examples.tsv
PYTHONPATH=src python -m indic_id.train --data /path/to/text-only-examples.tsv --text-column text --label-column language --group-column group_id --manifest artifacts/dataset-manifest.json --output-dir artifacts
```

The training command writes both candidate model artifacts and `evaluation.json`. It refuses to fit until all four language labels and 500 source rows per applicable cell are present. English romanization is marked not applicable; English uses Latin script natively. Keep downloaded data and generated model files outside Git.

## Text-only dataset preparation

`python -m indic_id.prepare_bhasha` reads the downloaded text archive, filters Hindi/Tamil Dakshina and manually collected Odia rows, and writes 500 unique paired native/romanized examples per Indic language. This has been run: 3,000 rows, 10,706,705 input bytes, and 847,069 output bytes. It does not represent Bhasha-Abhijnaanam as an independent benchmark test after reusing its samples for project training. Merge prepared files with `python -m indic_id.merge_data data/processed/all.tsv <prepared-files...>` before generating the final manifest. The current merged corpus has 4,500 unique rows and is short only the 500 Tamil and 500 Odia code-mixed targets.

For IndicCMix, accept the dataset conditions in your Hugging Face account first, then set `HF_TOKEN` in your shell environment. Fetch only the two needed text parquet files using a pinned dataset commit:

```sh
PYTHONPATH=src python -m indic_id.fetch_indiccmix --revision <dataset-commit>
PYTHONPATH=src python -m indic_id.prepare_indiccmix --odia data/raw/IndicCMix/or.parquet --tamil data/raw/IndicCMix/ta.parquet --revision <dataset-commit>
```

The fetcher requests only `or.parquet` and `ta.parquet`; it never requests the `audio/` directory. It records exact local sizes in `data/raw/IndicCMix/fetch-manifest.json`. Tokens are read from the environment and are never written to files or printed.

`python -m indic_id.prepare_indiccmix --odia data/raw/IndicCMix/or.parquet --tamil data/raw/IndicCMix/ta.parquet --revision <commit>` reads only projected text columns. It selects 500 dataset-provided code-mixed examples each for Tamil and Odia. The Hindi-dominant and English-dominant Hindi-English code-mixed cells come from `prepare_code_mixed.py` using the COMI-LINGUA LID training CSV. `prepare_english.py` accepts a locally downloaded Project Gutenberg 1661 text file and samples 500 actual English sentences. The preparation scripts record actual source and output file sizes, distinguish dataset-generated text, and do not download data themselves. Run `python -m indic_id.manifest <prepared.tsv>` to report observed rows and applicable-cell gaps.

Keep variant examples grouped by source ID and pass `--group-column group_id` when training so variants stay on one side of the holdout split. Use the provenance and license fields in the normalized TSV when combining outputs; do not remove attribution.

## Serve

Set `MODEL_PATH` to the chosen trained artifact, then run `uvicorn indic_id.api:app --app-dir src --host 127.0.0.1 --port 8000`. `POST /predict` returns language, confidence evidence, latency, and script evidence. Until a model artifact exists, predictions return HTTP 503; the service never invents a default classification.

LinearSVC does not produce calibrated probabilities. Its current normalized decision-score estimate is explicitly labeled and must not be interpreted as a probability. Rejection thresholds are configurable and provisional until a validation set is used to tune them.
