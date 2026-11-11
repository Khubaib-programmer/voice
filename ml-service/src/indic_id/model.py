"""Train and evaluate character n-gram language identifiers with group-safe splits."""

from dataclasses import dataclass
import hashlib
from math import ceil
from statistics import mean
from time import perf_counter
import unicodedata

import numpy as np
from sklearn.base import clone
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from indic_id.languages import LANGUAGE_CODES
from indic_id.scripts import classify_script


def _pipeline(estimator):
    return Pipeline([
        ("tfidf", TfidfVectorizer(analyzer="char", ngram_range=(2, 5), min_df=1, sublinear_tf=True)),
        ("classifier", estimator),
    ])


def _parts(example, index):
    text, label = example[0], example[1]
    group = example[2] if len(example) >= 3 else "text-" + hashlib.sha256(str(text).encode("utf-8")).hexdigest()
    category = example[3] if len(example) >= 4 else "unspecified"
    origin = example[4] if len(example) >= 5 else "unspecified"
    return str(text), str(label), str(group), str(category), str(origin)


def _split_indices(examples, random_state):
    labels = [item[1] for item in examples]
    groups = [item[2] for item in examples]
    texts = [item[0] for item in examples]
    outer = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=random_state)
    train_val_idx, test_idx = next(outer.split(texts, labels, groups))
    train_val = [examples[i] for i in train_val_idx]
    inner = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=random_state + 1)
    inner_labels = [item[1] for item in train_val]
    inner_groups = [item[2] for item in train_val]
    inner_texts = [item[0] for item in train_val]
    train_rel, val_rel = next(inner.split(inner_texts, inner_labels, inner_groups))
    train_idx = [train_val_idx[i] for i in train_rel]
    val_idx = [train_val_idx[i] for i in val_rel]
    group_sets = [
        {groups[i] for i in indices}
        for indices in (train_idx, val_idx, list(test_idx))
    ]
    if group_sets[0] & group_sets[1] or group_sets[0] & group_sets[2] or group_sets[1] & group_sets[2]:
        raise RuntimeError("Source group leaked across train/validation/test split")
    for name, indices in zip(("train", "validation", "test"), (train_idx, val_idx, list(test_idx))):
        missing = {item[1] for item in examples} - {examples[i][1] for i in indices}
        if missing:
            raise ValueError(f"{name} split lacks language labels {sorted(missing)}; more grouped data is required")
    return train_idx, val_idx, list(test_idx)


def _distribution(examples):
    result = {
        "rows": len(examples),
        "groups": len({item[2] for item in examples}),
        "language": {},
        "category": {},
        "origin": {},
    }
    for key, position in (("language", 1), ("category", 3), ("origin", 4)):
        for item in examples:
            result[key][item[position]] = result[key].get(item[position], 0) + 1
        result[key] = dict(sorted(result[key].items()))
    return result


def _measure(y_true, predictions, labels, samples, model):
    if not y_true:
        return {"sample_count": 0, "accuracy": None, "macro_f1": None, "per_language_f1": {}, "confusion_matrix": [], "labels": []}
    present = sorted(set(y_true))
    cm_labels = labels if len(present) == len(labels) else present
    warmup_calls = min(50, len(samples))
    for _ in range(warmup_calls):
        model.predict([samples[0]])
    times = []
    for sample in samples:
        start = perf_counter()
        model.predict([sample])
        times.append((perf_counter() - start) * 1000)
    times.sort()
    per_f1 = f1_score(y_true, predictions, labels=cm_labels, average=None, zero_division=0)
    return {
        "sample_count": len(y_true),
        "accuracy": float(accuracy_score(y_true, predictions)),
        "macro_f1": float(f1_score(y_true, predictions, labels=cm_labels, average="macro", zero_division=0)),
        "per_language_f1": {lang: float(score) for lang, score in zip(cm_labels, per_f1)},
        "confusion_matrix": confusion_matrix(y_true, predictions, labels=cm_labels).tolist(),
        "labels": cm_labels,
        "latency_ms": {
            "mean": mean(times),
            "p50": times[max(0, ceil(0.50 * len(times)) - 1)],
            "p95": times[max(0, ceil(0.95 * len(times)) - 1)],
            "samples": len(times),
            "warmup_calls": warmup_calls,
            "batch_size": 1,
        },
    }


def _tune_rejection(model, validation, target_accuracy: float = 0.98):
    provisional = LanguageIdentifier(model, min_confidence=0.0, min_margin=0.0)
    decisions = [provisional.predict(row[0]) for row in validation]
    confidences = np.asarray([item["confidence"] for item in decisions], dtype=float)
    margins = np.asarray([item["margin"] for item in decisions], dtype=float)
    confidence_grid = sorted(set([0.25, 0.55, *np.quantile(confidences, np.linspace(0, 1, 21)).tolist()]))
    margin_grid = sorted(set([0.0, 0.10, *np.quantile(margins, np.linspace(0, 1, 21)).tolist()]))
    labels = [row[1] for row in validation]
    min_accepted = max(2, int(len(validation) * 0.5))
    candidates = []
    for confidence in confidence_grid:
        for margin in margin_grid:
            accepted = [
                i for i, item in enumerate(decisions)
                if item["confidence"] >= confidence and item["margin"] >= margin
            ]
            if len(accepted) < min_accepted:
                continue
            accuracy = sum(decisions[i]["candidate_language"] == labels[i] for i in accepted) / len(accepted)
            candidates.append({
                "min_confidence": float(confidence),
                "min_margin": float(margin),
                "coverage": len(accepted) / len(validation),
                "accuracy_on_accepted_rows": accuracy,
                "accepted_rows": len(accepted),
            })
    if not candidates:
        return {"min_confidence": 0.0, "min_margin": 0.0}, {"target_accuracy": target_accuracy, "selected_on_validation": None}
    meeting_target = [item for item in candidates if item["accuracy_on_accepted_rows"] >= target_accuracy]
    if meeting_target:
        selected = max(meeting_target, key=lambda item: (item["coverage"], item["accuracy_on_accepted_rows"], -item["min_confidence"], -item["min_margin"]))
    else:
        selected = max(candidates, key=lambda item: (item["accuracy_on_accepted_rows"], item["coverage"], -item["min_confidence"], -item["min_margin"]))
    return {"min_confidence": selected["min_confidence"], "min_margin": selected["min_margin"]}, {
        "target_accuracy": target_accuracy,
        "selected_on_validation": selected,
    }


def compare_models(examples, random_state: int = 42):
    rows = [_parts(example, i) for i, example in enumerate(examples)]
    if len({row[1] for row in rows}) < 2:
        raise ValueError("At least two language classes are needed")
    train_idx, val_idx, test_idx = _split_indices(rows, random_state)
    train = [rows[i] for i in train_idx]
    val = [rows[i] for i in val_idx]
    test = [rows[i] for i in test_idx]
    train_val = train + val
    label_order = sorted({row[1] for row in rows})
    candidate_estimators = {
        "logistic_regression": LogisticRegression(max_iter=2000, class_weight="balanced"),
        "linear_svm": LinearSVC(class_weight="balanced", random_state=random_state),
    }
    reports, candidates = {}, {}
    for name, estimator in candidate_estimators.items():
        model = _pipeline(estimator)
        model.fit([row[0] for row in train], [row[1] for row in train])
        validation_predictions = model.predict([row[0] for row in val])
        validation_f1 = float(f1_score([row[1] for row in val], validation_predictions, average="macro", zero_division=0))
        rejection_thresholds, validation_rejection = _tune_rejection(model, val)
        predictions = model.predict([row[0] for row in test])
        y_test = [row[1] for row in test]
        overall = _measure(y_test, predictions, label_order, [row[0] for row in test], model)
        category_metrics = {}
        for category in ("native_script", "romanized", "code_mixed"):
            positions = [i for i, row in enumerate(test) if row[3] == category]
            if not positions:
                category_metrics[category] = _measure([], [], label_order, [], model)
                continue
            category_metrics[category] = _measure(
                [y_test[i] for i in positions],
                [predictions[i] for i in positions],
                label_order,
                [test[i][0] for i in positions],
                model,
            )
        identifier = LanguageIdentifier(model, **rejection_thresholds)
        decisions = [identifier.predict(row[0]) for row in test]
        accepted = [i for i, decision in enumerate(decisions) if decision["language"] != "unknown"]
        reports[name] = {
            **overall,
            "validation_macro_f1_for_selection": validation_f1,
            "category_metrics": category_metrics,
            "known_input_rejection": {
                "thresholds": {"min_confidence": identifier.min_confidence, "min_margin": identifier.min_margin},
                "validation_selection": validation_rejection,
                "test_rows": len(test),
                "accepted_rows": len(accepted),
                "rejected_as_unknown_or_ambiguous": len(test) - len(accepted),
                "coverage": len(accepted) / len(test),
                "accuracy_on_accepted_rows": (
                    sum(decisions[i]["language"] == test[i][1] for i in accepted) / len(accepted)
                    if accepted else None
                ),
                "note": "The test set contains known-language examples only; this measures rejection coverage, not false acceptance of unknown languages.",
            },
            "split_strategy": "stratified_group_train_validation_test_60_20_20",
            "group_leakage_detected": False,
            "split_distribution": {
                "train": _distribution(train),
                "validation": _distribution(val),
                "test": _distribution(test),
            },
        }
        candidates[name] = model

    best_name = max(reports, key=lambda name: reports[name]["validation_macro_f1_for_selection"])
    # Refit the selected model on train+validation; the test set remains untouched.
    best_model = _pipeline(clone(candidate_estimators[best_name]))
    best_model.fit([row[0] for row in train_val], [row[1] for row in train_val])
    return reports, candidates, best_name, best_model


@dataclass
class LanguageIdentifier:
    model: Pipeline
    min_confidence: float = 0.55
    min_margin: float = 0.10

    def predict(self, text: str) -> dict[str, object]:
        # Match the NFC normalization used by the training data loader. This
        # preserves Indic characters while collapsing canonically equivalent
        # sequences to the feature forms seen during training.
        cleaned = unicodedata.normalize("NFC", " ".join(text.strip().split()))
        if len(cleaned) < 2:
            return {"language": "unknown", "confidence": 0.0, "reason": "input_too_short"}
        script_evidence = classify_script(cleaned)
        if script_evidence["script"] in {"other", "unknown"}:
            return {"language": "unknown", "confidence": 0.0, "reason": "unsupported_script"}
        start = perf_counter()
        classifier = self.model.named_steps["classifier"]
        predicted = str(self.model.predict([cleaned])[0])
        if hasattr(classifier, "predict_proba"):
            scores = self.model.predict_proba([cleaned])[0]
            ordered = sorted((float(score) for score in scores), reverse=True)
            confidence = ordered[0]
            margin = ordered[0] - ordered[1] if len(ordered) > 1 else confidence
            confidence_kind = "model_probability"
        else:
            scores = self.model.decision_function([cleaned])[0]
            raw_scores = np.atleast_1d(scores).astype(float)
            if len(classifier.classes_) == 2 and raw_scores.size == 1:
                raw_scores = np.asarray([-raw_scores[0], raw_scores[0]])
            shifted = raw_scores - max(raw_scores)
            probability_proxy = np.exp(shifted) / np.exp(shifted).sum()
            ordered = sorted((float(score) for score in raw_scores), reverse=True)
            confidence = float(max(probability_proxy))
            margin = ordered[0] - ordered[1] if len(ordered) > 1 else confidence
            confidence_kind = "normalized_decision_score_proxy"
        rejected = confidence < self.min_confidence or margin < self.min_margin
        return {
            "language": "unknown" if rejected else predicted,
            "candidate_language": predicted,
            "confidence": float(confidence),
            "confidence_kind": confidence_kind,
            "margin": float(margin),
            "reason": "ambiguous" if rejected else None,
            "latency_ms": (perf_counter() - start) * 1000,
        }
