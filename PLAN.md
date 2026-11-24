# Φ-OTDR Fiber Intrusion Detection — Implementation Plan

Source: *Phi-OTDR_Project_Document.pdf* (Cao et al., Results in Optics 2023, BJTUSensor dataset).
Constraints: **no Docker anywhere**, everything runs natively on Windows (CPU only). UI is **simple but modern and eye-catching**.

---

## 0. Ground rules and environment

| Item | Decision | Why |
|---|---|---|
| Python | **3.12 venv via `uv`** (already installed: `uv` 0.13.8 + CPython 3.12.16) | System Python is 3.15; PyTorch, SHAP and Captum wheels are reliable on 3.12, not guaranteed on 3.15 |
| Node | v26 / npm 11 (installed) | Next.js frontend |
| Containers | **None.** Backend = `uvicorn`, frontend = `npm run dev` / `npm start` | Project requirement |
| One-click run | `run.ps1` at repo root starts backend + frontend in two windows | Easy demo for the viva |
| Hosting (optional) | Frontend → Vercel; Backend → **Render native Python runtime** (build: `pip install -r requirements.txt`, start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`) | Render's Python runtime needs no Dockerfile. Hugging Face Spaces is skipped because FastAPI there needs a Docker Space |
| Git | `git init` in `E:\NGN Project`, push to GitHub later | Deliverable |

Setup commands:

```powershell
uv venv .venv --python 3.12
.\.venv\Scripts\Activate.ps1
uv pip install numpy scipy pandas scikit-learn matplotlib seaborn shap captum jupyter tqdm
uv pip install torch --index-url https://download.pytorch.org/whl/cpu
uv pip install fastapi "uvicorn[standard]" pydantic sqlalchemy python-multipart pytest httpx
```

---

## 1. Repository layout

```
E:\NGN Project\
├── ml/
│   ├── data/raw/{train,test}/        # from Google Drive (git-ignored)
│   ├── data/processed/               # cached .npy (git-ignored)
│   ├── notebooks/01_explore.ipynb, 02_results.ipynb
│   ├── phiotdr/                      # installable package, shared with backend
│   │   ├── config.py                 # class names, paths, DOWNSAMPLE=10, seeds
│   │   ├── data_loader.py            # label.txt + .mat reader, recorder parser
│   │   ├── preprocess.py             # normalise, downsample, augment (ONE source of truth)
│   │   ├── features.py               # SVM features
│   │   ├── models.py                 # CNN2D (baseline), Net1D, CNNBiLSTM, SpecCNN
│   │   ├── train.py                  # CLI: python -m phiotdr.train --model net1d
│   │   ├── evaluate.py               # acc, F1, confusion, NAR, FNR, latency
│   │   └── explain.py                # Grad-CAM / saliency, SHAP
│   ├── models/                       # *.pt, svm.joblib, metrics_*.json
│   └── pyproject.toml                # `uv pip install -e ml`
├── backend/
│   ├── app/{main.py, schemas.py, db.py, settings.py}
│   ├── app/routers/{predict,samples,explain,stream,metrics,events}.py
│   ├── app/services/{inference.py, explainer.py, streamer.py}
│   ├── tests/
│   └── requirements.txt
├── frontend/                         # Next.js (App Router, TS, Tailwind, shadcn/ui)
├── results/                          # figures + tables for the report
├── run.ps1
└── README.md
```

Key design choice: **`ml/phiotdr` is an installable package** imported by both training and the backend, so preprocessing at inference is byte-for-byte the same as in training (the most common source of "works in notebook, wrong in app" bugs).

---

## 2. Phase 1 — Data (Week 1)

**Tasks**
1. Download `train/` and `test/` + both `label.txt` from the Google Drive folder linked in `BJTUSensor/Phi-OTDR_dataset_and_codes` (manual download, or `gdown --folder`). Fallback: Baidu mirror (code `morv`) or a balanced subset of ~2,000/class.
2. Also clone the authors' repo into `ml/reference/` to read their SVM/CNN code and their exact **NAR / FNR definitions**.
3. `data_loader.py`
   - Parse `label.txt` → DataFrame `[path, label, split, recorder, date]`.
   - Recorder = regex `^(\d{6})_([a-z]+)_` on the filename (e.g. `220112_cxm_...` → date `220112`, recorder `cxm`).
   - `scipy.io.loadmat(f)["data"]` → assert shape `(10000, 12)`, dtype `uint16`, no NaN.
4. `scripts/verify_dataset.py`: read every file, log corrupt/mismatched ones to `results/bad_files.csv`, print per-class × per-split × per-recorder counts (settles 15,419 vs 15,612).
5. `preprocess.py`
   - `uint16 → float32`, per-sample z-score (mean/std over the whole 10000×12 block, plus a per-channel option to compare).
   - Downsample time 10,000 → 1,000 by mean-pooling (factor 10). Keep factor in `config.py` so 2,000 can be tried.
   - Cache: `processed/{train,test}_X.npy` (N×12×1000 float16 to save disk), `_y.npy`, `_meta.parquet`.
   - Validation = stratified 10% of train (fixed seed 42).
6. Exploration notebook: one example per class (line plots of 12 channels + waterfall image), per-class std per fiber point, average spectra per class → figures in `results/`.

**Done when**: cache files exist, counts table is in `results/dataset_summary.csv`, and one figure per class is saved.

---

## 3. Phase 2 — Baselines (Week 2)

### 3.1 SVM (target ≈ 82.6%)
- Features per fiber point (12 points): std, energy, peak-to-peak, zero-crossing rate, kurtosis, and FFT energy in 4–5 bands → ~96 features. Computed on the **full-resolution** signal (it's cheap).
- `StandardScaler` + `SVC(kernel="rbf", probability=True)`, `GridSearchCV` over `C ∈ {1,10,100}`, `gamma ∈ {scale, 0.01, 0.001}`, 5-fold.
- Save `models/svm.joblib`, `models/metrics_svm.json`.

### 3.2 2D CNN (target ≈ 94.0%)
- Input `1×12×1000`. 3 blocks of `Conv2d(3×5) → BN → ReLU → MaxPool(1×4)`, then global average pool → Dropout(0.3) → Linear(6).
- Adam (lr 1e-3), cross-entropy, batch 64, ≤40 epochs, early stopping (patience 6) on val accuracy, `ReduceLROnPlateau`.
- `torch.set_num_threads(os.cpu_count())`; expect a few minutes per epoch on CPU. Fallback: downsample factor 20, or Colab.

**Done when**: both models have test accuracy, per-class P/R/F1, confusion matrix PNG, NAR, FNR in JSON.

---

## 4. Phase 3 — Improved model (Week 3)

All candidates share one training loop (`train.py --model X`) and are evaluated on the same official test split.

| Candidate | Sketch | Expected params |
|---|---|---|
| **Net1D** (primary) | 12 fiber points as channels → 4 × [Conv1d(k=7) → BN → GELU → MaxPool(2)] widths 32-64-96-128 → GAP → Dropout → Linear(6) | ~0.15 M |
| CNN-BiLSTM | Net1D first 3 blocks → BiLSTM(64) over time → attention pooling → Linear | ~0.25 M |
| Spectrogram-CNN | STFT per point (nperseg 128) → 12-channel time-freq image → small 2D CNN | ~0.3 M |

- **Augmentation** (train only): random circular time shift, Gaussian noise (σ≈0.05), amplitude scale (0.8–1.2), random channel flip (reverse fiber direction), random crop + resize.
- **Class-weighted loss with extra weight on `dig`** to push digging FNR down (ties to novelty).
- Track: accuracy, macro-F1, dig FNR, param count, CPU latency (median of 100 single-sample runs).
- Acceptance: **> 94.0% acc, < 1 M params, < 50 ms/sample on CPU**. If not met: report honestly and lean on size/speed/explainability.
- Export winner: `models/net1d.pt` (state_dict) + `models/net1d.json` (class names, downsample factor, normalisation mode).

---

## 5. Phase 4 — Extensions (Week 4, first half)

### 5.1 Cross-recorder test
- Leave-recorder(s)-out: group by `recorder`, use `GroupKFold` (or hold out 2 recorders that cover all 6 classes — check coverage first from the counts table).
- Run SVM, CNN2D and Net1D; table: standard-split acc vs cross-recorder acc → `results/cross_recorder.csv`.

### 5.2 Explainability
- **Grad-CAM** (Captum `LayerGradCam` on Net1D's last conv) → time-importance curve, upsampled to 1000; combine with **Integrated Gradients / saliency** for a 12 × T importance map.
- **SHAP** (`KernelExplainer` on ~100 background samples, or `TreeExplainer` on a surrogate) on SVM features → global bar chart of top features.
- Save example figures per class into `results/explain/`.

---

## 6. Phase 5 — Backend: FastAPI (Week 4, second half)

**Startup** (`lifespan`): load Net1D (+ SVM and CNN2D for the comparison page), `model.eval()`, `torch.set_num_threads(2)`, load test-set metadata, create SQLite tables.

**Endpoints**

| Endpoint | Details |
|---|---|
| `POST /api/predict` | multipart `.mat` (≤ 2 MB, validate key `data` and shape 10000×12) → `{class, label, confidences[6], alert_level, latency_ms, top_point}`; also writes an event row |
| `GET /api/samples?cls=&limit=` | test-set sample list `{id, file, true_label, recorder}` |
| `GET /api/samples/{id}` | downsampled signal for plotting (12 × 500, rounded floats) |
| `GET /api/explain/{id}` | importance map (12 × 100) + per-point importance (12) + predicted class |
| `WS /api/stream` | live feed (see below) |
| `GET /api/metrics` | per-model acc, F1, confusion matrix, NAR, FNR, params, latency, cross-recorder acc (from `metrics_*.json`) |
| `GET /api/events?cls=&since=&limit=` | event history from SQLite |
| `GET /api/health` | model loaded, version |

**Alert levels**: `critical` = dig; `warning` = knock, shake; `info` = walk, water; `normal` = background. Threat requires confidence ≥ 0.6, else `uncertain`.

**WebSocket stream design** (keeps the browser fast):
- Server picks a test sample (shuffled, weighted so threats appear every ~20–30 s), splits its downsampled 12×1000 signal into 20 frames of 12×50, sends one frame every ~150 ms: `{"type":"frame","sample_id","frame_idx","values":[[...]]}`.
- After the last frame: run inference, send `{"type":"prediction", ...}` and persist the event.
- Client messages: `{"cmd":"pause"|"resume"|"speed","value":2}`.

**Other**: Pydantic schemas for every response, CORS for `http://localhost:3000` (origin from `.env`), SQLAlchemy model `Event(id, ts, sample_id, source[stream|upload], pred, confidence, alert_level, true_label)`.

**Tests (pytest + httpx/TestClient)**: health, predict with a real sample and with a bad file (400), samples/explain shape checks, metrics schema, websocket receives frames then a prediction.

Run: `uvicorn app.main:app --reload --port 8000` → Swagger at `http://localhost:8000/docs`.

---

## 7. Phase 6 — Frontend: Next.js (Weeks 5–6)

### 7.1 Stack
Next.js (App Router, TypeScript) · Tailwind CSS · shadcn/ui (Card, Badge, Button, Table, Tabs, Select, Tooltip) · Recharts · lucide-react icons · Sonner toasts · TanStack Query · native WebSocket · HTML `<canvas>` for the heatmap · `framer-motion` only for the alert banner and card transitions.

### 7.2 Visual design — "simple, modern, eye-catching"
One look, applied everywhere; few elements, each polished.

- **Theme**: dark control-room. Background `#070B12` with a very faint radial cyan glow at the top and a subtle grid pattern (CSS only). Cards: `#0E1420`, 1px border `white/6%`, 16px radius, soft inner highlight on top edge.
- **Accent**: electric cyan `#22D3EE` (fiber light) for primary actions and the live signal.
- **Status colours**: safe emerald `#10B981`, warning amber `#F59E0B`, critical rose `#F43F5E`, info sky `#38BDF8`.
- **Fixed class colours** used in every chart/badge: background slate, dig rose, knock amber, water sky, shake violet, walk emerald.
- **Type**: Geist Sans (or Inter) for UI, **Geist Mono / JetBrains Mono for numbers** (confidence, latency, timestamps) with `tabular-nums`.
- **Heatmap colour map**: perceptual (inferno/magma) — dark→orange→yellow, which reads instantly as "hot = vibration".
- **Motion, used sparingly**: pulsing "LIVE" dot, glowing node on the fiber route at the most active point, alert banner slides down with a red glow pulse; nothing else animates.
- **Layout**: slim left sidebar (icons + labels, collapses to bottom tab bar on mobile), top bar with system status pill (`● System nominal` / `● THREAT: Digging`), live clock, backend connection indicator.
- Accessibility: status is never colour-only (icon + text), focus rings visible, contrast ≥ 4.5:1.

### 7.3 Pages

1. **`/` Live Monitor** (the hero screen)
   - Top: KPI strip — events today, threats today, last alert, model latency.
   - Left (2/3): **waterfall heatmap** on canvas — 12 rows (fiber points), time scrolls right→left as frames arrive; ImageData buffer shifted per frame (no re-render of React tree).
   - Right (1/3): **Prediction card** — big class name + icon, confidence ring, 6 confidence bars in class colours, alert badge, latency.
   - Bottom: **Fiber route** — SVG cable path (gentle curve) with 12 sensing nodes, labelled 0–120 m; node size/glow = current energy; strongest node highlighted.
   - Side list: last 8 detections (live).
   - Controls: Pause / Resume / Speed 1×-2×-4×, Sound on/off.
   - **Alert**: for dig/knock/shake → full-width red banner + Sonner toast + short WebAudio beep (beep generated in code, no file download); green "All clear" for background.
2. **`/analyze`** — drag-and-drop `.mat` (or "pick a test sample" dropdown) → prediction card + signal plot + **Grad-CAM overlay** (heatmap with importance mask on top, and a per-point importance bar).
3. **`/events`** — table (time, class badge, confidence, alert level, source), filter chips by class, time range select, CSV export button.
4. **`/models`** — model comparison: grouped bar chart (Accuracy, Macro-F1), NAR/FNR bars with digging FNR highlighted, params & latency tiles, confusion matrices in tabs (SVM / CNN / Net1D), standard vs cross-recorder chart.
5. **`/about`** (small) — how Φ-OTDR works, 3-step diagram, paper citation. Useful for the viva.

### 7.4 Frontend structure
```
frontend/
├── app/{layout.tsx, page.tsx, analyze/, events/, models/, about/}
├── components/{Sidebar, TopBar, Heatmap, FiberRoute, PredictionCard,
│              ConfidenceBars, AlertBanner, EventTable, ModelCharts, Dropzone}
├── lib/{api.ts, ws.ts (auto-reconnect + backoff), classes.ts (names, colours, icons), sound.ts}
└── .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Done when**: all pages work against the local backend, live feed runs 10 minutes without lag or memory growth, layout works at 375 px and 1440 px.

---

## 8. Phase 7 — Integration, polish, write-up (Week 7)

1. `run.ps1`: activates `.venv`, starts uvicorn in one window and `npm run dev` (or `npm run build && npm start` for the demo) in another, opens the browser.
2. End-to-end checklist: upload each class → correct alert; stream shows a digging alert; events persist across restart; `/docs` lists all endpoints.
3. Optional deploy: Vercel (frontend) + Render Python runtime (backend, model files committed or downloaded at build). Keep the local demo as the primary one; record a 2-minute screen capture as backup.
4. README with screenshots, setup steps, results table.
5. Report (results tables + figures from `results/`) and viva slides.

---

## 9. Milestones and minimum demo

| Week | Milestone | Exit check |
|---|---|---|
| 1 | Dataset verified + cached | counts table, per-class figures |
| 2 | SVM ≈ 82.6%, CNN ≈ 94.0% | metrics JSON + confusion matrices |
| 3 | Net1D > 94% (goal), < 1 M params | comparison table |
| 4 | Cross-recorder + explainability; API with tests | `pytest` green, `/docs` works |
| 5 | Frontend shell, Analyze, Models pages | upload → prediction works |
| 6 | Live Monitor, alerts, Events | 10-min stream soak test |
| 7 | Report, slides, README, rehearsal | full dry run |

**Minimum viable demo if time runs short**: trained Net1D + `/predict` + `/analyze` page. Live monitor is layered on top.

## 10. Risks specific to this machine

| Risk | Mitigation |
|---|---|
| Python 3.15 lacks torch/shap wheels | Use the uv 3.12 venv (already available) |
| ~2.5 GB dataset on Drive is slow / quota-limited | Download per class folder; Baidu mirror; balanced subset |
| CPU training slow | downsample ×10–×20, float16 cache, `num_workers=0` on Windows with in-memory arrays |
| Windows path issues in `label.txt` (leading `/`) | normalise with `pathlib`, strip leading slash |
| Free backend host sleeps | local demo is primary |
