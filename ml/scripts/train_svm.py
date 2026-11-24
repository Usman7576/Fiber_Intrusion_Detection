"""Train the SVM baseline on the 384 hand-crafted features.

Two runs:
  svm_paper  authors' settings: MinMaxScaler + SVC(rbf, C=1, gamma='auto')
             (scaler fitted on train only; the authors refit it on the test set)
  svm_tuned  StandardScaler + SVC(rbf), C/gamma picked on the validation split, refit on all train

Usage:
    python ml/scripts/train_svm.py
Writes results/metrics_svm_*.json, results/confusion_svm_*.png, ml/models/svm.joblib (best on validation)
"""

from __future__ import annotations

import itertools
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.svm import SVC

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phiotdr.config import MODELS_DIR, PROCESSED_DIR, RAW_DIR, RESULTS_DIR  # noqa: E402
from phiotdr.data_loader import load_mat  # noqa: E402
from phiotdr.evaluate import compute_metrics, measure_latency, save_report, summary_line  # noqa: E402
from phiotdr.features import sample_features  # noqa: E402


def load(split):
    return (np.load(PROCESSED_DIR / f"{split}_feat.npy"), np.load(PROCESSED_DIR / f"{split}_y.npy"),
            pd.read_csv(PROCESSED_DIR / f"{split}_meta.csv"))


def fit_eval(name, pipe, Xtr, ytr, Xte, yte, extra):
    t0 = time.perf_counter()
    pipe.fit(Xtr, ytr)
    train_s = time.perf_counter() - t0
    m = compute_metrics(yte, pipe.predict(Xte))
    m.update(extra, train_seconds=round(train_s, 1))
    print(summary_line(name, m), f"({train_s:.0f}s)")
    return m


def main() -> None:
    Xtr_all, ytr_all, meta = load("train")
    Xte, yte, _ = load("test")
    is_val = meta["is_val"].to_numpy()
    Xtr, ytr, Xva, yva = Xtr_all[~is_val], ytr_all[~is_val], Xtr_all[is_val], ytr_all[is_val]
    print(f"train {len(Xtr)}  val {len(Xva)}  test {len(Xte)}  features {Xtr.shape[1]}")

    results = {}

    # 1) authors' configuration, trained on the full official train split as in their code
    paper = make_pipeline(MinMaxScaler(), SVC(kernel="rbf", C=1.0, gamma="auto"))
    results["svm_paper"] = fit_eval("svm_paper", paper, Xtr_all, ytr_all, Xte, yte,
                                    {"model": "svm", "config": {"scaler": "minmax", "C": 1.0, "gamma": "auto"}})
    save_report("svm_paper", results["svm_paper"])

    # 2) tuned on the validation split
    grid = list(itertools.product([1, 10, 100, 1000], ["scale", 0.001, 0.003, 0.01]))
    val_scores = []
    for C, gamma in grid:
        pipe = make_pipeline(StandardScaler(), SVC(kernel="rbf", C=C, gamma=gamma))
        pipe.fit(Xtr, ytr)
        acc = float((pipe.predict(Xva) == yva).mean())
        val_scores.append({"C": C, "gamma": gamma, "val_acc": acc})
        print(f"  C={C:<5} gamma={gamma!s:<6} val acc {acc:.2%}")
    best = max(val_scores, key=lambda s: s["val_acc"])
    print(f"best on validation: C={best['C']} gamma={best['gamma']} ({best['val_acc']:.2%})")

    tuned = make_pipeline(StandardScaler(), SVC(kernel="rbf", C=best["C"], gamma=best["gamma"], probability=True,
                                                random_state=0))
    results["svm_tuned"] = fit_eval("svm_tuned", tuned, Xtr_all, ytr_all, Xte, yte,
                                    {"model": "svm", "config": {"scaler": "standard", **best}, "grid": val_scores})

    # latency = feature extraction from a raw sample + prediction
    raw = load_mat(RAW_DIR / "test" / pd.read_csv(PROCESSED_DIR / "test_meta.csv")["rel_path"][0])
    results["svm_tuned"]["latency_ms"] = measure_latency(lambda r: tuned.predict(sample_features(r)[None]), raw, 30)
    results["svm_tuned"]["params"] = int(tuned[-1].support_vectors_.size + tuned[-1].dual_coef_.size)
    save_report("svm_tuned", results["svm_tuned"])

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(tuned, MODELS_DIR / "svm.joblib")
    (RESULTS_DIR / "svm_grid.json").write_text(json.dumps(val_scores, indent=2))
    print(f"latency {results['svm_tuned']['latency_ms']:.1f} ms/sample; saved {MODELS_DIR / 'svm.joblib'}")


if __name__ == "__main__":
    main()
