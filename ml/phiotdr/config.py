"""Central configuration: class names, paths, preprocessing constants.

Everything that must match between training and inference lives here.
"""

from pathlib import Path

# ---------------------------------------------------------------- paths
ML_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ML_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
MODELS_DIR = ML_ROOT / "models"
# Model served by the backend: ml/models/<DEPLOYED_RUN>.pt + .json (the .json records its normalisation mode).
# Chosen in Phase 4 on held-out sessions/days, see results/cross_session.md.
DEPLOYED_RUN = "net1d_dig2_chnorm"
RESULTS_DIR = ML_ROOT.parent / "results"

# ---------------------------------------------------------------- classes
# Label index -> (folder name, display name). Matches the dataset's label.txt.
CLASSES = [
    ("01_background", "background"),
    ("02_dig", "dig"),
    ("03_knock", "knock"),
    ("04_water", "water"),
    ("05_shake", "shake"),
    ("06_walk", "walk"),
]
CLASS_FOLDERS = [c[0] for c in CLASSES]
CLASS_NAMES = [c[1] for c in CLASSES]
CLASS_LABELS = {name: i for i, name in enumerate(CLASS_NAMES)}
NUM_CLASSES = len(CLASSES)

# Threat grouping used for NAR / FNR and alert levels.
THREAT_CLASSES = {"dig", "knock", "shake"}
ALERT_LEVELS = {
    "dig": "critical",
    "knock": "warning",
    "shake": "warning",
    "walk": "info",
    "water": "info",
    "background": "normal",
}

# ---------------------------------------------------------------- signal
RAW_TIME = 10_000          # light pulses per sample
NUM_POINTS = 12            # sensing points along the fiber
MAT_KEY = "data"           # variable name inside each .mat file
DOWNSAMPLE = 10            # mean-pool factor -> 1,000 time steps
TIME_STEPS = RAW_TIME // DOWNSAMPLE
NORMALISE = "sample"       # "sample" (one mean/std per sample) or "channel" (per fiber point)

# ---------------------------------------------------------------- training
SEED = 42
VAL_FRACTION = 0.10
