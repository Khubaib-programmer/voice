"""Train and evaluate character n-gram language identifiers."""

from dataclasses import dataclass
from time import perf_counter
from statistics import mean
from math import ceil

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from indic_id.languages import LANGUAGE_CODES


def _pipeline(estimator):
    return Pipeline([
        ("tfidf", TfidfVectorizer(analyzer="char", ngram_range=(2, 5), min_df=1, sublinear_tf=True)),
        ("classifier", estimator),
    ])


def compare_models(
    examples: list[tuple[str, str] | tuple[str, str, str]],
    test_size: float = 0.2,
    random_state: int = 42,
):
    texts = [example[0] for example in examples]
    labels = [example[1] for example in examples]
    if all(len(example) >= 3 for example in examples):
        groups = [example[2] for example in examples]
        splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=random_state)
        train_idx, test_idx = next(splitter.split(texts, labels, groups))
        if set(groups[i] for i in train_idx) & set(groups[i] for i in test_idx):
            raise RuntimeError("Source groups leaked across the train/test split")
        train_x = [texts[i] for i in train_idx]
        test_x = [texts[i] for i in test_idx]
        train_y = [labels[i] for i in train_idx]
        test_y = [labels[i] for i in test_idx]
        split_strategy = "stratified_group_5fold_holdout"
    else:
        train_x, test_x, train_y, test_y = train_test_split(
            texts, labels, test_size=test_size, random_state=random_state, stratify=labels
        )
        split_strategy = "stratified_random_holdout"
    reports = {}
    fitted = {}
    for name, estimator in (
        ("logistic_regression", LogisticRegression(max_iter=2000, class_weight="balanced")),
        ("linear_svm", LinearSVC(class_weight="balanced")),
    ):
        model = _pipeline(estimator)
        model.fit(train_x, train_y)
        predictions = model.predict(test_x)
        classes = sorted(set(labels))
        timings = []
        for sample in test_x:
            started = perf_counter()
            model.predict([sample])
            timings.append((perf_counter() - started) * 1000)
        sorted_timings = sorted(timings)
        reports[name] = {
            "accuracy": accuracy_score(test_y, predictions),
            "macro_f1": f1_score(test_y, predictions, average="macro", zero_division=0),
            "per_language_f1": dict(zip(classes, f1_score(test_y, predictions, labels=classes, average=None, zero_division=0))),
            "confusion_matrix": confusion_matrix(test_y, predictions, labels=classes).tolist(),
            "labels": classes,
            "split_strategy": split_strategy,
            "latency_ms": {
                "mean": mean(timings),
                "p50": sorted_timings[ceil(0.50 * len(sorted_timings)) - 1],
                "p95": sorted_timings[ceil(0.95 * len(sorted_timings)) - 1],
                "samples": len(timings),
            },
        }
        fitted[name] = model
    return reports, fitted


@dataclass
class LanguageIdentifier:
    model: Pipeline
    min_confidence: float = 0.55
    min_margin: float = 0.10

    def predict(self, text: str) -> dict[str, object]:
        cleaned = text.strip()
        if len(cleaned) < 2:
            return {"language": "unknown", "confidence": 0.0, "reason": "input_too_short"}
        start = perf_counter()
        classifier = self.model.named_steps["classifier"]
        predicted = str(self.model.predict([cleaned])[0])
        if hasattr(classifier, "predict_proba"):
            scores = self.model.predict_proba([cleaned])[0]
            ordered = sorted(scores, reverse=True)
            confidence = float(ordered[0])
            margin = float(ordered[0] - ordered[1]) if len(ordered) > 1 else confidence
        else:
            scores = self.model.decision_function([cleaned])[0]
            raw_scores = np.atleast_1d(scores).astype(float)
            if len(classifier.classes_) == 2 and raw_scores.size == 1:
                decision_scores = np.asarray([-raw_scores[0], raw_scores[0]])
            else:
                decision_scores = raw_scores
            ordered = sorted((float(score) for score in decision_scores), reverse=True)
            # Softmax is only a normalized decision-score proxy, not a calibrated probability.
            shifted = decision_scores - max(decision_scores)
            probabilities = np.exp(shifted) / np.exp(shifted).sum()
            confidence = float(max(probabilities))
            margin = float(ordered[0] - ordered[1]) if len(ordered) > 1 else confidence
        rejected = confidence < self.min_confidence or margin < self.min_margin
        elapsed_ms = (perf_counter() - start) * 1000
        return {
            "language": "unknown" if rejected else predicted,
            "candidate_language": predicted,
            "confidence": confidence,
            "confidence_kind": "probability" if hasattr(classifier, "predict_proba") else "normalized_decision_score",
            "margin": margin,
            "reason": "ambiguous" if rejected else None,
            "latency_ms": elapsed_ms,
        }
