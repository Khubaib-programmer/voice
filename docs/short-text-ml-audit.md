# Vaani short-text ML audit

Audit and candidate experiment completed 2026-11-11. The existing production model and its audited evaluation were preserved. The candidate remains a separate local artifact and is **not recommended for promotion**.

## Existing pipeline

- **Classifier:** character-level TF-IDF followed by a balanced `LinearSVC`; the training script also compares balanced Logistic Regression. The deployed artifact is the selected Linear SVM.
- **Vectorizer:** `analyzer="char"`, character n-grams 2–5, `min_df=1`, `sublinear_tf=True`, with scikit-learn's default lowercasing and L2 normalization.
- **Training text normalization:** NFC Unicode normalization and whitespace collapse in `indic_id.data.load_training_records`.
- **Inference normalization:** whitespace trim/collapse plus NFC normalization. NFC was added in this audit so inference uses the normalization already used by training; this preserves Indic characters and does not change model weights.
- **Script gate:** `classify_script` rejects unsupported/unknown scripts before the classifier runs.
- **Short input rule:** fewer than two normalized code points returns `unknown` with `input_too_short`.
- **Confidence:** Linear SVM `decision_function` outputs are softmax-normalized into a comparison score. This is a **normalized decision-score proxy, not a probability**. The margin is the top raw decision score minus the next score.
- **Production rejection:** a prediction is `unknown` when either score is below the global minimum. Current baseline thresholds are `min_confidence=0.4401612939540062`, `min_margin=0.3342549208649863`. There are no language-specific thresholds.
- **Existing test protocol:** 5,000 real-source rows, group-aware 60/20/20 train/validation/test, 3,000 / 1,000 / 1,000 rows and 2,100 / 700 / 700 groups. Source-linked variants and exact duplicates stay in one partition. The final test set was not used to tune thresholds.

The original training data has 1,000 English, 1,500 Hindi, 1,000 Odia, and 1,500 Tamil rows. It has 2,000 native-script, 1,500 Romanized, and 1,500 code-mixed rows; verified Odia code-mixed data remains unavailable. In the original training split, 686 rows have at most eight whitespace tokens: English 22, Hindi 116, Odia 174, Tamil 374. The validation and test splits contain 250 and 257 such rows, respectively. English has only 12 short validation and 13 short test rows.

| Split | Rows | English | Hindi | Odia | Tamil | Native script | Romanized | Code-mixed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Train | 3,000 | 600 | 900 | 600 | 900 | 1,189 | 900 | 911 |
| Validation | 1,000 | 200 | 300 | 200 | 300 | 411 | 300 | 289 |
| Test | 1,000 | 200 | 300 | 200 | 300 | 400 | 300 | 300 |

## Why short inputs can be rejected

Character n-grams are sparse on short strings. Names can add many character features without adding strong language evidence, while a phrase such as “My name is” is underrepresented in the English slice (Project Gutenberg prose). The SVM still returns an English candidate, but the normalized score and score margin can be too low for the open-set threshold. For `My name is Muhammad Khubab Ansari.`, the baseline candidate was English with score `0.292` and margin `0.122`; the global rejection rule correctly withheld that label.

The threshold is not the only issue. The primary corpus has few short English examples, the 2–5 gram representation has less evidence on short text, and the SVM score proxy is not calibrated as a probability. Lowering the threshold alone would accept unsupported or ambiguous Latin text. Training contains 686 short (≤8-token) rows overall, but only 22 English short rows; the 1,000-row English class is sourced from Gutenberg plus English-dominant code-mixed data. Text normalization also differed between training and inference before the NFC consistency fix.

## Candidate experiment and data

The candidate keeps character TF-IDF and Linear SVM, changes the analyzer to character n-grams within word boundaries (`char_wb`, 2–5), and adds a bounded set of real Tatoeba short sentences. It does not use synthetic examples.

The Tatoeba API snapshot contains 1,244 records before cleaning: up to 350 each for English, Hindi, and Tamil, and 194 Odia records. The compact source snapshot is 398,625 bytes; the prepared TSV is 240,660 bytes. After Unicode, script, licensing, and duplicate checks, 1,240 rows remain: English 350, Hindi 349, Tamil 350, Odia 191. All are native-script rows; 1,233 are CC BY 2.0 FR and 7 are CC0 1.0. Synthetic and dataset-generated rows are both zero. Contributors and sentence IDs are retained per row for attribution. The API query was text-only and did not fetch audio. Tatoeba documents the text license and attribution requirements in its [FAQ](https://en.wiki.tatoeba.org/articles/show/faq); the [official API](https://api.tatoeba.org/) provides the sentence and translation-link metadata. The processed TSV SHA-256 is `4f07e83383fe3a5ff1603f1c471c6fc7d6f4815df97fa71367553e6cea5cf407`.

Tatoeba translation links, exact normalized text, and character 3–5-gram cosine similarity ≥0.90 are grouped before splitting. The supplemental split is 744 / 248 / 248 rows and 706 / 237 / 237 groups, with no group overlap. Its test has 248 rows: 70 English, 70 Hindi, 70 Tamil, and 38 Odia. Because the supplementary train and test rows share a source corpus, this measures group-held-out performance within Tatoeba, not cross-corpus generalization.

Reproduce from the saved local snapshot and processed data:

```sh
cd ml-service
PYTHONPATH=src .venv312/bin/python -m indic_id.prepare_tatoeba_short \
  --snapshot data/raw/tatoeba-short-api-snapshot.json \
  --output data/processed/tatoeba-short.tsv \
  --manifest artifacts/tatoeba-short-manifest.json \
  --compact-snapshot data/raw/tatoeba-short-subset.json
PYTHONPATH=src .venv312/bin/python -m indic_id.short_text_experiment
```

The generated report is `ml-service/artifacts/short-text-experiment.json`; the candidate bundle is `ml-service/artifacts/short-text-candidate/candidate_model.joblib`. Local datasets and model bundles are ignored by Git under the existing repository policy. The tracked manifests include actual counts and hashes.

## Results

Primary test results use the same fixed original 1,000-row test split. The candidate was selected using validation data only. Raw classifier results:

| Measure | Existing model | Candidate |
| --- | ---: | ---: |
| Overall accuracy | 0.969 | 0.969 |
| Macro F1 | 0.967575 | 0.967498 |
| Short accuracy (1–8 whitespace tokens, n=257) | 0.968872 | 0.972763 |
| Medium accuracy (9–20 tokens, n=514) | 0.966926 | 0.963035 |
| Long accuracy (>20 tokens, n=229) | 0.973799 | 0.978166 |

Per-language precision / recall / F1 on the same primary test (baseline → candidate):

| Language | Baseline P / R / F1 | Candidate P / R / F1 |
| --- | --- | --- |
| English | 0.9261 / 0.9400 / 0.9330 | 0.9350 / 0.9350 / 0.9350 |
| Hindi | 0.9596 / 0.9500 / 0.9548 | 0.9565 / 0.9533 / 0.9549 |
| Odia | 0.9851 / 0.9900 / 0.9875 | 0.9802 / 0.9900 / 0.9851 |
| Tamil | 0.9967 / 0.9933 / 0.9950 | 0.9967 / 0.9933 / 0.9950 |

Candidate category accuracy on the primary test was 1.000 native-script, 0.980 Romanized, and 0.9167 code-mixed. The baseline had the same category accuracies. The candidate's supplemental Tatoeba short-test accuracy was 0.991935 (246/248) versus 0.963710 (239/248) for the baseline classifier. Candidate per-language short-test F1 was English 0.9857, Hindi 0.9928, Odia 1.0000, Tamil 0.9929. These Tatoeba results are promising but source-domain-specific.

Open-set results use the existing 400-row untouched Dakshina unknown-language holdout. Thresholds were selected using validation plus the separate calibration half, never the holdout:

| Measure | Existing production bundle | Candidate |
| --- | ---: | ---: |
| Known primary-test coverage | 0.930 | 0.940 |
| Accuracy among accepted known primary-test rows | 0.9892 | 0.9862 |
| Tatoeba short-test coverage | 0.6734 | 0.9153 |
| Accuracy among accepted Tatoeba short-test rows | 1.000 | 1.000 |
| Unknown false-accept rate | 0.205 (82/400) | 0.2525 (101/400) |

Candidate thresholds were `min_confidence=0.4431231823562185` and `min_margin=0.0`. The calibration-half unknown rejection was 0.790 for the candidate, versus 0.830 in the existing calibration report. The candidate accepts more known short text, but its unknown rejection is worse.

## Challenge examples

Scores below are actual normalized decision-score proxies, not probabilities. The candidate detected “Good morning,” “How are you?,” and “I live in India.” as English; it returned unknown for “My name is Khubaib.” (0.407) and “My name is Muhammad Khubab Ansari.” (0.327). It detected all supplied Hindi, Tamil, and Odia challenge strings in this run. It also incorrectly accepted ambiguous “OK” as English (0.457) and “Hi” as Hindi (0.567). The baseline rejected both as unknown. These challenge strings are diagnostic examples, not a statistically representative test set.

## Promotion decision

**Do not promote the candidate.** The original primary accuracy is unchanged and macro F1 is slightly lower; its short-source gain comes from the same Tatoeba domain used for candidate training; and its unknown false-accept rate rises from 20.5% to 25.25%. It also accepts ambiguous short strings. The original production model, artifact, thresholds, 96.9% accuracy, and 0.9675748 macro F1 remain unchanged.

The candidate artifact is retained separately for further research (SHA-256 `e9a3c757efe8091ce71cfb576ac6fae2e7c13d410ffd6f32f90ad67a4a54d2eb`). The unchanged production artifact SHA-256 is `2a7f9b1e370d7ef3bea013c305f7e789d3fd711a619fcc3b87aa56cdd153126a`. No language guess or score is fabricated in the app. The runtime NFC consistency fix is independent of the candidate and does not change the saved model.
