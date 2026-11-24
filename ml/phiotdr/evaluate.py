"""Evaluation: accuracy, per-class P/R/F1, confusion matrix, NAR, FNR, digging miss rate, latency.

NAR and FNR follow the definitions in the authors' code (BJTUSensor/Phi-OTDR_dataset_and_codes),
where background (label 0) is the only no-alarm class and labels 1-5 all raise an alarm:

    NAR = background samples predicted as an event / all samples predicted as an event
    FNR = event samples predicted as background    / all event samples
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support

from .config import CLASS_LABELS, CLASS_NAMES, NUM_CLASSES, RESULTS_DIR


def compute_metrics(y_true, y_pred) -> dict:
    y_true, y_pred = np.asarray(y_true), np.asarray(y_pred)
    cm = confusion_matrix(y_true, y_pred, labels=range(NUM_CLASSES))
    p, r, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=range(NUM_CLASSES), zero_division=0
    )
    predicted_event = cm[:, 1:].sum()
    true_event = cm[1:, :].sum()
    dig = CLASS_LABELS["dig"]
    return {
        "accuracy": float(np.trace(cm) / cm.sum()),
        "macro_f1": float(f1.mean()),
        "nar": float(cm[0, 1:].sum() / predicted_event) if predicted_event else 0.0,
        "fnr": float(cm[1:, 0].sum() / true_event) if true_event else 0.0,
        # share of real digging NOT classified as digging (missed or confused with another class)
        "dig_miss_rate": float(1 - cm[dig, dig] / cm[dig].sum()) if cm[dig].sum() else 0.0,
        "per_class": {
            name: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f1[i]), "support": int(support[i])}
            for i, name in enumerate(CLASS_NAMES)
        },
        "confusion_matrix": cm.tolist(),
        "n_samples": int(cm.sum()),
    }


def measure_latency(predict_one, sample, repeats: int = 100, warmup: int = 5) -> float:
    """Median wall-clock milliseconds for one single-sample prediction."""
    for _ in range(warmup):
        predict_one(sample)
    times = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        predict_one(sample)
        times.append((time.perf_counter() - t0) * 1000)
    return float(np.median(times))


def save_report(name: str, metrics: dict, out_dir: Path = RESULTS_DIR) -> Path:
    """Write metrics JSON and a confusion-matrix PNG to results/."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"metrics_{name}.json"
    path.write_text(json.dumps(metrics, indent=2))
    plot_confusion(np.array(metrics["confusion_matrix"]), f"{name} — acc {metrics['accuracy']:.1%}",
                   out_dir / f"confusion_{name}.png")
    return path


def plot_confusion(cm: np.ndarray, title: str, path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import seaborn as sns

    norm = cm / cm.sum(axis=1, keepdims=True).clip(min=1)
    fig, ax = plt.subplots(figsize=(6.4, 5.4), dpi=150)
    sns.heatmap(norm, annot=cm, fmt="d", cmap="Blues", vmin=0, vmax=1, cbar_kws={"label": "row share"},
                xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES, ax=ax)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def summary_line(name: str, m: dict) -> str:
    return (f"{name:<12} acc {m['accuracy']:.2%}  macro-F1 {m['macro_f1']:.3f}  "
            f"NAR {m['nar']:.2%}  FNR {m['fnr']:.2%}  dig-miss {m['dig_miss_rate']:.2%}")
