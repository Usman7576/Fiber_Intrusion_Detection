"""Preprocess every sample once and cache it as .npy so training never re-reads 15k .mat files.

Usage:
    python ml/scripts/build_cache.py [--raw-dir ml/data/raw] [--factor 10]

Writes to ml/data/processed/:
    train_X.npy, test_X.npy   float16, shape (N, 12, 10000 // factor)
    train_y.npy, test_y.npy   int64 labels
    train_meta.csv, test_meta.csv   file, label, recorder, date (+ is_val column for train)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phiotdr.config import DOWNSAMPLE, PROCESSED_DIR, RAW_DIR, SEED, VAL_FRACTION  # noqa: E402
from phiotdr.data_loader import SampleError, load_index, load_mat  # noqa: E402
from phiotdr.preprocess import preprocess  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    ap.add_argument("--out-dir", type=Path, default=PROCESSED_DIR)
    ap.add_argument("--factor", type=int, default=DOWNSAMPLE)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    index = load_index(args.raw_dir)
    for split, df in index.groupby("split"):
        X, keep = [], []
        for i, row in enumerate(tqdm(df.itertuples(), total=len(df), desc=split)):
            try:
                X.append(preprocess(load_mat(row.path), factor=args.factor).astype(np.float16))
                keep.append(i)
            except (SampleError, FileNotFoundError) as exc:
                print(f"skip {row.path}: {exc}")
        meta = df.iloc[keep][["file", "rel_path", "label", "class_name", "recorder", "date"]].reset_index(drop=True)
        if split == "train":
            _, val_idx = train_test_split(meta.index, test_size=VAL_FRACTION, stratify=meta["label"], random_state=SEED)
            meta["is_val"] = meta.index.isin(val_idx)
        np.save(args.out_dir / f"{split}_X.npy", np.stack(X))
        np.save(args.out_dir / f"{split}_y.npy", meta["label"].to_numpy(np.int64))
        meta.to_csv(args.out_dir / f"{split}_meta.csv", index=False)
        print(f"{split}: {len(X)} samples -> {args.out_dir / f'{split}_X.npy'} shape {np.stack(X[:1]).shape[1:]}")


if __name__ == "__main__":
    main()
