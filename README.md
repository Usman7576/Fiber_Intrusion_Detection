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

## Backend (FastAPI)

The API runs without the dataset: it ships the trained model (`ml/models/`) and a 7.6 MB pack of 324 official-test
samples (`backend/app/data/`, rebuilt with `python backend/scripts/build_demo_pack.py`).

```powershell
cd backend
uvicorn app.main:app --reload --port 8000
```

Swagger UI: <http://localhost:8000/docs>. Endpoints (all under `/api`):

| Endpoint | What it does |
|---|---|
| `GET /health` | model loaded, sample count, events stored |
| `POST /predict` | upload a dataset `.mat` (variable `data`, 10000 x 12, max 2 MB) -> class, confidences, alert level, signal, comparison with the SVM and paper CNN, optional explanation; stored as an event |
| `GET /samples?cls=&limit=&offset=` | demo samples (official test split) |
| `GET /samples/{id}` | 12 x 500 signal for plotting |
| `GET /samples/{id}/prediction` | classify a demo sample (deployed Net1D, compared with the tuned SVM and the paper CNN) |
| `GET /explain/{id}` | Grad-CAM over time + Integrated-Gradients 12 x 100 map |
| `GET /metrics` | model comparison: official split, unseen sessions, unseen days |
| `GET /events`, `GET /events/stats` | event history (SQLite) |
| `WS /stream` | simulated live fiber feed: frames every 150 ms, a prediction every ~3 s |

Alert levels: `critical` = dig; `warning` = knock, shake; `info` = walk, water; `normal` = background;
`uncertain` when confidence < 0.6. Settings are environment variables or `backend/.env` (copy `backend/.env.example`; see `backend/app/settings.py`), e.g.
`FIBER_CORS_ORIGINS`, `FIBER_DB_PATH`, `FIBER_CONFIDENCE`.

## Frontend (Next.js)

Dark "control room" dashboard: live waterfall of the fiber, alerts with sound, upload/analysis with explanations,
event history with CSV export, and the model comparison. Start the backend first, then:

```powershell
cd frontend
npm install
copy .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                     # http://localhost:3000
```

| Page | What it shows |
|---|---|
| `/` Live Monitor | scrolling waterfall (12 points x time), current prediction with confidence ring, fiber route with the most active point glowing, recent detections, pause / speed / sound controls; threat banner + toast + beep on every page |
| `/analyze` | drop a `.mat` file or pick a test sample: prediction, signal with Integrated-Gradients overlay, Grad-CAM over time, importance per point, Net1D vs SVM vs paper CNN |
| `/events` | event history with class / level / source / time filters, auto-refresh, CSV export |
| `/models` | accuracy and macro-F1, generalisation to unseen sessions and days, error rates, size and speed, confusion matrices |
| `/about` | how Phi-OTDR sensing works, the six classes, key findings, citation |

## Tests

```powershell
pytest ml/tests
cd backend; pytest
cd ../frontend; npm run lint; npm run build
```
