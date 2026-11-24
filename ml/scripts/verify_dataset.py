"""Open every .mat file listed in label.txt and report counts and problems.

Usage:
    python ml/scripts/verify_dataset.py [--raw-dir ml/data/raw]

Writes:
    results/dataset_summary.csv   counts per split x class
    results/recorders.csv         counts per recorder x class (for the cross-recorder test)
    results/bad_files.csv         files that are missing, unreadable or malformed
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phiotdr.config import RAW_DIR, RESULTS_DIR  # noqa: E402
from phiotdr.data_loader import SampleError, load_index, load_mat  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    ap.add_argument("--out-dir", type=Path, default=RESULTS_DIR)
    args = ap.parse_args()

    index = load_index(args.raw_dir)
    print(f"label entries: {len(index)}")

    dupes = index[index.duplicated(["split", "rel_path"], keep=False)]
    bad = [{"path": p, "problem": "duplicate entry in label.txt"} for p in dupes["path"]]
    in_both = set(index.loc[index["split"] == "train", "file"]) & set(index.loc[index["split"] == "test", "file"])
    bad += [{"path": p, "problem": "same file name in train and test (possible leakage)"}
            for p in index.loc[index["file"].isin(in_both), "path"]]
    bad += [{"path": p, "problem": "label out of range"} for p in index.loc[index["class_name"] == "invalid", "path"]]

    ok = []
    for row in tqdm(index.itertuples(), total=len(index), desc="verifying"):
        if not Path(row.path).exists():
            bad.append({"path": row.path, "problem": "file missing"})
            ok.append(False)
            continue
        try:
            load_mat(row.path)
            ok.append(True)
        except SampleError as exc:
            bad.append({"path": row.path, "problem": str(exc)})
            ok.append(False)
    index["ok"] = ok

    args.out_dir.mkdir(parents=True, exist_ok=True)
    good = index[index["ok"]]
    summary = pd.crosstab(good["split"], good["class_name"], margins=True, margins_name="total")
    recorders = pd.crosstab(good["recorder"], good["class_name"], margins=True, margins_name="total")
    summary.to_csv(args.out_dir / "dataset_summary.csv")
    recorders.to_csv(args.out_dir / "recorders.csv")
    pd.DataFrame(bad, columns=["path", "problem"]).to_csv(args.out_dir / "bad_files.csv", index=False)

    print("\nSamples per split and class:\n", summary, sep="")
    print("\nSamples per recorder and class:\n", recorders, sep="")
    print(f"\nreadable: {len(good)} / {len(index)}   problems: {len(bad)} (see {args.out_dir / 'bad_files.csv'})")
    return 0 if not bad else 1


if __name__ == "__main__":
    raise SystemExit(main())
