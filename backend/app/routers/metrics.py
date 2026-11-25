"""Model comparison numbers for the Models page, read from results/ (written by the ml/ scripts)."""

from __future__ import annotations

import json
from functools import lru_cache

import pandas as pd
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from phiotdr.config import CLASS_NAMES, RESULTS_DIR

from ..services.inference import Engine
from .deps import engine

router = APIRouter(tags=["metrics"])

# results file name -> (display name, short description, name used by the cross-validation files)
FEATURED = {
    "paper_cnn_long": ("Paper CNN", "Cao et al. 2023 2D CNN, reproduced", "paper_cnn"),
    "svm_tuned": ("Tuned SVM", "384 hand-crafted features, RBF SVM (C=10, gamma=0.001)", "svm"),
    "net1d_dig2": ("Net1D (per-sample norm)", "lightweight 1D CNN, digging weighted 2x", "net1d_dig2"),
    "net1d_dig2_chnorm": ("Net1D (per-point norm)", "lightweight 1D CNN, each fiber point z-scored", "net1d_dig2_chnorm"),
}
PAPER_REPORTED = {"svm": 0.826, "cnn": 0.940}


class ModelMetrics(BaseModel):
    run: str
    name: str
    description: str
    deployed: bool
    accuracy: float
    macro_f1: float
    nar: float
    fnr: float
    dig_miss_rate: float
    params: int | None
    latency_ms: float | None
    per_class_f1: dict[str, float]
    confusion_matrix: list[list[int]]
    unseen_sessions_accuracy: float | None
    unseen_days_accuracy: float | None
    unseen_days_dig_miss_rate: float | None


class MetricsOut(BaseModel):
    classes: list[str]
    deployed: str
    test_samples: int
    paper_reported: dict[str, float]
    models: list[ModelMetrics]


@lru_cache(maxsize=4)
def _load(deployed: str) -> dict:
    def cross(protocol: str) -> pd.DataFrame:
        f = RESULTS_DIR / f"cross_{protocol}.csv"
        return pd.read_csv(f).set_index("model") if f.exists() else pd.DataFrame()

    sess, days = cross("session"), cross("date")
    models, n_test = [], 0
    for run, (name, desc, cv_name) in FEATURED.items():
        f = RESULTS_DIR / f"metrics_{run}.json"
        if not f.exists():
            continue
        m = json.loads(f.read_text())
        n_test = m.get("n_samples", n_test)

        def cv(df: pd.DataFrame, col: str, key: str = cv_name) -> float | None:
            return round(float(df.loc[key, col]), 4) if key in df.index else None

        models.append({
            "run": run, "name": name, "description": desc, "deployed": run == deployed,
            "accuracy": m["accuracy"], "macro_f1": m["macro_f1"], "nar": m["nar"], "fnr": m["fnr"],
            "dig_miss_rate": m["dig_miss_rate"], "params": m.get("params"), "latency_ms": m.get("latency_ms"),
            "per_class_f1": {c: round(m["per_class"][c]["f1"], 4) for c in CLASS_NAMES},
            "confusion_matrix": m["confusion_matrix"],
            "unseen_sessions_accuracy": cv(sess, "accuracy_mean"),
            "unseen_days_accuracy": cv(days, "accuracy_mean"),
            "unseen_days_dig_miss_rate": cv(days, "dig_miss_rate_mean"),
        })
    return {"classes": CLASS_NAMES, "deployed": deployed, "test_samples": n_test,
            "paper_reported": PAPER_REPORTED, "models": models}


@router.get("/metrics", response_model=MetricsOut)
def metrics(eng: Engine = Depends(engine)):
    """Official-split test metrics plus accuracy on unseen recording sessions and unseen recording days."""
    return _load(eng.run)
