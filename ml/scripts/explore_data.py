"""Phase 1 exploration figures (stands in for notebooks/01_explore.ipynb).

Usage:
    python ml/scripts/explore_data.py

Writes to results/:
    explore_waterfalls.png   one raw sample per class as a waterfall image (time x fiber point)
    explore_traces.png       the same samples as 12 stacked line traces
    explore_point_std.png    mean per-fiber-point standard deviation per class (where along the fiber the energy is)
    explore_spectra.png      average power spectrum per class (first 2,000 training samples of each class)
    explore_class_stats.csv  the numbers behind the last two figures
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phiotdr.config import CLASS_NAMES, NUM_POINTS, PROCESSED_DIR, RAW_DIR, RESULTS_DIR, SEED  # noqa: E402
from phiotdr.data_loader import SampleError, load_index, load_mat  # noqa: E402
from phiotdr.preprocess import normalise  # noqa: E402

PER_CLASS = 2000


def pick_examples(index: pd.DataFrame) -> dict[str, np.ndarray]:
    """One readable raw training sample per class (fixed seed so the figure is reproducible)."""
    out = {}
    train = index[index["split"] == "train"]
    for name in CLASS_NAMES:
        rows = train[train["class_name"] == name].sample(frac=1, random_state=SEED)
        for row in rows.itertuples():
            try:
                out[name] = normalise(load_mat(row.path))      # (10000, 12) z-scored
                break
            except (SampleError, FileNotFoundError):
                continue
    return out


def plot_waterfalls(examples: dict[str, np.ndarray], path: Path) -> None:
    fig, axes = plt.subplots(1, len(examples), figsize=(16, 5), sharey=True)
    for ax, (name, x) in zip(axes, examples.items()):
        v = np.percentile(np.abs(x), 99)
        ax.imshow(x, aspect="auto", cmap="inferno", vmin=-v, vmax=v, interpolation="nearest",
                  extent=[0.5, NUM_POINTS + 0.5, x.shape[0], 0])
        ax.set_title(name)
        ax.set_xlabel("fiber point")
        ax.set_xticks([1, 6, 12])
    axes[0].set_ylabel("time step")
    fig.suptitle("One raw sample per class (z-scored): waterfall view")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def plot_traces(examples: dict[str, np.ndarray], path: Path) -> None:
    fig, axes = plt.subplots(len(examples), 1, figsize=(12, 2.2 * len(examples)), sharex=True)
    for ax, (name, x) in zip(axes, examples.items()):
        for p in range(NUM_POINTS):
            ax.plot(x[:, p] / 6 + p, lw=0.4, color=plt.cm.viridis(p / NUM_POINTS))
        ax.set_ylabel(name)
        ax.set_yticks([])
    axes[-1].set_xlabel("time step")
    fig.suptitle("Same samples as stacked traces (one line per fiber point, offset vertically)")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def class_stats(X: np.ndarray, y: np.ndarray) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    """Per-class mean of per-point std, and average power spectrum on the cached (N, 12, 1000) data."""
    rng = np.random.default_rng(SEED)
    stds, spectra = [], []
    for c in range(len(CLASS_NAMES)):
        idx = np.flatnonzero(y == c)
        idx = rng.choice(idx, min(PER_CLASS, len(idx)), replace=False)
        x = X[idx].astype(np.float32)                                  # (n, 12, T)
        stds.append(x.std(axis=2).mean(axis=0))                        # (12,)
        x = x - x.mean(axis=2, keepdims=True)
        p = np.abs(np.fft.rfft(x * np.hanning(x.shape[2]), axis=2)) ** 2
        spectra.append(p.mean(axis=(0, 1)))                           # (T//2 + 1,)
    stds, spectra = np.array(stds), np.array(spectra)
    df = pd.DataFrame(stds, index=CLASS_NAMES, columns=[f"std_p{p + 1}" for p in range(NUM_POINTS)])
    return df, stds, spectra


def main() -> None:
    RESULTS_DIR.mkdir(exist_ok=True)
    examples = pick_examples(load_index(RAW_DIR))
    plot_waterfalls(examples, RESULTS_DIR / "explore_waterfalls.png")
    plot_traces(examples, RESULTS_DIR / "explore_traces.png")

    X, y = np.load(PROCESSED_DIR / "train_X.npy", mmap_mode="r"), np.load(PROCESSED_DIR / "train_y.npy")
    df, stds, spectra = class_stats(X, y)

    fig, ax = plt.subplots(figsize=(8, 4.5))
    for c, name in enumerate(CLASS_NAMES):
        ax.plot(range(1, NUM_POINTS + 1), stds[c], marker="o", label=name)
    ax.set_xlabel("fiber point")
    ax.set_ylabel("mean std (z-scored, downsampled)")
    ax.set_title("Where along the 12 points the vibration energy sits")
    ax.set_xticks(range(1, NUM_POINTS + 1))
    ax.legend(ncol=3)
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "explore_point_std.png", dpi=130)
    plt.close(fig)

    freqs = np.linspace(0, 1, spectra.shape[1])                       # fraction of Nyquist of the 1,000-step input
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for c, name in enumerate(CLASS_NAMES):
        ax.semilogy(freqs, spectra[c], lw=1, label=name)
    ax.set_xlabel("normalised frequency (1 = Nyquist of the downsampled signal)")
    ax.set_ylabel("mean power")
    ax.set_title("Average power spectrum per class")
    ax.legend(ncol=3)
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "explore_spectra.png", dpi=130)
    plt.close(fig)

    # spectral centroid + share of power in the lowest 10% of the band, per class
    df["spectral_centroid"] = (spectra * freqs).sum(1) / spectra.sum(1)
    df["low_band_power_share"] = spectra[:, freqs <= 0.1].sum(1) / spectra.sum(1)
    df.round(4).to_csv(RESULTS_DIR / "explore_class_stats.csv")
    print(df[["spectral_centroid", "low_band_power_share"]].round(3))
    print("figures written to", RESULTS_DIR)


if __name__ == "__main__":
    main()
