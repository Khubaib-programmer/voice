# ML experiments

## Status

No language model has been trained yet. The current prepared corpus contains 3,000 licensed-source native/romanized samples for Hindi, Odia, and Tamil; it does not yet cover English or any code-mixed cell. There are no project accuracy or F1 results to report. Automated tests use tiny synthetic English/Hindi fixtures only to exercise the implementation; these are not project results.

## Planned comparison

The training command fits character n-gram TF-IDF with Logistic Regression and LinearSVC on the same stratified holdout split. It writes accuracy, macro F1, per-language F1, confusion matrix, and measured per-example mean/p50/p95 inference latency to `evaluation.json`. Record the dataset version, processing manifest, split seed, software versions, class counts, and model artifact hashes alongside each real experiment.

## Evaluation additions before academic claims

- Deduplicate before splitting and check for source or author leakage.
- Report native-script and romanized subsets separately, as well as per-language results.
- Add held-out code-mixed and unknown/ambiguous examples with documented labels and evaluate rejection precision/coverage.
- Use a validation set to select rejection thresholds, then freeze them before test evaluation.
- Distinguish calibrated probability from a normalized SVM decision-score proxy. Current SVM confidence is explicitly a proxy and must not be interpreted as a probability.
- Measure latency on the target deployment hardware after warm-up and state hardware, batch size, and software versions.

Do not include scores from synthetic tests as model accuracy claims.
