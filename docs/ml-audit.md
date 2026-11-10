# Final ML audit — 2026-11-10

## Reproduction

Re-ran the checked-in `indic_id.train` script against the unchanged 5,000-row merged TSV with random seed 42, scikit-learn 1.9.1, Python 3.12.16, and the four recorded source manifests. The output reproduced the saved evaluation exactly:

| Model | Accuracy | Macro F1 |
| --- | ---: | ---: |
| Character TF-IDF + Logistic Regression | 0.963 | 0.9609542335165753 |
| Character TF-IDF + Linear SVM | 0.969 | 0.9675747938901821 |

Linear SVM remains selected by validation macro F1 (0.9665719213 vs. 0.9601677083). No headline metric was changed. Reproduction command is in [ML experiments](ml-experiments.md); the evaluation includes all per-language, category, confusion-matrix, and latency details.

## Split leakage review

- Reconstructed the exact split using the saved data loader and seed. The train/validation/test group counts are 2,100 / 700 / 700, and group intersections are empty.
- Source sentence-pair IDs are unioned before splitting. Exact normalized-text duplicates across source IDs are also unioned. A separate normalized exact-text scan found **0 cross-partition duplicate groups**.
- Compared every row pair across partitions with binary character 3–5-gram TF-IDF cosine similarity. At threshold `>=0.90`, there were **0 non-identical cross-partition pairs**.
- The *corpus sources* themselves are represented in all three partitions (Dakshina/Bhasha, COMI-LINGUA, Gutenberg, and Tamil OffensEval). This is a row-level grouped holdout, not a source-corpus holdout. The reported score therefore measures held-out rows from known source domains; it does not establish cross-dataset generalization. No separate source-disjoint performance claim is made.

## Label and mixed-language review

- English-only Gutenberg rows are in `native_script` (Latin) and never counted as `code_mixed`.
- Hindi/English code-mixed rows require annotations showing both `hi` and `en` from at least two annotators; their class is the annotated dominant language. Tamil-English rows require a Tamil-labeled comment containing both Tamil Unicode characters and Latin letters. Both selections exclude English-only text.
- On the held-out code-mixed test slice, Linear SVM predicted the annotation-defined dominant class for 88/100 English-dominant Hinglish rows, 88/100 Hindi-dominant Hinglish rows, and 99/100 Tamil-English rows. The model can misclassify or reject mixed text: it should not be described as reliably recognizing every mix. This is sentence-level dominant-language identification, not token-level code-switch detection.
- **Odia code-mixed training data is unavailable:** verified natural-source count is 0/500. No Odia code-mixed examples occur in training or code-mixed evaluation.

## Unknown-language evaluation

Added a reproducible evaluation-only slice of 800 Romanized examples: 100 each for Bangla (`bn`), Gujarati (`gu`), Kannada (`kn`), Malayalam (`ml`), Marathi (`mr`), Punjabi (`pa`), Sindhi (`sd`), and Telugu (`te`). The labels are outside the supported set. It is sourced from the Dakshina rows packaged in Bhasha-Abhijnaanam, under CC BY-SA 4.0 attribution. The slice is excluded from all training, validation, and known-language test data. Preparation and evaluation are reproducible with `indic_id.prepare_unknown_eval` and `indic_id.evaluate_unknown`; the actual file counts, size, hashes, and per-language predictions are recorded in `ml-service/artifacts/unknown-language-evaluation.json` and its generated data manifest.

The saved SVM rejected **417/800 (52.125%)** as unknown and falsely accepted **383/800 (47.875%)** as one of the four supported languages. Rejection ranged from 11% for Malayalam to 71% for Bangla. This is an explicit failure of the current open-set handling for Romanized input. The test shares the Bhasha-Abhijnaanam archive family with some training data, so it tests unseen language labels but is not an independent-source benchmark. Do not treat the observed rate as a general-world false-accept estimate.

## Saved service restart check

The bundle SHA-256 is `58aea95a98d01579b1da040e9557ad6a79a6da8932a036cd6c963d9a4694c887`. A fresh Python process loaded this artifact through FastAPI's lifespan and served predictions through `TestClient`. The environment does not permit binding a local TCP listener (`uvicorn` startup returned `operation not permitted`), so a real socket-level restart check could not be completed in this sandbox. The bundle load and endpoint checks are covered by the repeatable FastAPI lifespan test.

## Limitations and next actions

The reported headline scores are reproduced but are within-source row-level scores, native-script classification is much easier than Latin-script classification, mixed language misses remain, and nearly half of the sampled out-of-scope Romanized inputs are accepted as supported. Before production, collect an independent source-disjoint unknown and mixed-text evaluation set, then calibrate or redesign rejection using that validation data. A future update must report fresh holdout metrics; it must not silently overwrite these reproducible results.
