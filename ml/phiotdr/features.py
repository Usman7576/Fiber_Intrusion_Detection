"""Hand-crafted features for the SVM baseline, following the authors' feature_extraction.py.

For each of the 12 fiber points, 16 statistics are computed on the raw signal and on its first
difference along time -> 12 x 32 = 384 features per sample. Vectorised over fiber points.

Deliberate fix vs. the authors' code: the first difference is computed in signed integers.
Their code subtracts uint16 arrays, so negative steps wrap around to ~65,000.
"""

from __future__ import annotations

import numpy as np
from scipy.stats import kurtosis

FEATURE_NAMES = [
    "max", "min", "peak_to_peak", "mean", "spectral_energy", "var", "std", "rms", "arv",
    "waveform_factor", "pulse_factor", "crest_factor", "margin_factor", "kurtosis",
    "kurtosis_factor", "spectral_entropy",
]
_EPS = 1e-12


def column_features(x: np.ndarray) -> np.ndarray:
    """(time, points) -> (points, 16) statistics per fiber point."""
    x = x.astype(np.float64, copy=False)
    n = x.shape[0]
    spec = np.abs(np.fft.rfft(x, axis=0))[1 : n // 2 + 1]

    mx, mn, mean = x.max(0), x.min(0), x.mean(0)
    var, std = x.var(0), x.std(0)
    rms = np.sqrt(mean**2 + std**2)
    arv = np.abs(x).mean(0)
    energy = (spec**2).sum(0) / spec.shape[0]
    p = spec / (spec.sum(0, keepdims=True) + _EPS)
    entropy = -(p * np.log2(p + 1e-5)).sum(0)

    feats = np.stack([
        mx, mn, mx - mn, mean, energy, var, std, rms, arv,
        rms / (arv + _EPS),                                   # waveform factor
        mx / (arv + _EPS),                                    # pulse factor
        mx / (rms + _EPS),                                    # crest (peak) factor
        mx / (np.sqrt(np.abs(x)).mean(0) ** 2 + _EPS),        # margin factor
        kurtosis(x, axis=0, fisher=True, bias=False),         # = pandas Series.kurt()
        (x**4).mean(0) / (rms**4 + _EPS),                     # kurtosis factor
        entropy,
    ], axis=1)
    return np.nan_to_num(feats, nan=0.0, posinf=0.0, neginf=0.0)


def sample_features(raw: np.ndarray) -> np.ndarray:
    """Raw (10000, 12) sample -> flat (384,) vector: per point [16 raw stats, 16 diff stats]."""
    raw = raw.astype(np.int64)
    diff = np.diff(raw, axis=0)
    return np.concatenate([column_features(raw), column_features(diff)], axis=1).reshape(-1).astype(np.float32)


def feature_names(num_points: int = 12) -> list[str]:
    """Names matching sample_features' output order, e.g. 'p05_diff_kurtosis'."""
    return [f"p{p:02d}_{kind}_{f}" for p in range(num_points) for kind in ("raw", "diff") for f in FEATURE_NAMES]
