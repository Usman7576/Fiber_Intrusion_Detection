"""Read label.txt files and .mat samples from the BJTUSensor Phi-OTDR dataset.

Expected layout (official split from the authors' Google Drive):

    ml/data/raw/
        train/label.txt  train/01_background/*.mat  ...  train/06_walk/*.mat
        test/label.txt   test/01_background/*.mat   ...

Each label.txt line looks like:
    /01_background/220112_cxm_background_01_single_data_1.mat 0
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.io import loadmat

from .config import CLASS_NAMES, MAT_KEY, NUM_POINTS, RAW_DIR, RAW_TIME

# 220112_cxm_background_01_single_data_1.mat -> date=220112, recorder=cxm
_NAME_RE = re.compile(r"^(?P<date>\d{6})_(?P<recorder>[A-Za-z]+)_")


class SampleError(ValueError):
    """Raised when a .mat file is missing, unreadable or has the wrong shape."""


def parse_filename(name: str) -> dict:
    """Extract recording date and recorder initials from a sample file name."""
    m = _NAME_RE.match(Path(name).name)
    if not m:
        return {"date": None, "recorder": "unknown"}
    return {"date": m["date"], "recorder": m["recorder"].lower()}


def read_label_file(split_dir: Path) -> pd.DataFrame:
    """Parse <split_dir>/label.txt into a DataFrame.

    Columns: rel_path, path, label, class_name, file, date, recorder, split.
    Falls back to scanning class folders if label.txt is missing.
    """
    split_dir = Path(split_dir)
    label_file = split_dir / "label.txt"
    rows = []
    if label_file.exists():
        for line_no, raw in enumerate(label_file.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            line = raw.strip()
            if not line:
                continue
            parts = line.rsplit(maxsplit=1)
            if len(parts) != 2 or not parts[1].lstrip("-").isdigit():
                raise ValueError(f"{label_file}:{line_no}: cannot parse line {raw!r}")
            rel, label = parts[0].replace("\\", "/").lstrip("/"), int(parts[1])
            rows.append((rel, label))
    else:
        for label, folder in enumerate(_class_folders(split_dir)):
            for f in sorted(folder.glob("*.mat")):
                rows.append((f"{folder.name}/{f.name}", label))

    df = pd.DataFrame(rows, columns=["rel_path", "label"])
    df["path"] = [str(split_dir / r) for r in df["rel_path"]]
    df["file"] = [Path(r).name for r in df["rel_path"]]
    df["class_name"] = [CLASS_NAMES[i] if 0 <= i < len(CLASS_NAMES) else "invalid" for i in df["label"]]
    meta = pd.DataFrame([parse_filename(f) for f in df["file"]])
    df = pd.concat([df, meta], axis=1)
    df["split"] = split_dir.name
    return df


def _class_folders(split_dir: Path) -> list[Path]:
    folders = sorted(p for p in split_dir.iterdir() if p.is_dir())
    if len(folders) != len(CLASS_NAMES):
        raise ValueError(f"expected {len(CLASS_NAMES)} class folders in {split_dir}, found {len(folders)}")
    return folders


def load_index(raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    """Index of every sample in train/ and test/ with labels and metadata."""
    frames = [read_label_file(Path(raw_dir) / s) for s in ("train", "test") if (Path(raw_dir) / s).exists()]
    if not frames:
        raise FileNotFoundError(f"no train/ or test/ folder under {raw_dir}")
    return pd.concat(frames, ignore_index=True)


def load_mat(source, key: str = MAT_KEY) -> np.ndarray:
    """Load one sample as a (RAW_TIME, NUM_POINTS) uint16/float array.

    `source` may be a path or a binary file-like object (used by the /predict upload).
    """
    try:
        mat = loadmat(source)
    except Exception as exc:  # scipy raises several types for bad files
        raise SampleError(f"not a readable .mat file: {exc}") from exc
    if key not in mat:
        keys = [k for k in mat if not k.startswith("__")]
        raise SampleError(f"variable {key!r} not found (found {keys})")
    arr = np.asarray(mat[key])
    if arr.shape == (NUM_POINTS, RAW_TIME):
        arr = arr.T
    if arr.shape != (RAW_TIME, NUM_POINTS):
        raise SampleError(f"expected shape ({RAW_TIME}, {NUM_POINTS}), got {arr.shape}")
    if not np.all(np.isfinite(arr)):
        raise SampleError("sample contains NaN or infinite values")
    return arr
