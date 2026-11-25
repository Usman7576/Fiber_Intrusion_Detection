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

def crop_resize(x: np.ndarray, rng: np.random.Generator, min_frac: float = 0.8) -> np.ndarray:
    """Cut a random window of 80-100% of the time axis and stretch it back to full length
    (linear interpolation): simulates slightly faster/slower events."""
    t = x.shape[1]
    w = int(rng.uniform(min_frac, 1.0) * t)
    if w >= t:
        return x
    start = rng.integers(0, t - w + 1)
    src = np.linspace(0, w - 1, t)
    seg = x[:, start:start + w]
    return np.stack([np.interp(src, np.arange(w), ch) for ch in seg]).astype(np.float32)


def augment(x: np.ndarray, rng: np.random.Generator, crop: bool = False) -> np.ndarray:
    """Random, label-preserving perturbations of a (points, time) sample.
    `crop=True` also applies random crop + resize with probability 0.5."""
    x = x.copy()
    if crop and rng.random() < 0.5:
        x = crop_resize(x, rng)
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


# ---------------------------------------------------------------- display (backend / UI)

def display_signal(raw: np.ndarray, factor: int = DOWNSAMPLE) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Split a raw (time, points) sample into what the UI draws and what the per-point model needs.

    Returns
        display   (points, time//factor) float32: pooled signal minus each point's mean, divided by ONE global std,
                  so the waterfall shows *which* points vibrate (per-point z-scoring would make all look alike)
        to_model  (points,) float32: display * to_model[:, None] == preprocess(raw, mode="channel") (pooling is
                  linear, so this is exact up to float rounding)
        point_std (points,) float32: raw per-point standard deviation, a proxy for where along the fiber the event is
    """
    x = raw.astype(np.float64)
    mean_c, std_c = x.mean(0), x.std(0)
    centred = x - mean_c
    s_global = centred.std() + _EPS
    display = downsample(centred / s_global, factor).T
    to_model = s_global / (std_c + _EPS)
    return (np.ascontiguousarray(display, dtype=np.float32), to_model.astype(np.float32), std_c.astype(np.float32))
