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

Added a reproducible evaluation-only slice of 800 Romanized examples: 100 each for Bangla (`bn`), Gujarati (`gu`), Kannada (`kn`), Malayalam (`ml`), Marathi (`mr`), Punjabi (`pa`), Sindhi (`sd`), and Telugu (`te`). It is sourced from Dakshina rows packaged in Bhasha-Abhijnaanam under CC BY-SA 4.0 attribution, and is excluded from known-language training, validation, and test data. The reproducible calibrator splits each language into 50 calibration and 50 holdout rows by SHA-256 ordering of source record IDs.

The pre-calibration threshold (`min_confidence=0.25`) rejected **417/800 (52.125%)** and falsely accepted **383/800 (47.875%)**. The new threshold (`min_confidence=0.4401612940`, `min_margin=0.3342549209`) is tuned with constraints of at least 80% known validation coverage, 98% accepted accuracy, and 80% code-mixed validation coverage. On the calibration half it rejects **332/400 (83%)** (a tuning result, not independent evaluation). On the untouched 400-row holdout it rejects **318/400 (79.5%)**, for a 20.5% false-accept rate. On the known-language test set, accepted coverage is 93%; among accepted examples, accuracy is 98.92%. Category coverage is 99.25% native-script, 94.33% Romanized, and 83.33% code-mixed. Confidence is an SVM normalized decision-score proxy, not a calibrated probability. This threshold improves unknown rejection while preserving most known/code-mixed inputs. The OOD set shares the Bhasha-Abhijnaanam archive family with training data, so it tests unseen labels but is not an independent-source benchmark or global false-accept estimate. See the generated `ml-service/artifacts/unknown-language-evaluation.json` for per-language details.

## Saved service restart check

The calibrated bundle SHA-256 is recorded in `ml-service/artifacts/unknown-language-evaluation.json`. A fresh Python process loads the artifact through FastAPI's lifespan; live service prediction checks were also run during application integration. The model artifact is generated locally and excluded from Git, so production deployment must supply the matching generated artifact.

## Short-text behavior

The saved `LanguageIdentifier` rejects normalized inputs shorter than two characters as `unknown` with reason `input_too_short`. Longer fragments still pass through the unchanged TF-IDF + Linear SVM and existing confidence/margin thresholds. Runtime probes of one-character and short (2–5 character) fragments returned unknown/ambiguous predictions; some candidate labels were low-scoring and were not surfaced as detections. The translator UI therefore asks users for a fuller sentence and never fills in a language itself. No model thresholds, artifact contents, or audited evaluation results were changed for this workflow update.

## Limitations and next actions

The reported headline scores are reproduced but are within-source row-level scores. Native-script classification is easier than Latin-script classification, mixed-language misses remain, and the improved rejection rate comes with lower known-input coverage. Before production, collect an independent source-disjoint unknown and mixed-text evaluation set. A future update must report fresh holdout metrics and preserve the reproducible primary classifier results.

The short-text experiment and promotion decision are documented separately in [the short-text ML audit](short-text-ml-audit.md). It retains the existing production model because the short-source candidate increased the unknown-language false-accept rate.
