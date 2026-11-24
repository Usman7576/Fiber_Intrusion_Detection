"""Phase 4.1 — how well do the models work on recordings they have never seen?

The official split puts samples cut from the same continuous recording ("session") on both sides, so the test set
shares background noise, light level and operator with training. Here the official train + test sets are pooled and
re-split so that whole groups are held out:

    --protocol session   StratifiedGroupKFold(5) over 441 sessions   (unseen recordings)
    --protocol date      StratifiedGroupKFold(3) over 21 recording days (unseen days: harder)

Leave-one-recorder-out is not possible: recorders are confounded with classes (e.g. shake is almost only 'yu').
Seed 0 is used because it gives folds where every class appears on both sides (checked at run time).

Neural nets train for a fixed number of epochs with a cosine schedule and keep the final weights: there is no
validation set to peek at. The SVM uses the C/gamma picked in Phase 2.

Usage:
    python ml/scripts/cross_session.py --protocol session
    python ml/scripts/cross_session.py --protocol date --models svm,net1d_dig2

Appends one row per (model, fold) to results/cross_<protocol>_folds.csv (finished folds are skipped on rerun),
then writes results/cross_<protocol>.csv (mean ± std per model) and results/cross_<protocol>_<model>.json (pooled
metrics + confusion matrix over all folds).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from torch.utils.data import DataLoader

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phiotdr.config import NUM_CLASSES, PROCESSED_DIR, RESULTS_DIR, SEED  # noqa: E402
from phiotdr.data_loader import session_id  # noqa: E402
from phiotdr.evaluate import compute_metrics  # noqa: E402
from phiotdr.models import build_model  # noqa: E402
from phiotdr.train import ArrayDataset, fit, predict  # noqa: E402

# name -> how to train it. Neural configs mirror Phase 3 but with fixed epochs (no early stopping).
RUNS = {
    "svm": {"kind": "svm", "C": 10.0, "gamma": 0.001},
    "paper_cnn": {"kind": "nn", "model": "paper_cnn", "norm": "sample", "epochs": 60, "lr": 1e-3, "batch": 100,
                  "weight_decay": 1e-5, "augment": False, "dig_weight": 1.0},
    "net1d_dig2": {"kind": "nn", "model": "net1d", "norm": "sample", "epochs": 25, "lr": 1e-3, "batch": 64,
                   "weight_decay": 1e-4, "augment": True, "dig_weight": 2.0},
    "net1d_dig2_chnorm": {"kind": "nn", "model": "net1d", "norm": "channel", "epochs": 25, "lr": 1e-3, "batch": 64,
                          "weight_decay": 1e-4, "augment": True, "dig_weight": 2.0},
}
PROTOCOLS = {"session": 5, "date": 3}


def load_pooled():
    meta = pd.concat([pd.read_csv(PROCESSED_DIR / "train_meta.csv"), pd.read_csv(PROCESSED_DIR / "test_meta.csv")],
                     ignore_index=True)
    meta["session"] = meta["file"].map(session_id)
    meta["date"] = meta["date"].astype(str)
    y = np.concatenate([np.load(PROCESSED_DIR / "train_y.npy"), np.load(PROCESSED_DIR / "test_y.npy")])
    return meta, y


def load_X(kind: str) -> np.ndarray:
    name = {"feat": "{s}_feat.npy", "sample": "{s}_X.npy", "channel": "{s}_X_channel.npy"}[kind]
    return np.concatenate([np.load(PROCESSED_DIR / name.format(s=s)) for s in ("train", "test")])


def make_folds(meta: pd.DataFrame, y: np.ndarray, protocol: str):
    sgk = StratifiedGroupKFold(PROTOCOLS[protocol], shuffle=True, random_state=0)
    folds = list(sgk.split(meta, y, meta[protocol]))
    for k, (tr, te) in enumerate(folds):
        if not (np.bincount(y[tr], minlength=NUM_CLASSES).all() and np.bincount(y[te], minlength=NUM_CLASSES).all()):
            raise RuntimeError(f"fold {k} is missing a class; pick another seed")
        assert not set(meta[protocol].iloc[tr]) & set(meta[protocol].iloc[te])
    return folds


def run_svm(cfg, X, y, tr, te):
    clf = make_pipeline(StandardScaler(), SVC(kernel="rbf", C=cfg["C"], gamma=cfg["gamma"]))
    clf.fit(X[tr], y[tr])
    return clf.predict(X[te])


def run_nn(cfg, X, y, tr, te, threads):
    torch.manual_seed(SEED)
    torch.set_num_threads(threads)
    g = torch.Generator().manual_seed(SEED)
    train_dl = DataLoader(ArrayDataset(X[tr], y[tr], train_aug=cfg["augment"]), batch_size=cfg["batch"],
                          shuffle=True, generator=g)
    model = build_model(cfg["model"])
    state, *_ = fit(model, train_dl, None, epochs=cfg["epochs"], lr=cfg["lr"], weight_decay=cfg["weight_decay"],
                    dig_weight=cfg["dig_weight"], scheduler="cosine", verbose=False)
    model.load_state_dict(state)
    probs, _ = predict(model, DataLoader(ArrayDataset(X[te], y[te]), batch_size=256))
    return probs.argmax(1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--protocol", choices=sorted(PROTOCOLS), required=True)
    ap.add_argument("--models", default=",".join(RUNS))
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()

    meta, y = load_pooled()
    folds = make_folds(meta, y, args.protocol)
    fold_csv = RESULTS_DIR / f"cross_{args.protocol}_folds.csv"
    pred_dir = PROCESSED_DIR / f"cross_{args.protocol}_preds"
    pred_dir.mkdir(exist_ok=True)
    done = pd.read_csv(fold_csv) if fold_csv.exists() else pd.DataFrame(columns=["model", "fold"])
    print(f"{args.protocol}: {len(meta)} samples, {meta[args.protocol].nunique()} groups, {len(folds)} folds")

    for name in args.models.split(","):
        cfg = RUNS[name]
        X = load_X("feat" if cfg["kind"] == "svm" else cfg["norm"])
        for k, (tr, te) in enumerate(folds):
            if ((done["model"] == name) & (done["fold"] == k)).any():
                continue
            t0 = time.perf_counter()
            pred = run_svm(cfg, X, y, tr, te) if cfg["kind"] == "svm" else run_nn(cfg, X, y, tr, te, args.threads)
            np.save(pred_dir / f"{name}_fold{k}.npy", np.stack([te, pred]))
            m = compute_metrics(y[te], pred)
            row = {"model": name, "fold": k, "n_test": len(te), "accuracy": m["accuracy"], "macro_f1": m["macro_f1"],
                   "nar": m["nar"], "fnr": m["fnr"], "dig_miss_rate": m["dig_miss_rate"],
                   "minutes": round((time.perf_counter() - t0) / 60, 1)}
            done = pd.concat([done, pd.DataFrame([row])], ignore_index=True)
            done.to_csv(fold_csv, index=False)
            print(f"{name:18s} fold {k}  acc {m['accuracy']:.2%}  F1 {m['macro_f1']:.3f}  "
                  f"dig-miss {m['dig_miss_rate']:.2%}  ({row['minutes']} min)", flush=True)

    # summaries: mean ± std over folds, plus metrics pooled over every held-out prediction
    rows = []
    for name, g in done.groupby("model", sort=False):
        if len(g) < len(folds):
            continue
        parts = [np.load(pred_dir / f"{name}_fold{k}.npy") for k in range(len(folds))]
        idx, pred = np.concatenate([p[0] for p in parts]), np.concatenate([p[1] for p in parts])
        pooled = compute_metrics(y[idx], pred)
        pooled["per_group_accuracy"] = (
            pd.DataFrame({"g": meta[args.protocol].to_numpy()[idx], "ok": y[idx] == pred})
            .groupby("g")["ok"].mean().describe().round(4).to_dict())
        (RESULTS_DIR / f"cross_{args.protocol}_{name}.json").write_text(json.dumps(pooled, indent=2))
        rows.append({"model": name, "folds": len(g),
                     **{f"{c}_mean": g[c].mean() for c in ("accuracy", "macro_f1", "nar", "fnr", "dig_miss_rate")},
                     "accuracy_std": g["accuracy"].std(), "pooled_accuracy": pooled["accuracy"]})
    summary = pd.DataFrame(rows).round(4)
    summary.to_csv(RESULTS_DIR / f"cross_{args.protocol}.csv", index=False)
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
