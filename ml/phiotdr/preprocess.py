"""Signal preprocessing shared by training and inference.

Pipeline for one sample:
    raw (10000, 12) uint16  ->  float32  ->  normalise  ->  downsample  ->  (12, 1000)

Output layout is channels-first (fiber points x time), which suits Conv1d/Conv2d.
"""

from __future__ import annotations

import numpy as np

from .config import DOWNSAMPLE, NORMALISE

_EPS = 1e-6


def normalise(x: np.ndarray, mode: str = NORMALISE) -> np.ndarray:
    """Z-score a (time, points) array. 'sample' = one mean/std, 'channel' = per fiber point."""
    x = x.astype(np.float32, copy=False)
    if mode == "sample":
        return (x - x.mean()) / (x.std() + _EPS)
    if mode == "channel":
        return (x - x.mean(axis=0, keepdims=True)) / (x.std(axis=0, keepdims=True) + _EPS)
    raise ValueError(f"unknown normalise mode {mode!r}")


def downsample(x: np.ndarray, factor: int = DOWNSAMPLE) -> np.ndarray:
    """Mean-pool the time axis (axis 0) by `factor`; trailing remainder is dropped."""
    if factor <= 1:
        return x
    t = (x.shape[0] // factor) * factor
    return x[:t].reshape(t // factor, factor, *x.shape[1:]).mean(axis=1)


def preprocess(raw: np.ndarray, factor: int = DOWNSAMPLE, mode: str = NORMALISE) -> np.ndarray:
    """Raw (time, points) sample -> model input (points, time//factor) float32."""
    x = normalise(raw, mode)
    x = downsample(x, factor)
    return np.ascontiguousarray(x.T, dtype=np.float32)


# ---------------------------------------------------------------- augmentation (train only)

def augment(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Random, label-preserving perturbations of a (points, time) sample."""
    x = x.copy()
    # circular time shift up to 25%
    x = np.roll(x, rng.integers(-x.shape[1] // 4, x.shape[1] // 4 + 1), axis=1)
    # amplitude scaling
    x *= rng.uniform(0.8, 1.2)
    # additive Gaussian noise
    x += rng.normal(0.0, 0.05, size=x.shape).astype(np.float32)
    # reverse fiber direction
    if rng.random() < 0.5:
        x = x[::-1].copy()
    return x.astype(np.float32, copy=False)
