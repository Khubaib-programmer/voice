# ML experiments

## Experiment 1: four-language text LID

Run: 2026-11-10, Python 3.12.16, scikit-learn 1.9.1, macOS 27.0.1 ARM64. The normalized merged TSV was 1,538,841 bytes and contained 5,000 unique real-source rows. No synthetic or dataset-generated rows entered this experiment. A stratified group split allocated 3,000 train rows / 2,100 groups, 1,000 validation rows / 700 groups, and 1,000 test rows / 700 groups. Group intersection across all partitions was checked and was empty. Model selection used validation macro F1; test metrics did not select the model.

### Overall held-out test results

| Model | Accuracy | Macro F1 | English F1 | Hindi F1 | Odia F1 | Tamil F1 | Mean latency | P95 latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| TF-IDF + Logistic Regression | 0.963 | 0.9610 | 0.9192 | 0.9470 | 0.9826 | 0.9950 | 0.466 ms | 0.645 ms |
| TF-IDF + Linear SVM | **0.969** | **0.9676** | **0.9330** | **0.9548** | **0.9875** | **0.9950** | 0.466 ms | 0.647 ms |

The selected model is Linear SVM, chosen by validation macro F1 (0.9666 vs. 0.9602). The saved model bundle is 17,701,027 bytes and contains the TF-IDF pipeline plus validation-selected rejection thresholds. The saved pipeline is refit on train+validation after evaluation; test metrics above are for candidate models trained on train only. Latency is single-example prediction on this development Mac after 50 warm-up calls; it is not a public deployment benchmark.

### Category results

| Category | Test rows | Logistic Regression accuracy / macro F1 | Linear SVM accuracy / macro F1 |
|---|---:|---:|---:|
| Native-script / English Latin | 400 | 1.000 / 1.000 | 1.000 / 1.000 |
| Romanized (hi/or/ta) | 300 | 0.983 / 0.988 | 0.980 / 0.985 |
| Genuine code-mixed | 300 | 0.893 / 0.899 | 0.917 / 0.920 |

The code-mixed test subset contains English-dominant and Hindi-dominant COMI-LINGUA examples and 100 Tamil-English mixed-script examples. It contains no Odia code-mixed samples because no verified natural Odia-English source was available. The table reports only the languages present in each category; per-language category F1 and confusion matrices are in `ml-service/artifacts/evaluation.json`.

### Confidence and rejection

Rejection thresholds were selected on validation data to maximize coverage while meeting a 0.98 accuracy target on accepted known-language examples, with a 0.25 confidence floor. The selected Linear SVM thresholds are `min_confidence=0.25` and `min_margin=0.3343`; on test it accepted 937/1,000 known-language inputs (93.7% coverage) with 0.987 accuracy on accepted rows. Logistic Regression accepted 947/1,000 (94.7%) with 0.984 accuracy on accepted rows at its own validation-selected thresholds. These are coverage results on known classes; there is no unknown-language test set, so they do not measure unknown false-accept rate. Linear SVM confidence is a normalized decision-score proxy, not a calibrated probability. Thresholds should be retuned on representative ambiguous and out-of-scope inputs before production.

## Reproducibility

The custom classifier uses character TF-IDF n-grams `(2, 5)`, followed by Logistic Regression or LinearSVC. The grouped split seed is 42. The training script writes `best_model.joblib`, `evaluation.json`, and a dataset manifest with source/license counts, bytes and SHA-256 hashes, category/language/origin distributions, and split distributions. Run from `ml-service/`:

```sh
PYTHONPATH=src .venv312/bin/python -m indic_id.train \
  --data data/processed/current.tsv \
  --manifest artifacts/dataset-manifest.json \
  --output-dir artifacts/real-source-run \
  --source-manifest data/processed/native-romanized.tsv.source-manifest.json \
  --source-manifest data/processed/comi-code-mixed.tsv.source-manifest.json \
  --source-manifest data/processed/english-native.tsv.source-manifest.json \
  --source-manifest data/processed/tamil-code-mixed.tsv.source-manifest.json
```

## Limitations

- Odia code-mixed language identification is untrained and unevaluated; its target cell has 0/500 genuine samples.
- The Tamil-English sample requires mixed Tamil-script/Latin-script comments. Latin-only Tanglish was excluded because reliable language distinction from English-only content could not be established from available labels.
- The two code-mixed sources are social-media data; domain and language distribution may not transfer to formal writing, speech transcripts, or all regions/dialects.
- Native-script scores are high partly because script is a strong language cue. They should not be read as translation or speech-recognition performance.
- Bhasha-Abhijnaanam source rows are reused for training/evaluation, so no independent benchmark score is claimed.
- No audio was downloaded or evaluated. No speech, translation, or TTS model was trained in this experiment.
- No synthetic augmentation was used. IndicCMix generated text was also excluded from the primary training set.
