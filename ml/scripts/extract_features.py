"""Compute the 384 SVM features for every cached sample (full-resolution .mat files, in parallel).

Order follows ml/data/processed/{split}_meta.csv so rows line up with the deep-learning cache.

Usage:
    python ml/scripts/extract_features.py [--jobs -1]
Writes ml/data/processed/{train,test}_feat.npy  (N, 384) float32
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phiotdr.config import PROCESSED_DIR, RAW_DIR  # noqa: E402
from phiotdr.data_loader import load_mat  # noqa: E402
from phiotdr.features import sample_features  # noqa: E402


def _one(path: str) -> np.ndarray:
    return sample_features(load_mat(path))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=-1)
    args = ap.parse_args()
    for split in ("train", "test"):
        meta = pd.read_csv(PROCESSED_DIR / f"{split}_meta.csv")
        paths = [str(RAW_DIR / split / r) for r in meta["rel_path"]]
        feats = Parallel(n_jobs=args.jobs, batch_size=32)(delayed(_one)(p) for p in tqdm(paths, desc=split))
        out = np.stack(feats)
        np.save(PROCESSED_DIR / f"{split}_feat.npy", out)
        print(f"{split}: {out.shape}, non-finite: {int((~np.isfinite(out)).sum())}")


if __name__ == "__main__":
    main()
