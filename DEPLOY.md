# Deploying FiberGuard (optional, no Docker)

The local demo (`.\run.ps1 -Prod`) is the primary one. The hosted copy is a backup and a shareable link.
Free hosts sleep when idle: the first request after a pause can take ~1 minute while the backend wakes up.

| Part | Host | What runs |
|---|---|---|
| Backend (FastAPI + PyTorch, CPU) | [Render](https://render.com) native Python runtime, free plan | `uvicorn app.main:app` from `render.yaml` |
| Frontend (Next.js) | [Vercel](https://vercel.com), Hobby plan | `next build` / `next start`, root directory `frontend` |

Everything the backend needs is in the repository: the trained model (`ml/models/`), the 324-sample demo pack
(`backend/app/data/`, 7.6 MB) and the metrics (`results/`). The 2 GB dataset is **not** needed.

## 1. Backend on Render

1. Sign in to Render with GitHub and give it access to `Fiber_Intrusion_Detection`.
2. **New → Blueprint**, pick the repository. Render reads [`render.yaml`](render.yaml):
   - build: `pip install -r backend/requirements.txt` (CPU-only PyTorch + the shared `ml/` package)
   - start: `uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT`
   - health check: `/api/health`
3. When asked for `FIBER_CORS_ORIGINS`, enter the frontend URL from step 2 below (you can add it later under
   **Environment** and redeploy). Several origins are comma-separated.
4. Wait for the first build (~5–8 min, mostly PyTorch). Open `https://<service>.onrender.com/docs` to check.

Notes
- The event history is a SQLite file on the instance's disk. On the free plan it is reset when the service restarts
  or redeploys. Fine for a demo; a paid disk or Postgres would keep it.
- **Memory is tight on the free plan (512 MB).** Installed exactly as Render does (fresh venv,
  `pip install -r backend/requirements.txt`, the `render.yaml` start command, `FIBER_TORCH_THREADS=1`), the API used
  about **420 MB, peaking near 460 MB** while serving predictions, explanations and metrics. That was measured on Windows;
  Linux usually needs less for PyTorch, but there is little headroom. If Render reports "out of memory":
  set `FIBER_LOAD_SVM=0` and `FIBER_BASELINE_RUN=` (empty) to skip the two comparison models, or use the Starter plan.

## 2. Frontend on Vercel

1. Sign in to Vercel with GitHub, **Add New → Project**, import the repository.
2. Set **Root Directory** to `frontend`. Framework preset: Next.js (detected).
3. Environment variable: `NEXT_PUBLIC_API_URL = https://<service>.onrender.com` (no trailing slash).
4. Deploy. Then put the Vercel URL (e.g. `https://fiberguard.vercel.app`) into Render's `FIBER_CORS_ORIGINS`.

The live feed uses a WebSocket to `wss://<service>.onrender.com/api/stream`; Render supports WebSockets on web services.

## 3. Check

```powershell
python backend/scripts/e2e_check.py --api https://<service>.onrender.com --web https://<project>.vercel.app --skip-stream
```

Uploads need the raw dataset locally (step 2 of the check); without it those checks are reported as missing data.
