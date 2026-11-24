"""Phase 4.2 — explainability figures for the report.

Usage:
    python ml/scripts/explain_report.py --run net1d_dig2          # CNN explanations + faithfulness check
    python ml/scripts/explain_report.py --shap                    # SVM feature importance via SHAP

Writes to results/explain/:
    <run>_<class>.png             input waterfall, Integrated-Gradients map, Grad-CAM curve, probabilities
    <run>_point_importance.png    average share of attribution per fiber point, per class
    <run>_faithfulness.json       deletion test: replacing the window Grad-CAM marks as important with real background
                                  should hurt the prediction more than replacing a random window
    shap_top_features.png, shap_by_feature_type.png, shap_by_point.png, shap_summary.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phiotdr.config import CLASS_NAMES, MODELS_DIR, NUM_POINTS, PROCESSED_DIR, RESULTS_DIR, SEED  # noqa: E402
from phiotdr.explain import explain, gradcam_time, integrated_gradients  # noqa: E402
from phiotdr.models import build_model  # noqa: E402
from phiotdr.train import load_split  # noqa: E402

OUT = RESULTS_DIR / "explain"


def load_run(run: str):
    cfg = json.loads((MODELS_DIR / f"{run}.json").read_text())
    model = build_model(cfg["model"])
    model.load_state_dict(torch.load(MODELS_DIR / f"{run}.pt", weights_only=True))
    return model.eval(), cfg


@torch.no_grad()
def batch_proba(model, X: np.ndarray) -> np.ndarray:
    return torch.softmax(model(torch.from_numpy(X.astype(np.float32))), 1).numpy()


def example_figure(model, x: np.ndarray, label: int, path: Path) -> None:
    e = explain(model, x)
    t = np.arange(x.shape[1])
    fig = plt.figure(figsize=(11, 7))
    gs = fig.add_gridspec(3, 2, width_ratios=[4, 1], height_ratios=[2, 2, 1.2], hspace=0.35, wspace=0.25)
    ax0 = fig.add_subplot(gs[0, 0])
    v = np.percentile(np.abs(x), 99)
    ax0.imshow(x, aspect="auto", cmap="inferno", vmin=-v, vmax=v, extent=[0, x.shape[1], NUM_POINTS + 0.5, 0.5])
    ax0.set_ylabel("fiber point")
    ax0.set_title(f"input (true: {CLASS_NAMES[label]}, predicted: {e['predicted']} "
                  f"{e['probabilities'][e['predicted']]:.1%})")
    ax1 = fig.add_subplot(gs[1, 0], sharex=ax0)
    ax1.imshow(np.array(e["map"]), aspect="auto", cmap="magma", extent=[0, x.shape[1], NUM_POINTS + 0.5, 0.5])
    ax1.set_ylabel("fiber point")
    ax1.set_title("Integrated Gradients |attribution| (where + when)")
    ax2 = fig.add_subplot(gs[2, 0], sharex=ax0)
    ax2.fill_between(t, e["time_importance"], color="#22D3EE", alpha=0.6)
    ax2.set_ylim(0, 1.05)
    ax2.set_xlabel("time step (downsampled)")
    ax2.set_title("Grad-CAM over time (when)")
    axp = fig.add_subplot(gs[:2, 1])
    axp.barh(CLASS_NAMES, [e["probabilities"][c] for c in CLASS_NAMES], color="#0E7490")
    axp.invert_yaxis()
    axp.set_xlim(0, 1)
    axp.set_title("class probability")
    axq = fig.add_subplot(gs[2, 1])
    axq.bar(range(1, NUM_POINTS + 1), e["point_importance"], color="#F59E0B")
    axq.set_title("share per point")
    axq.set_xticks([1, 6, 12])
    fig.savefig(path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def faithfulness(model, X: np.ndarray, y: np.ndarray, fracs=(0.1, 0.2, 0.3), n: int = 300) -> dict:
    """Deletion test on event samples: overwrite one contiguous window (a fraction of the time axis) with the same
    window cut from a random real background recording, either where Grad-CAM puts the most mass or at a random
    position, and measure how much the probability of the originally predicted class falls.
    If Grad-CAM points at the evidence, its window should hurt more than a random one.
    (Zero-filling and scattered single steps were tried first: both create artefacts the model reacts to more
    strongly than to the content removed, so the comparison was meaningless.)"""
    rng = np.random.default_rng(SEED)
    bg = np.flatnonzero(y == 0)
    idx = rng.choice(np.flatnonzero(y != 0), n, replace=False)
    Xs, ys = X[idx].astype(np.float32), y[idx]
    p0 = batch_proba(model, Xs)
    pred = p0.argmax(1)
    cams = [gradcam_time(model, Xs[i], int(pred[i])) for i in range(n)]
    rows = np.arange(n)
    out = {"n_event_samples": n, "accuracy_original": float((pred == ys).mean()), "by_fraction": {}}
    for frac in fracs:
        k = int(frac * Xs.shape[2])
        X_cam, X_rnd = Xs.copy(), Xs.copy()
        for i in range(n):
            fill = X[rng.choice(bg)].astype(np.float32)
            s = int(np.convolve(cams[i], np.ones(k), mode="valid").argmax())
            X_cam[i][:, s:s + k] = fill[:, s:s + k]
            r = int(rng.integers(0, Xs.shape[2] - k + 1))
            X_rnd[i][:, r:r + k] = fill[:, r:r + k]
        p_cam, p_rnd = batch_proba(model, X_cam), batch_proba(model, X_rnd)
        d_cam, d_rnd = p0[rows, pred] - p_cam[rows, pred], p0[rows, pred] - p_rnd[rows, pred]
        out["by_fraction"][str(frac)] = {
            "accuracy_gradcam_window": float((p_cam.argmax(1) == ys).mean()),
            "accuracy_random_window": float((p_rnd.argmax(1) == ys).mean()),
            "prob_drop_gradcam": float(d_cam.mean()), "prob_drop_random": float(d_rnd.mean()),
            "per_class": {CLASS_NAMES[c]: {"gradcam": round(float(d_cam[ys == c].mean()), 4),
                                           "random": round(float(d_rnd[ys == c].mean()), 4)}
                          for c in range(1, len(CLASS_NAMES))},
        }
    return out


def point_importance(model, X: np.ndarray, y: np.ndarray, per_class: int = 40) -> np.ndarray:
    rng = np.random.default_rng(SEED)
    out = np.zeros((len(CLASS_NAMES), NUM_POINTS))
    for c in range(len(CLASS_NAMES)):
        for i in rng.choice(np.flatnonzero(y == c), per_class, replace=False):
            a = np.abs(integrated_gradients(model, X[i].astype(np.float32), c, steps=16)).sum(1)
            out[c] += a / a.sum()
    return out / per_class


def cnn_report(run: str) -> None:
    model, cfg = load_run(run)
    X, y, _ = load_split("test", cfg.get("normalise", "sample"))
    probs = np.concatenate([batch_proba(model, X[i:i + 512]) for i in range(0, len(y), 512)])
    rng = np.random.default_rng(SEED)
    for c, name in enumerate(CLASS_NAMES):
        ok = np.flatnonzero((y == c) & (probs.argmax(1) == c))
        example_figure(model, X[rng.choice(ok)].astype(np.float32), c, OUT / f"{run}_{name}.png")
        print("figure", name)

    pi = point_importance(model, X, y)
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for c, name in enumerate(CLASS_NAMES):
        ax.plot(range(1, NUM_POINTS + 1), pi[c], marker="o", label=name)
    ax.set_xlabel("fiber point")
    ax.set_ylabel("share of |IG| attribution")
    ax.set_xticks(range(1, NUM_POINTS + 1))
    ax.set_title(f"Which fiber points {run} relies on, per class (40 test samples each)")
    ax.legend(ncol=3)
    fig.tight_layout()
    fig.savefig(OUT / f"{run}_point_importance.png", dpi=130)
    plt.close(fig)

    faith = faithfulness(model, X, y)
    faith["point_importance"] = {n: pi[c].round(4).tolist() for c, n in enumerate(CLASS_NAMES)}
    (OUT / f"{run}_faithfulness.json").write_text(json.dumps(faith, indent=2))
    for frac, r in faith["by_fraction"].items():
        print(f"remove {frac}: prob drop gradcam {r['prob_drop_gradcam']:.3f} vs random {r['prob_drop_random']:.3f}",
              {c: (v["gradcam"], v["random"]) for c, v in r["per_class"].items()})


def shap_report(n_explain: int = 300) -> None:
    """SHAP for the tuned SVM through a random-forest surrogate trained to imitate it (KernelExplainer on a
    384-feature RBF SVM is far too slow on a laptop). Fidelity = how often the surrogate agrees with the SVM."""
    import joblib
    import shap
    from sklearn.ensemble import RandomForestClassifier

    from phiotdr.features import FEATURE_NAMES, feature_names

    svm = joblib.load(MODELS_DIR / "svm.joblib")
    Ftr, Fte = np.load(PROCESSED_DIR / "train_feat.npy"), np.load(PROCESSED_DIR / "test_feat.npy")
    yte = np.load(PROCESSED_DIR / "test_y.npy")
    svm_tr, svm_te = svm.predict(Ftr), svm.predict(Fte)
    rf = RandomForestClassifier(n_estimators=200, max_depth=14, n_jobs=2, random_state=SEED).fit(Ftr, svm_tr)
    fidelity = float((rf.predict(Fte) == svm_te).mean())
    print(f"surrogate fidelity {fidelity:.2%}, surrogate accuracy {(rf.predict(Fte) == yte).mean():.2%}")

    idx = np.random.default_rng(SEED).choice(len(Fte), n_explain, replace=False)
    sv = shap.TreeExplainer(rf).shap_values(Fte[idx])                 # (n, 384, 6) or list of 6 x (n, 384)
    sv = np.stack(sv, -1) if isinstance(sv, list) else sv
    imp = np.abs(sv).mean(axis=(0, 2))                                 # (384,)
    names = np.array(feature_names())

    top = np.argsort(imp)[::-1][:20]
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.barh(names[top][::-1], imp[top][::-1], color="#22D3EE")
    ax.set_xlabel("mean |SHAP| (all classes)")
    ax.set_title("Top 20 SVM features (via random-forest surrogate)")
    fig.tight_layout()
    fig.savefig(OUT / "shap_top_features.png", dpi=130)
    plt.close(fig)

    by_type = {f"{kind}_{f}": float(imp[[i for i, n in enumerate(names) if n.endswith(f"_{kind}_{f}")]].sum())
               for kind in ("raw", "diff") for f in FEATURE_NAMES}
    by_type = dict(sorted(by_type.items(), key=lambda kv: -kv[1]))
    fig, ax = plt.subplots(figsize=(8, 7))
    ax.barh(list(by_type)[::-1], list(by_type.values())[::-1], color="#F59E0B")
    ax.set_xlabel("summed mean |SHAP| over the 12 points")
    ax.set_title("SVM feature importance by feature type")
    fig.tight_layout()
    fig.savefig(OUT / "shap_by_feature_type.png", dpi=130)
    plt.close(fig)

    by_point = [float(imp[[i for i, n in enumerate(names) if n.startswith(f"p{p:02d}_")]].sum()) for p in range(12)]
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.bar(range(1, 13), by_point, color="#10B981")
    ax.set_xlabel("fiber point")
    ax.set_ylabel("summed mean |SHAP|")
    ax.set_xticks(range(1, 13))
    ax.set_title("SVM feature importance by fiber point")
    fig.tight_layout()
    fig.savefig(OUT / "shap_by_point.png", dpi=130)
    plt.close(fig)

    summary = {"surrogate_fidelity": fidelity, "n_explained": n_explain,
               "top_features": {names[i]: round(float(imp[i]), 5) for i in top},
               "by_feature_type": {k: round(v, 5) for k, v in by_type.items()},
               "by_point": [round(v, 5) for v in by_point]}
    (OUT / "shap_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: summary[k] for k in ("surrogate_fidelity", "by_point")}, indent=2))
    print(list(by_type.items())[:6])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", help="trained CNN run name in ml/models/")
    ap.add_argument("--shap", action="store_true")
    ap.add_argument("--threads", type=int, default=2)
    args = ap.parse_args()
    torch.set_num_threads(args.threads)
    OUT.mkdir(parents=True, exist_ok=True)
    if args.run:
        cnn_report(args.run)
    if args.shap:
        shap_report()


if __name__ == "__main__":
    main()
