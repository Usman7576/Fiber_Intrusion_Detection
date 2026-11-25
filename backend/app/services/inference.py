"""Model loading, prediction and explanation. Uses the same `phiotdr` code as training, so preprocessing is identical."""

from __future__ import annotations

import io
import json
import time
from collections import OrderedDict
from dataclasses import dataclass

import joblib
import numpy as np
import pandas as pd
import torch

from phiotdr.config import ALERT_LEVELS, CLASS_NAMES, MODELS_DIR, THREAT_CLASSES
from phiotdr.data_loader import load_mat
from phiotdr.explain import explain
from phiotdr.features import sample_features
from phiotdr.models import build_model, count_params
from phiotdr.preprocess import display_signal, preprocess

from ..settings import Settings

SIGNAL_POINTS = 500          # time resolution sent to the browser for plots
# Plotted signals are in multiples of this raw level (ADC counts): about the noise of quiet fiber in this dataset
# (median per-point std of background samples ~18-23). A fixed unit keeps quiet fiber dark and events bright in the
# waterfall; scaling each sample by its own std would make background look as active as digging.
NOISE_REF = 25.0
EXPLAIN_BINS = 100           # time resolution of explanation maps


def pool_time(a: np.ndarray, n: int) -> np.ndarray:
    """Mean-pool the last axis down to n bins (length must be a multiple of n)."""
    return a.reshape(*a.shape[:-1], n, a.shape[-1] // n).mean(-1)


def alert_level(cls: str, confidence: float, threshold: float) -> str:
    return "uncertain" if confidence < threshold else ALERT_LEVELS[cls]


def point_energy(point_std: np.ndarray) -> np.ndarray:
    """Relative vibration per fiber point. The median point is taken as the quiet floor so the event stands out."""
    e = np.clip(point_std - np.median(point_std), 0, None)
    return e / e.max() if e.max() > 0 else np.zeros_like(e)


@dataclass
class Prepared:
    """A sample ready for every model: deployed-model input, plot signal, location info, SVM features (optional)."""
    model_input: np.ndarray          # (12, 1000) float32
    display: np.ndarray              # (12, 1000) float32, in NOISE_REF units (for plots / the live waterfall)
    point_std: np.ndarray            # (12,)
    features: np.ndarray | None      # (384,)
    prep_ms: float = 0.0
    sample_input: np.ndarray | None = None   # (12, 1000) per-sample z-scored input for the paper CNN baseline


class DemoSamples:
    """The official-test samples shipped with the app (see backend/scripts/build_demo_pack.py)."""

    def __init__(self, settings: Settings):
        pack = np.load(settings.demo_pack)
        self.display = pack["display"].astype(np.float32)
        self.to_model = pack["to_model"]
        self.point_std = pack["point_std"]
        self.features = pack["features"]
        self.s_scale = pack["to_sample_scale"] if "to_sample_scale" in pack else None
        self.s_offset = pack["to_sample_offset"] if "to_sample_offset" in pack else None
        self.index = pd.read_csv(settings.demo_index, dtype={"date": str})
        self.index["recorder"] = self.index["recorder"].fillna("unknown")

    def __len__(self) -> int:
        return len(self.index)

    def info(self, i: int) -> dict:
        r = self.index.iloc[i]
        return {"id": int(r["id"]), "file": r["file"], "true_label": r["class_name"], "recorder": r["recorder"],
                "date": str(r["date"]), "session": r["session"]}

    def prepared(self, i: int) -> Prepared:
        d = self.display[i]
        sample_in = None if self.s_scale is None else d * self.s_scale[i] + self.s_offset[i][:, None]
        to_raw = float((self.to_model[i] * self.point_std[i]).mean())       # = the sample's global std, raw units
        return Prepared(d * self.to_model[i][:, None], d * (to_raw / NOISE_REF), self.point_std[i], self.features[i],
                        0.0, sample_in)


class Engine:
    def __init__(self, settings: Settings):
        self.settings = settings
        torch.set_num_threads(settings.torch_threads)
        cfg = json.loads((MODELS_DIR / f"{settings.model_run}.json").read_text())
        self.run, self.normalise, self.downsample = settings.model_run, cfg["normalise"], cfg["downsample"]
        self.model = build_model(cfg["model"])
        self.model.load_state_dict(torch.load(MODELS_DIR / f"{self.run}.pt", weights_only=True, map_location="cpu"))
        self.model.eval()
        self.params = count_params(self.model)
        self.svm = joblib.load(MODELS_DIR / "svm.joblib") if settings.load_svm else None
        self.baseline, self.baseline_run = None, settings.baseline_run
        if self.baseline_run:                                  # paper CNN, for the model comparison
            bcfg = json.loads((MODELS_DIR / f"{self.baseline_run}.json").read_text())
            self.baseline_norm = bcfg["normalise"]
            self.baseline = build_model(bcfg["model"])
            self.baseline.load_state_dict(torch.load(MODELS_DIR / f"{self.baseline_run}.pt", weights_only=True,
                                                     map_location="cpu"))
            self.baseline.eval()
        self.samples = DemoSamples(settings)
        self._explain_cache: OrderedDict[int, dict] = OrderedDict()
        self.predict_prepared(self.samples.prepared(0))       # warm-up so the first request is not slow

    # ------------------------------------------------------------ preparation
    def prepare_upload(self, data: bytes) -> Prepared:
        """Raw .mat bytes -> Prepared. Raises phiotdr.data_loader.SampleError on a bad file."""
        t0 = time.perf_counter()
        raw = load_mat(io.BytesIO(data))
        x = preprocess(raw, factor=self.downsample, mode=self.normalise)
        display, to_model, pstd = display_signal(raw, self.downsample)
        display = display * float((to_model * pstd).mean() / NOISE_REF)
        prep_ms = (time.perf_counter() - t0) * 1000
        feats = sample_features(raw).astype(np.float32) if self.svm is not None else None
        sample_in = (preprocess(raw, factor=self.downsample, mode=self.baseline_norm)
                     if self.baseline is not None else None)
        return Prepared(x, display, pstd, feats, prep_ms, sample_in)

    # ------------------------------------------------------------ prediction
    @torch.no_grad()
    def _net_proba(self, x: np.ndarray, model: torch.nn.Module | None = None) -> np.ndarray:
        model = model or self.model
        return torch.softmax(model(torch.from_numpy(np.ascontiguousarray(x, np.float32))[None]), 1)[0].numpy()

    def predict_prepared(self, p: Prepared, compare: bool = False, with_explanation: bool = False) -> dict:
        t0 = time.perf_counter()
        probs = self._net_proba(p.model_input)
        latency = p.prep_ms + (time.perf_counter() - t0) * 1000
        k = int(probs.argmax())
        cls, conf = CLASS_NAMES[k], float(probs[k])
        energy = point_energy(p.point_std)
        out = {
            "predicted_class": cls, "label": k, "confidence": round(conf, 4),
            "confidences": {c: round(float(v), 4) for c, v in zip(CLASS_NAMES, probs)},
            "alert_level": alert_level(cls, conf, self.settings.confidence_threshold),
            "is_threat": cls in THREAT_CLASSES and conf >= self.settings.confidence_threshold,
            "latency_ms": round(latency, 2), "top_point": int(np.argmax(p.point_std)) + 1,
            "point_energy": energy.round(3).tolist(), "model": self.run,
        }
        if compare:
            out["compare"] = self.compare(p, probs, latency)
        if with_explanation:
            out["explanation"] = self.explanation(p.model_input)
        return out

    def compare(self, p: Prepared, net_probs: np.ndarray, net_ms: float) -> list[dict]:
        votes = [self._vote(self.run, net_probs, net_ms)]
        if self.svm is not None and p.features is not None:
            t0 = time.perf_counter()
            sp = self.svm.predict_proba(p.features[None])[0]
            votes.append(self._vote("svm_tuned", sp, (time.perf_counter() - t0) * 1000))
        if self.baseline is not None and p.sample_input is not None:
            t0 = time.perf_counter()
            bp = self._net_proba(p.sample_input, self.baseline)
            votes.append(self._vote(self.baseline_run, bp, (time.perf_counter() - t0) * 1000))
        return votes

    @staticmethod
    def _vote(name: str, probs: np.ndarray, ms: float) -> dict:
        k = int(np.argmax(probs))
        return {"model": name, "predicted_class": CLASS_NAMES[k], "confidence": round(float(probs[k]), 4),
                "confidences": {c: round(float(v), 4) for c, v in zip(CLASS_NAMES, probs)},
                "latency_ms": round(ms, 2)}

    # ------------------------------------------------------------ explanation
    def explanation(self, model_input: np.ndarray, cache_key: int | None = None) -> dict:
        if cache_key is not None and cache_key in self._explain_cache:
            self._explain_cache.move_to_end(cache_key)
            return self._explain_cache[cache_key]
        e = explain(self.model, model_input.astype(np.float32))
        out = {
            "target": e["target"],
            "time_importance": pool_time(np.array(e["time_importance"]), EXPLAIN_BINS).round(3).tolist(),
            "point_importance": e["point_importance"],
            "map": pool_time(np.array(e["map"]), EXPLAIN_BINS).round(3).tolist(),
        }
        if cache_key is not None:
            self._explain_cache[cache_key] = out
            if len(self._explain_cache) > 256:
                self._explain_cache.popitem(last=False)
        return out


def plot_signal(display: np.ndarray) -> list[list[float]]:
    return pool_time(display, SIGNAL_POINTS).round(3).tolist()
