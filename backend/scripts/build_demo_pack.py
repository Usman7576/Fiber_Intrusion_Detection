"""Build the small sample pack the backend serves (the 2 GB dataset cannot ship with the app).

Usage (needs the raw dataset under ml/data/raw and the processed cache):
    python backend/scripts/build_demo_pack.py [--per-class 50]

Picks official *test* samples: a fixed random `--per-class` per class, plus every sample the deployed model gets wrong,
so the demo shows realistic mistakes too. For each sample it stores

    display    (12, 1000) float16   time-pooled signal minus each point's mean, divided by ONE global std:
                                    keeps how much each fiber point vibrates (for the waterfall), drops DC offsets
    to_model   (12,)      float32   per-point factor: display * to_model == the deployed model's input
                                    (per-point z-score then pooling, see phiotdr.preprocess) -- exact, as pooling is linear
    point_std  (12,)      float32   raw per-point std (event location along the fiber)
    features   (384,)     float32   SVM features (for the model comparison)

Writes backend/app/data/demo_pack.npz and backend/app/data/demo_index.csv.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from phiotdr.config import DEPLOYED_RUN, MODELS_DIR, PROCESSED_DIR, RAW_DIR, SEED
from phiotdr.data_loader import load_mat, session_id
from phiotdr.models import build_model
from phiotdr.preprocess import display_signal, preprocess

OUT = Path(__file__).resolve().parents[1] / "app" / "data"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--per-class", type=int, default=50)
    args = ap.parse_args()

    meta = pd.read_csv(PROCESSED_DIR / "test_meta.csv")
    y = np.load(PROCESSED_DIR / "test_y.npy")
    feats = np.load(PROCESSED_DIR / "test_feat.npy")
    cfg = json.loads((MODELS_DIR / f"{DEPLOYED_RUN}.json").read_text())
    assert cfg["normalise"] == "channel", "pack assumes a per-point normalised model"
    model = build_model(cfg["model"])
    model.load_state_dict(torch.load(MODELS_DIR / f"{DEPLOYED_RUN}.pt", weights_only=True))
    model.eval()
    Xc = np.load(PROCESSED_DIR / "test_X_channel.npy")
    with torch.no_grad():
        pred = np.concatenate([model(torch.from_numpy(Xc[i:i + 512].astype(np.float32))).argmax(1).numpy()
                               for i in range(0, len(y), 512)])

    rng = np.random.default_rng(SEED)
    chosen = set(np.flatnonzero(pred != y).tolist())
    for c in np.unique(y):
        chosen |= set(rng.choice(np.flatnonzero(y == c), args.per_class, replace=False).tolist())
    chosen = sorted(chosen)
    print(f"{len(chosen)} samples ({int((pred != y).sum())} misclassified by {DEPLOYED_RUN})")

    disp, scale, pstd, max_err = [], [], [], 0.0
    for i in chosen:
        raw = load_mat(RAW_DIR / "test" / meta.loc[i, "rel_path"])
        d, s, p = display_signal(raw)
        model_in = d * s[:, None]
        max_err = max(max_err, float(np.abs(model_in - preprocess(raw, mode="channel")).max()))
        disp.append(d.astype(np.float16))
        scale.append(s)
        pstd.append(p)
    print(f"max |display*to_model - model input| = {max_err:.2e} (before float16 storage)")
    assert max_err < 1e-3

    OUT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT / "demo_pack.npz", display=np.stack(disp), to_model=np.stack(scale),
                        point_std=np.stack(pstd), features=feats[chosen].astype(np.float32))
    idx = meta.loc[chosen, ["file", "class_name", "label", "recorder", "date"]].reset_index(drop=True)
    idx.insert(0, "id", range(len(idx)))
    idx["session"] = idx["file"].map(session_id)
    idx["official_test_index"] = chosen
    idx.to_csv(OUT / "demo_index.csv", index=False)
    size = (OUT / "demo_pack.npz").stat().st_size / 1e6
    print(f"wrote {OUT / 'demo_pack.npz'} ({size:.1f} MB) and demo_index.csv")


if __name__ == "__main__":
    main()
