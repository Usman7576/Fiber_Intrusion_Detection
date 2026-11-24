# Φ-OTDR Fiber Intrusion Detection

Machine-learning detection of digging and other activity near buried fiber cables, using the open
Φ-OTDR dataset of Cao et al. (*Results in Optics*, 2023). See [PLAN.md](PLAN.md) for the full plan.

No Docker: everything runs natively on Windows, CPU only.

## Setup

Requires [uv](https://docs.astral.sh/uv/) (provides Python 3.12) and Node.js 18+.

```powershell
uv venv .venv --python 3.12
.\.venv\Scripts\Activate.ps1
uv pip install torch --index-url https://download.pytorch.org/whl/cpu
uv pip install -r requirements.txt
uv pip install -e ml
```

## Dataset

1. Open the Google Drive folder linked from
   [BJTUSensor/Phi-OTDR_dataset_and_codes](https://github.com/BJTUSensor/Phi-OTDR_dataset_and_codes)
   (Baidu mirror code `morv`).
2. Put the two folders so the layout is:

```
ml/data/raw/train/label.txt   ml/data/raw/train/01_background/*.mat ... 06_walk/
ml/data/raw/test/label.txt    ml/data/raw/test/01_background/*.mat  ...
```

3. Verify and cache:

```powershell
python ml/scripts/verify_dataset.py
python ml/scripts/build_cache.py
```

`verify_dataset.py` writes per-class and per-recorder counts and a list of bad files to `results/`.
`build_cache.py` writes `ml/data/processed/{train,test}_X.npy` (N × 12 × 1000) plus labels and metadata.

## Tests

```powershell
pytest ml/tests
```
