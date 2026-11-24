"""Phase 2/3 results summary (stands in for notebooks/02_results.ipynb). Reads every results/metrics_*.json.

Usage:
    python ml/scripts/summarize_results.py

Writes to results/:
    summary_table.csv       one row per run: accuracy, macro-F1, NAR, FNR, dig miss, params, latency, per-class F1
    summary_tradeoff.png    accuracy vs single-sample CPU latency (log scale), bubble size = model size
    summary_curves.png      validation accuracy per epoch for every neural run
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phiotdr.config import CLASS_NAMES, RESULTS_DIR  # noqa: E402

PAPER = {"Paper SVM (reported)": 0.826, "Paper CNN (reported)": 0.940}


def load_runs() -> pd.DataFrame:
    rows = []
    for f in sorted(RESULTS_DIR.glob("metrics_*.json")):
        m = json.loads(f.read_text())
        row = {"run": f.stem.removeprefix("metrics_"), "accuracy": m["accuracy"], "macro_f1": m["macro_f1"],
               "nar": m["nar"], "fnr": m["fnr"], "dig_miss_rate": m["dig_miss_rate"],
               "params": m.get("params"), "latency_ms": m.get("latency_ms"), "best_epoch": m.get("best_epoch"),
               "train_minutes": m.get("train_minutes")}
        row.update({f"f1_{c}": m["per_class"][c]["f1"] for c in CLASS_NAMES})
        rows.append(row)
    return pd.DataFrame(rows).sort_values("accuracy", ascending=False)


def main() -> None:
    df = load_runs()
    df.round(4).to_csv(RESULTS_DIR / "summary_table.csv", index=False)
    print(df[["run", "accuracy", "macro_f1", "dig_miss_rate", "params", "latency_ms"]].round(4).to_string(index=False))

    timed = df.dropna(subset=["latency_ms"])
    fig, ax = plt.subplots(figsize=(8, 5))
    for r in timed.itertuples():
        size = 40 + 260 * (r.params or 0) / max(timed["params"].max(), 1)
        ax.scatter(r.latency_ms, r.accuracy * 100, s=size, alpha=0.7)
        ax.annotate(r.run, (r.latency_ms, r.accuracy * 100), textcoords="offset points", xytext=(6, 4), fontsize=8)
    for name, acc in PAPER.items():
        ax.axhline(acc * 100, ls="--", lw=0.8, color="grey")
        ax.text(timed["latency_ms"].min(),acc * 100 + 0.2, name, fontsize=8, color="grey")
    ax.set_xscale("log")
    ax.set_xlabel("single-sample CPU latency, ms (log)")
    ax.set_ylabel("test accuracy, %")
    ax.set_title("Accuracy vs speed on the official test split (bubble = parameter count)")
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "summary_tradeoff.png", dpi=130)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 5))
    for f in sorted(RESULTS_DIR.glob("history_*.csv")):
        h = pd.read_csv(f)
        ax.plot(h["epoch"], h["val_acc"] * 100, lw=1.2, label=f.stem.removeprefix("history_"))
    ax.set_xlabel("epoch")
    ax.set_ylabel("validation accuracy, %")
    ax.set_ylim(80, 100)
    ax.set_title("Validation accuracy per epoch")
    ax.legend(fontsize=8, ncol=2)
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "summary_curves.png", dpi=130)
    plt.close(fig)


if __name__ == "__main__":
    main()
