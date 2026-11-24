"""Explanations for single predictions, shared by the report scripts and the backend.

For a 1D CNN taking (12 fiber points x T time steps):
    gradcam_time(model, x, target)        -> (T,)     Grad-CAM on the last conv block: *when* the event happened
    integrated_gradients(model, x, target) -> (12, T) per-point, per-time attribution (signed)
    explain(model, x)                      -> dict with probabilities, prediction and normalised importance arrays

All inputs are preprocessed samples (12, T) float32 numpy arrays, exactly what the model sees.
"""

from __future__ import annotations

import numpy as np
import torch
from captum.attr import IntegratedGradients, LayerGradCam
from torch import nn

from .config import CLASS_NAMES


def _last_conv_block(model: nn.Module) -> nn.Module:
    if not hasattr(model, "features"):
        raise TypeError(f"{type(model).__name__} has no .features block to attach Grad-CAM to")
    return model.features[-1]


def _as_batch(x: np.ndarray) -> torch.Tensor:
    return torch.from_numpy(np.ascontiguousarray(x, dtype=np.float32))[None]


def gradcam_time(model: nn.Module, x: np.ndarray, target: int) -> np.ndarray:
    """Grad-CAM over time (ReLU'd, upsampled linearly to the input length, scaled to [0, 1])."""
    model.eval()
    cam = LayerGradCam(model, _last_conv_block(model)).attribute(_as_batch(x), target=target, relu_attributions=True)
    cam = cam.detach()[0].mean(0)                                         # (T',) average over channels if any remain
    cam = torch.nn.functional.interpolate(cam[None, None], size=x.shape[-1], mode="linear", align_corners=False)[0, 0]
    cam = cam.numpy()
    return cam / cam.max() if cam.max() > 0 else cam


def integrated_gradients(model: nn.Module, x: np.ndarray, target: int, steps: int = 32) -> np.ndarray:
    """Integrated Gradients from an all-zero baseline (= the per-sample mean after z-scoring)."""
    model.eval()
    inp = _as_batch(x).requires_grad_(True)
    attr = IntegratedGradients(model).attribute(inp, baselines=torch.zeros_like(inp), target=target, n_steps=steps,
                                                internal_batch_size=steps)
    return attr.detach()[0].numpy()


def _smooth(v: np.ndarray, width: int) -> np.ndarray:
    k = np.ones(width) / width
    return np.convolve(v, k, mode="same")


@torch.no_grad()
def predict_proba(model: nn.Module, x: np.ndarray) -> np.ndarray:
    model.eval()
    return torch.softmax(model(_as_batch(x)), 1)[0].numpy()


def explain(model: nn.Module, x: np.ndarray, target: int | None = None, ig_steps: int = 32) -> dict:
    """Everything the UI needs to show why the model decided what it did.

    Returns plain lists/floats (JSON-ready):
        probabilities   {class: p}
        predicted       class name;  target = explained class (default: the predicted one)
        time_importance (T,)  Grad-CAM, 0..1
        point_importance (12,) share of total |IG| per fiber point, sums to 1
        map             (12, T) |IG| smoothed over time and scaled to 0..1
    """
    probs = predict_proba(model, x)
    pred = int(probs.argmax())
    target = pred if target is None else target
    ig = np.abs(integrated_gradients(model, x, target, ig_steps))
    smooth = np.stack([_smooth(row, max(3, x.shape[-1] // 100)) for row in ig])
    point = ig.sum(1)
    return {
        "probabilities": {c: float(p) for c, p in zip(CLASS_NAMES, probs)},
        "predicted": CLASS_NAMES[pred],
        "target": CLASS_NAMES[target],
        "time_importance": gradcam_time(model, x, target).round(4).tolist(),
        "point_importance": (point / point.sum()).round(4).tolist() if point.sum() > 0 else point.tolist(),
        "map": (smooth / smooth.max() if smooth.max() > 0 else smooth).round(4).tolist(),
    }
